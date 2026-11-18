import crypto from 'node:crypto';
import os from 'node:os';
import type {
  ConversationMessage,
  InputMode,
  IntegrationType,
  MessageRole,
  ModelDownloadStatus,
  TrokoMood,
} from '../../../shared/types.ts';
import type { TrokoDatabase } from '../db/database.ts';
import type { EventBus } from '../eventBus.ts';
import { AiProviderService } from './aiProvider.ts';
import type { AiChatMessage, AiToolAction } from './aiProvider.ts';
import type { AppLauncherService } from './appLauncherService.ts';
import { BridgeService } from './bridgeService.ts';
import type { HabitService, HabitWithProgress } from './habitService.ts';
import type { MailerService } from './mailerService.ts';
import type { NotesService } from './notesService.ts';
import type { OrganizerService } from './organizerService.ts';
import type { ProductivityService } from './productivityService.ts';
import type { SettingsService } from './settingsService.ts';

const MODEL_ID = 'llama-3.2-3b-instruct-q4-k-m';
const MODEL_NAME = 'Llama 3.2 3B Instruct';
const MODEL_TOTAL_BYTES = 2_020_000_000;
const DEFAULT_CONVERSATION_ID = 'conv-default';

export interface ChatMessageCompat extends ConversationMessage {
  emotion: TrokoMood | null;
  toolAction: Record<string, unknown> | null;
}

export function detectEmotionFromText(text: string): TrokoMood {
  const lower = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (
    /\b(te quiero|te amo|me encantas|enamorad[oa]|corazon|carino)\b/i.test(lower)
  ) {
    return 'enamorado';
  }
  if (
    /\b(logre|orgullos[oa]|terminar|termine|exito)\b/i.test(
      lower
    )
  ) {
    return 'orgulloso';
  }
  if (
    /\b(complete todas mis metas|festej|celebr|cumpli todas|meta cumplida)\b/i.test(
      lower
    )
  ) {
    return 'festejo';
  }
  if (
    /\b(vamos con todo|animo|motivacion|fuerza|a por ello|dale)\b/i.test(lower)
  ) {
    return 'animo';
  }
  if (
    /\b(contarte algo|escuchame|importante|presta atencion)\b/i.test(lower)
  ) {
    return 'escucha';
  }
  if (
    /\b(no lo puedo creer|sorpresa|sorprendid[oa]|increible|wow|asombros[oa])\b/i.test(
      lower
    )
  ) {
    return 'sorpresa';
  }
  if (/\b(secreto|entre nosotros|guino|complice)\b/i.test(lower)) {
    return 'guino';
  }
  if (
    /\b(demasiadas cosas|maread[oa]|confundid[oa]|caos|saturad[oa]|a la vez)\b/i.test(
      lower
    )
  ) {
    return 'mareado';
  }
  if (
    /\b(que sueno|buenas noches|cansad[oa]|dormir|bostezo|descansa)\b/i.test(lower)
  ) {
    return 'bostezo';
  }
  if (
    /\b(frustrad[oa]|molest[oa]|error|enojad[oa]|rabia|maldicion|falla)\b/i.test(lower)
  ) {
    return 'molesto';
  }
  if (/\b(hola|buenos dias|buenas tardes|saludos|hey)\b/i.test(lower)) {
    return 'saludo';
  }
  if (/\b(gracias|todo salio bien|bien|genial|excelente|content[oa]|feliz)\b/i.test(lower)) {
    return 'contento';
  }
  return 'contento';
}

function buildOfflineEmotionReply(emotion: TrokoMood, userText: string): string {
  switch (emotion) {
    case 'saludo':
      return '¡Hola! Qué alegría verte por aquí. Estoy listo en tu isla para ayudarte con tareas, hábitos, enfoque o lo que necesites.';
    case 'enamorado':
      return '¡Qué detalle tan bonito! Yo también disfruto muchísimo acompañarte cada día en tu escritorio.';
    case 'orgulloso':
      return '¡Qué gran logro! Deberías sentirte muy orgulloso del esfuerzo que pusiste para terminar el proyecto.';
    case 'festejo':
      return '¡Increíble, completaste todas tus metas! Vamos a celebrarlo como se merece.';
    case 'animo':
      return '¡Así se habla! Vamos con toda la energía hoy, paso a paso.';
    case 'escucha':
      return 'Te escucho con toda mi atención. Cuéntame qué tienes en mente.';
    case 'sorpresa':
      return '¡Guau, qué sorpresa! Eso sí que no me lo esperaba.';
    case 'guino':
      return 'Trato hecho, queda en secreto entre nosotros.';
    case 'mareado':
      return 'Respiremos un segundo; cuando hay demasiadas cosas a la vez, podemos anotarlas en tareas una por una.';
    case 'bostezo':
      return 'Parece que ha sido un día largo. Descansa bien, yo cuidaré tus notas hasta mañana.';
    case 'molesto':
      return 'Entiendo tu frustración con ese error. Si quieres, lo revisamos por partes con calma.';
    case 'contento':
    default:
      return `¡Claro! Puedo ayudarte con tus tareas, hábitos, sesiones de enfoque y recordatorios («${userText.slice(0, 60)}»).`;
  }
}

export class NluService {
  private readonly db: TrokoDatabase;
  private readonly eventBus: EventBus;
  private readonly settingsService: SettingsService;
  private readonly productivityService: ProductivityService;
  private readonly habitService?: HabitService;
  private readonly notesService?: NotesService;
  private readonly mailerService: MailerService;
  private readonly organizerService: OrganizerService;
  private readonly appLauncherService: AppLauncherService;
  private readonly aiProvider: AiProviderService;
  private readonly bridgeService: BridgeService;

  private downloadStatus: ModelDownloadStatus = 'idle';
  private progressPct = 0;
  private downloadedBytes = 0;
  private downloadTimer: NodeJS.Timeout | null = null;
  private successResetTimer: NodeJS.Timeout | null = null;

  constructor(deps: {
    db: TrokoDatabase;
    eventBus: EventBus;
    settingsService: SettingsService;
    productivityService: ProductivityService;
    habitService?: HabitService;
    notesService?: NotesService;
    mailerService: MailerService;
    organizerService: OrganizerService;
    appLauncherService: AppLauncherService;
    aiProvider?: AiProviderService;
    bridgeService?: BridgeService;
  }) {
    this.db = deps.db;
    this.eventBus = deps.eventBus;
    this.settingsService = deps.settingsService;
    this.productivityService = deps.productivityService;
    this.habitService = deps.habitService;
    this.notesService = deps.notesService;
    this.mailerService = deps.mailerService;
    this.organizerService = deps.organizerService;
    this.appLauncherService = deps.appLauncherService;
    this.aiProvider = deps.aiProvider ?? new AiProviderService();
    this.bridgeService = deps.bridgeService ?? new BridgeService();
  }

  private getIntegration(type: IntegrationType) {
    return (
      this.appLauncherService
        .listIntegrations()
        .find((item) => item.type === type) ?? null
    );
  }

  stop(): void {
    if (this.downloadTimer !== null) {
      clearInterval(this.downloadTimer);
      this.downloadTimer = null;
    }
    if (this.successResetTimer !== null) {
      clearTimeout(this.successResetTimer);
      this.successResetTimer = null;
    }
  }

  resetState(): void {
    this.stop();
    this.downloadStatus = 'idle';
    this.progressPct = 0;
    this.downloadedBytes = 0;
  }

  // ==================== ONBOARDING & MODEL DOWNLOAD ====================

  private syncModelDownloadRow(): void {
    const nowIso = new Date().toISOString();
    this.db.db
      .prepare(
        `INSERT INTO model_downloads (id, model_name, total_bytes, downloaded_bytes, status, local_path, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           downloaded_bytes = excluded.downloaded_bytes,
           status = excluded.status,
           local_path = excluded.local_path,
           updated_at = excluded.updated_at`
      )
      .run(
        MODEL_ID,
        MODEL_NAME,
        MODEL_TOTAL_BYTES,
        this.downloadedBytes,
        this.downloadStatus,
        this.downloadStatus === 'completed'
          ? 'data/models/Llama-3.2-3B-Instruct-Q4_K_M.gguf'
          : null,
        nowIso
      );
  }

  getOnboardingState() {
    const settings = this.settingsService.getSettings();
    return {
      ok: true,
      completed: settings.onboardingCompleted,
      onboardingCompleted: settings.onboardingCompleted,
      modelName: MODEL_NAME,
      quantization: 'Q4_K_M',
      sizeLabel: '2,02 GB',
      totalBytes: MODEL_TOTAL_BYTES,
      downloadedBytes: this.downloadedBytes,
      progressPct: this.progressPct,
      progress: this.progressPct,
      status: this.downloadStatus,
      download: {
        id: MODEL_ID,
        modelName: MODEL_NAME,
        quantization: 'Q4_K_M',
        sizeLabel: '2,02 GB',
        totalBytes: MODEL_TOTAL_BYTES,
        downloadedBytes: this.downloadedBytes,
        progressPct: this.progressPct,
        status: this.downloadStatus,
      },
    };
  }

  private emitOnboardingProgress(): void {
    this.syncModelDownloadRow();
    const state = this.getOnboardingState();
    this.eventBus.publish('data.updated', {
      scope: 'onboarding',
      status: state.status,
      downloadedBytes: state.downloadedBytes,
      totalBytes: state.totalBytes,
      progressPct: state.progressPct,
    });
  }

  startModelDownload() {
    if (this.downloadStatus === 'idle' || this.progressPct === 0) {
      this.progressPct = 15;
      this.downloadedBytes = Math.round((this.progressPct / 100) * MODEL_TOTAL_BYTES);
    }
    this.downloadStatus = 'downloading';
    this.ensureDownloadInterval();
    this.emitOnboardingProgress();
    return this.getOnboardingState();
  }

  pauseModelDownload() {
    if (this.downloadTimer !== null) {
      clearInterval(this.downloadTimer);
      this.downloadTimer = null;
    }
    if (this.progressPct === 0) {
      this.progressPct = 15;
      this.downloadedBytes = Math.round((this.progressPct / 100) * MODEL_TOTAL_BYTES);
    }
    this.downloadStatus = 'paused';
    this.emitOnboardingProgress();
    return this.getOnboardingState();
  }

  resumeModelDownload() {
    if (this.progressPct === 0) {
      this.progressPct = 15;
      this.downloadedBytes = Math.round((this.progressPct / 100) * MODEL_TOTAL_BYTES);
    }
    this.downloadStatus = 'downloading';
    this.ensureDownloadInterval();
    this.emitOnboardingProgress();
    return this.getOnboardingState();
  }

  private ensureDownloadInterval(): void {
    if (this.downloadTimer !== null) {
      clearInterval(this.downloadTimer);
    }
    this.downloadTimer = setInterval(() => {
      if (this.downloadStatus !== 'downloading') return;
      this.progressPct = Math.min(100, this.progressPct + 5);
      this.downloadedBytes = Math.round((this.progressPct / 100) * MODEL_TOTAL_BYTES);
      if (this.progressPct >= 100) {
        this.downloadStatus = 'completed';
        if (this.downloadTimer !== null) {
          clearInterval(this.downloadTimer);
          this.downloadTimer = null;
        }
      }
      this.emitOnboardingProgress();
    }, 150);
    this.downloadTimer.unref();
  }

  completeOnboarding(skipped = false) {
    if (this.downloadTimer !== null) {
      clearInterval(this.downloadTimer);
      this.downloadTimer = null;
    }
    if (!skipped && this.downloadStatus === 'downloading') {
      this.downloadStatus = 'completed';
      this.progressPct = 100;
      this.downloadedBytes = MODEL_TOTAL_BYTES;
      this.syncModelDownloadRow();
    }
    this.settingsService.patchSettings({ onboardingCompleted: true });
    return {
      ...this.getOnboardingState(),
      ok: true,
      completed: true,
      onboardingCompleted: true,
      skipped,
    };
  }

  // ==================== CHAT HISTORY ====================

  private ensureDefaultConversation(conversationId = DEFAULT_CONVERSATION_ID): string {
    const existing = this.db.db
      .prepare('SELECT id FROM conversations WHERE id = ?')
      .get(conversationId) as Record<string, unknown> | undefined;
    if (!existing) {
      const nowIso = new Date().toISOString();
      this.db.db
        .prepare('INSERT INTO conversations (id, title, created_at) VALUES (?, ?, ?)')
        .run(conversationId, 'Conversación con Troko', nowIso);
    }
    return conversationId;
  }

  private mapMessageRow(row: Record<string, unknown>): ChatMessageCompat {
    let emotion: TrokoMood | null = null;
    let toolAction: Record<string, unknown> | null = null;
    const intentJson = row['intent_json'] != null ? String(row['intent_json']) : null;
    if (intentJson) {
      try {
        const parsed = JSON.parse(intentJson) as Record<string, unknown>;
        if (typeof parsed['emotion'] === 'string') {
          emotion = parsed['emotion'] as TrokoMood;
        }
        if (parsed['toolAction'] && typeof parsed['toolAction'] === 'object') {
          toolAction = parsed['toolAction'] as Record<string, unknown>;
        } else if (typeof parsed['type'] === 'string') {
          toolAction = parsed;
        }
      } catch {
        // Ignore invalid JSON
      }
    }
    return {
      id: String(row['id']),
      conversationId: String(row['conversation_id']),
      role: String(row['role']) as MessageRole,
      content: String(row['content']),
      inputMode: (row['input_mode'] != null
        ? String(row['input_mode'])
        : 'text') as InputMode,
      intentJson,
      emotion,
      toolAction,
      createdAt: String(row['created_at']),
    };
  }

  listMessages(): ChatMessageCompat[] {
    const rows = this.db.db
      .prepare('SELECT * FROM messages ORDER BY created_at ASC, rowid ASC')
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapMessageRow(r));
  }

  clearMessages(): void {
    this.db.db.prepare('DELETE FROM messages').run();
    this.db.db.prepare('DELETE FROM conversations').run();
    this.eventBus.publish('data.updated', { scope: 'chat' });
  }

  private insertMessage(params: {
    conversationId?: string;
    role: MessageRole;
    content: string;
    inputMode?: InputMode;
    emotion: TrokoMood | null;
    toolAction: Record<string, unknown> | null;
  }): ChatMessageCompat {
    const convId = this.ensureDefaultConversation(
      params.conversationId ?? DEFAULT_CONVERSATION_ID
    );
    const id = `msg-${crypto.randomUUID()}`;
    const nowIso = new Date().toISOString();
    const intentPayload =
      params.emotion || params.toolAction
        ? JSON.stringify({
            emotion: params.emotion,
            toolAction: params.toolAction,
            ...(params.toolAction ?? {}),
          })
        : null;

    this.db.db
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content, input_mode, intent_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        convId,
        params.role,
        params.content,
        params.inputMode ?? 'text',
        intentPayload,
        nowIso
      );
    const row = this.db.db
      .prepare('SELECT * FROM messages WHERE id = ?')
      .get(id) as Record<string, unknown>;
    return this.mapMessageRow(row);
  }

  private scheduleSuccessReset(badgeWord: string): void {
    if (this.successResetTimer !== null) {
      clearTimeout(this.successResetTimer);
    }
    this.successResetTimer = setTimeout(() => {
      const current = this.eventBus.getIslandState();
      if (current.state === 'success' && current.badgeWord === badgeWord) {
        this.eventBus.setIslandState({
          state: 'idle',
          mood: 'contento',
          statusText: 'Reposo',
          peekCard: null,
        });
      }
    }, 2500);
    this.successResetTimer.unref();
  }

  private getRecentHistory(
    conversationId: string,
    excludeMessageId: string,
    limit = 6
  ): AiChatMessage[] {
    const rows = this.db.db
      .prepare(
        `SELECT role, content FROM messages
         WHERE conversation_id = ? AND id != ? AND role IN ('user', 'assistant')
         ORDER BY created_at DESC, rowid DESC
         LIMIT ?`
      )
      .all(conversationId, excludeMessageId, limit) as Array<Record<string, unknown>>;

    return rows.reverse().map((r) => ({
      role: String(r['role']) as 'user' | 'assistant',
      content: String(r['content']),
    }));
  }

  private normalizeForMatch(s: string): string {
    return s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private findMatchingHabit(phrase: string): HabitWithProgress | null {
    if (!this.habitService) return null;
    const normPhrase = this.normalizeForMatch(phrase);
    if (!normPhrase) return null;
    const habits = this.habitService.listHabits();
    for (const h of habits) {
      const normName = this.normalizeForMatch(h.name);
      const normUnit = this.normalizeForMatch(h.unitLabel);
      if (
        normName &&
        (normPhrase.includes(normName) || normName.includes(normPhrase))
      ) {
        return h;
      }
      const nameWords = normName.split(/\s+/).filter((w) => w.length >= 4);
      if (nameWords.some((w) => normPhrase.includes(w))) {
        return h;
      }
      if (normUnit.length >= 4 && normPhrase.includes(normUnit)) {
        return h;
      }
    }
    return null;
  }

  private findPendingTask(phrase: string) {
    const normPhrase = this.normalizeForMatch(phrase);
    if (!normPhrase) return null;
    const pending = this.productivityService
      .listTasks()
      .filter((t) => !t.completed);
    let bestMatch = null as (typeof pending)[number] | null;
    let bestScore = 0;

    for (const t of pending) {
      const normTitle = this.normalizeForMatch(t.title);
      if (normTitle === normPhrase) return t;
      if (normTitle.includes(normPhrase) || normPhrase.includes(normTitle)) {
        const score = Math.min(normTitle.length, normPhrase.length) + 10;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = t;
        }
        continue;
      }
      const words = normPhrase.split(/\s+/).filter((w) => w.length >= 3);
      const overlap = words.filter((w) => normTitle.includes(w)).length;
      if (overlap > bestScore) {
        bestScore = overlap;
        bestMatch = t;
      }
    }
    return bestMatch;
  }

  private executeAiToolAction(action: AiToolAction): Record<string, unknown> | null {
    const settings = this.settingsService.getSettings();
    if (action.type === 'create_task' && action.title) {
      const task = this.productivityService.createTask(action.title);
      return { type: 'create_task', taskId: task.id, title: task.title };
    }
    if (action.type === 'create_reminder' && action.title) {
      const mins = action.minutes ?? 10;
      const triggerAt = new Date(Date.now() + mins * 60_000).toISOString();
      const rem = this.productivityService.createReminder({
        title: action.title,
        triggerAt,
        recurrence: null,
        soundEnabled: settings.soundEnabled,
      });
      return {
        type: 'create_reminder',
        reminderId: rem.id,
        title: rem.title,
        triggerAt: rem.triggerAt,
      };
    }
    if (action.type === 'start_focus') {
      const mins = action.minutes ?? settings.focusMinutes;
      const focusState = this.productivityService.startFocus({
        durationSec: mins * 60,
        label: action.title || 'Enfoque',
      });
      return {
        type: 'start_focus',
        sessionId: focusState.id,
        durationSec: focusState.durationSec,
      };
    }
    if (action.type === 'create_timer') {
      const durationSec =
        action.seconds ?? (action.minutes ? action.minutes * 60 : 300);
      const timer = this.productivityService.createTimer({
        durationSec,
        label: action.title || `Temporizador`,
      });
      return {
        type: 'create_timer',
        timerId: timer.id,
        durationSec,
      };
    }
    if (action.type === 'log_habit') {
      const hint = action.habitName || action.title || '';
      const matched = this.findMatchingHabit(hint);
      if (matched && this.habitService) {
        const updated = this.habitService.incrementHabit(matched.id);
        return {
          type: 'log_habit',
          habitId: updated.id,
          habitName: updated.name,
          progress: updated.todayProgress,
          goal: updated.dailyGoal,
        };
      }
    }
    return null;
  }

  async processUserMessage(
    rawMessage: string,
    inputMode: InputMode = 'text',
    conversationId?: string
  ): Promise<{
    ok: true;
    userMessage: ChatMessageCompat;
    assistantMessage: ChatMessageCompat;
    reply: string;
    emotion: TrokoMood;
    toolAction: Record<string, unknown> | null;
    island: ReturnType<EventBus['getIslandState']>;
  }> {
    const trimmed = rawMessage.trim();
    const userMessage = this.insertMessage({
      conversationId,
      role: 'user',
      content: trimmed,
      inputMode,
      emotion: null,
      toolAction: null,
    });

    // Brief think transition
    this.eventBus.setIslandState({
      state: 'think',
      mood: 'escucha',
      statusText: 'Pensando',
    });

    let replyText = '';
    let emotion: TrokoMood = 'contento';
    let toolAction: Record<string, unknown> | null = null;

    const relRemMatch =
      /^(?:troko[,\s]+)?(?:recu[eé]rdame|recordame|acordame|av[ií]same|remind\s+me)(?:\s+que)?\s+en\s+(\d+)\s*(segundos?|seg|s|minutos?|min|m|horas?|hrs?|h)\b(?:\s+(?:de|que|a))?\s+(.+)$/i.exec(
        trimmed
      );
    const relRemAltMatch =
      /^(?:troko[,\s]+)?(?:recu[eé]rdame|recordame|acordame|av[ií]same|remind\s+me)\s+(.+?)\s+en\s+(\d+)\s*(segundos?|seg|s|minutos?|min|m|horas?|hrs?|h)\s*[.!]?$/i.exec(
        trimmed
      );
    const clockRemMatch =
      /^(?:troko[,\s]+)?(?:recu[eé]rdame|recordame|acordame|av[ií]same)\s+a\s+las\s+(\d{1,2})(?::(\d{2}))?(?:\s*(?:hs?|horas?|de\s+la\s+(?:ma[ñn]ana|tarde|noche)))?\s+(?:que\s+|de\s+)?(.+)$/i.exec(
        trimmed
      );

    // 1. Sleep command ("Troko, descansa" / "Descansa")
    if (
      /^(?:troko[,\s]+)?(?:descansa|duerme|vete\s+a\s+dormir|and[aá]\s+a\s+dormir|modo\s+reposo|a\s+dormir)$/i.test(
        trimmed
      )
    ) {
      emotion = 'bostezo';
      replyText = 'Buenas noches. Entro en modo dormido hasta que me llames.';
      toolAction = { type: 'sleep' };
      this.eventBus.setIslandState({
        state: 'sleep',
        mood: 'bostezo',
        statusText: 'Dormido',
        peekCard: null,
      });
    }
    // 2. Quick Note ("Nota rápida: ..." / "Apunta una nota: ...")
    else if (
      this.notesService &&
      /^(?:troko[,\s]+)?(?:nota\s+r[aá]pida|apunta(?:r|me)?(?:\s+una)?\s+nota|guarda(?:r|me)?(?:\s+una)?\s+nota|anota(?:r|me)?\s+nota)[:\s]+(.+)$/i.test(
        trimmed
      )
    ) {
      const m =
        /^(?:troko[,\s]+)?(?:nota\s+r[aá]pida|apunta(?:r|me)?(?:\s+una)?\s+nota|guarda(?:r|me)?(?:\s+una)?\s+nota|anota(?:r|me)?\s+nota)[:\s]+(.+)$/i.exec(
          trimmed
        );
      const noteContent = (m?.[1] ?? '').trim();
      const note = this.notesService.createNote(noteContent);
      emotion = 'contento';
      replyText = `Nota rápida guardada: «${note.content}».`;
      toolAction = { type: 'create_note', noteId: note.id, content: note.content };
      this.eventBus.setIslandState({
        state: 'success',
        mood: 'contento',
        statusText: 'Listo',
        badgeWord: 'Nota',
        peekCard: null,
      });
      this.scheduleSuccessReset('Nota');
    }
    // 3. Task creation (Spanish + voseo or English)
    else if (
      /^(?:troko[,\s]+)?(?:anot[aá](?:r|me)?(?:\s+una)?(?:\s+tarea)?|agreg[aá](?:r|me)?(?:\s+una)?\s+tarea|cre[aá](?:r|me)?(?:\s+una)?\s+tarea|nueva\s+tarea|add\s+(?:a\s+)?task|create\s+(?:a\s+)?task)[:\s]+(.+)$/i.test(
        trimmed
      )
    ) {
      const match =
        /^(?:troko[,\s]+)?(?:anot[aá](?:r|me)?(?:\s+una)?(?:\s+tarea)?|agreg[aá](?:r|me)?(?:\s+una)?\s+tarea|cre[aá](?:r|me)?(?:\s+una)?\s+tarea|nueva\s+tarea|add\s+(?:a\s+)?task|create\s+(?:a\s+)?task)[:\s]+(.+)$/i.exec(
          trimmed
        );
      const taskTitle = (match?.[1] ?? 'Nueva tarea')
        .replace(/^[:\s"«»]+|["«»]+$/g, '')
        .trim();
      const task = this.productivityService.createTask(taskTitle);
      emotion = 'contento';
      replyText = `Anotado. He agregado la tarea «${task.title}» a tu lista.`;
      toolAction = { type: 'create_task', taskId: task.id, title: task.title };
      this.eventBus.setIslandState({
        state: 'success',
        mood: 'contento',
        statusText: 'Listo',
        badgeWord: 'Anotado',
        peekCard: null,
      });
      this.scheduleSuccessReset('Anotado');
    }
    // 4. Reminders ("Recuérdame en 10 minutos ...", "Avísame a las 18:30 ...")
    else if (relRemMatch || relRemAltMatch || clockRemMatch) {
      let title = 'Recordatorio';
      let triggerDate = new Date(Date.now() + 60_000);
      if (relRemMatch || relRemAltMatch) {
        const amount = Number(relRemMatch ? relRemMatch[1] : relRemAltMatch![2]);
        const unit = (
          relRemMatch ? (relRemMatch[2] ?? 'm') : (relRemAltMatch![3] ?? 'm')
        ).toLowerCase();
        title = (
          relRemMatch ? (relRemMatch[3] ?? 'Recordatorio') : (relRemAltMatch![1] ?? 'Recordatorio')
        ).trim();
        const deltaMs = unit.startsWith('h')
          ? amount * 3600_000
          : unit.startsWith('s')
          ? amount * 1000
          : amount * 60_000;
        triggerDate = new Date(Date.now() + Math.max(1000, deltaMs));
      } else if (clockRemMatch) {
        let hour = Math.min(23, Math.max(0, Number(clockRemMatch[1])));
        const minute = Math.min(59, Math.max(0, Number(clockRemMatch[2] ?? '0')));
        if (/tarde|noche/i.test(trimmed) && hour < 12) {
          hour += 12;
        }
        title = (clockRemMatch[3] ?? 'Recordatorio').trim();
        triggerDate = new Date();
        triggerDate.setHours(hour, minute, 0, 0);
        if (triggerDate.getTime() <= Date.now()) {
          triggerDate.setDate(triggerDate.getDate() + 1);
        }
      }
      const settings = this.settingsService.getSettings();
      const reminder = this.productivityService.createReminder({
        title: title.replace(/[.!]+$/, '').trim() || 'Recordatorio',
        triggerAt: triggerDate.toISOString(),
        recurrence: null,
        soundEnabled: settings.soundEnabled,
      });
      const timeLabel = triggerDate.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
      });
      emotion = 'animo';
      replyText = `Listo, te recordaré «${reminder.title}» a las ${timeLabel}.`;
      toolAction = {
        type: 'create_reminder',
        reminderId: reminder.id,
        title: reminder.title,
        triggerAt: reminder.triggerAt,
      };
      this.eventBus.setIslandState({
        state: 'success',
        mood: 'animo',
        statusText: 'Listo',
        badgeWord: 'Recordatorio',
        peekCard: null,
      });
      this.scheduleSuccessReset('Recordatorio');
    }
    // 5. Task completion ("Terminé comprar pan" / "Completa la tarea revisar informe")
    else if (
      /^(?:troko[,\s]+)?(?:termin[eé](?:\s+de)?|complet[eé]|completa(?:r)?(?:\s+la\s+tarea)?|marca(?:r)?\s+(?:como\s+)?(?:hecha|completada)|ya\s+hice)\s+(.+)$/i.test(
        trimmed
      )
    ) {
      const m =
        /^(?:troko[,\s]+)?(?:termin[eé](?:\s+de)?|complet[eé]|completa(?:r)?(?:\s+la\s+tarea)?|marca(?:r)?\s+(?:como\s+)?(?:hecha|completada)|ya\s+hice)\s+(.+)$/i.exec(
          trimmed
        );
      const hint = (m?.[1] ?? '').trim().replace(/[.!]+$/, '');
      const matchedTask = this.findPendingTask(hint);
      if (matchedTask) {
        const done = this.productivityService.updateTask(matchedTask.id, {
          completed: true,
        });
        emotion = 'orgulloso';
        replyText = `¡Excelente! Marqué como completada la tarea «${done.title}».`;
        toolAction = { type: 'complete_task', taskId: done.id, title: done.title };
        this.eventBus.setIslandState({
          state: 'success',
          mood: 'orgulloso',
          statusText: 'Listo',
          badgeWord: 'Completada',
          peekCard: null,
        });
        this.scheduleSuccessReset('Completada');
      } else {
        emotion = 'escucha';
        replyText = `No encontré una tarea pendiente que coincida con «${hint}». Puedes revisarla en la pestaña Tareas.`;
        toolAction = { type: 'complete_task', found: false, query: hint };
        this.eventBus.setIslandState({
          state: 'idle',
          mood: 'escucha',
          statusText: 'Reposo',
        });
      }
    }
    // 6. Focus session (Spanish + voseo or English)
    else if (
      /\b(?:enf[oó]cate|poneme\s+(?:en\s+)?enfoque|inicia(?:r)?\s+enfoque|modo\s+enfoque|empieza(?:r)?\s+enfoque|start\s+focus|focus\s+for)\b/i.test(
        trimmed
      )
    ) {
      const minMatch = /(\d+)\s*(?:min|minutos|minutes|m)\b/i.exec(trimmed);
      const minutes = minMatch ? Math.max(1, Number(minMatch[1])) : 25;
      const focusState = this.productivityService.startFocus({
        durationSec: minutes * 60,
        label: 'Enfoque',
      });
      emotion = 'animo';
      replyText = `Iniciando sesión de enfoque por ${minutes} minutos. ¡Vamos con todo!`;
      toolAction = {
        type: 'start_focus',
        sessionId: focusState.id,
        durationSec: focusState.durationSec,
      };
    }
    // 7. Timer creation ("Temporizador de 5 minutos" / "Poneme un timer de 30s")
    else if (
      /\b(?:temporizador|timer|cuenta\s+regresiva)\s+(?:de\s+)?(\d+)\s*(segundos?|seg|s|minutos?|min|m|horas?|h)\b/i.test(
        trimmed
      )
    ) {
      const m =
        /\b(?:temporizador|timer|cuenta\s+regresiva)\s+(?:de\s+)?(\d+)\s*(segundos?|seg|s|minutos?|min|m|horas?|h)\b/i.exec(
          trimmed
        );
      const amount = Number(m?.[1] ?? 5);
      const unit = (m?.[2] ?? 'm').toLowerCase();
      const durationSec = unit.startsWith('h')
        ? amount * 3600
        : unit.startsWith('s')
        ? amount
        : amount * 60;
      const timer = this.productivityService.createTimer({
        durationSec,
        label: `Temporizador ${amount}${unit[0]}`,
      });
      emotion = 'contento';
      replyText = `Listo, inicié un temporizador de ${durationSec} segundos.`;
      toolAction = { type: 'create_timer', timerId: timer.id, durationSec };
      this.eventBus.setIslandState({
        state: 'success',
        mood: 'contento',
        statusText: 'Listo',
        badgeWord: 'Temporizador',
        peekCard: null,
      });
      this.scheduleSuccessReset('Temporizador');
    }
    // 8. Email draft ("Responde a Ana diciendo que...")
    else if (
      /\b(?:responde(?:r)?\s+a|escribe\s+(?:un\s+)?correo\s+a|redacta\s+(?:un\s+)?correo\s+a)\s+([a-záéíóúñ]+)(?:\s+diciendo\s+que|\s*:\s*|\s+que\s+)(.+)$/i.test(
        trimmed
      )
    ) {
      const m =
        /\b(?:responde(?:r)?\s+a|escribe\s+(?:un\s+)?correo\s+a|redacta\s+(?:un\s+)?correo\s+a)\s+([a-záéíóúñ]+)(?:\s+diciendo\s+que|\s*:\s*|\s+que\s+)(.+)$/i.exec(
          trimmed
        );
      const senderHint = (m?.[1] ?? 'Ana').trim();
      const draftBody = (m?.[2] ?? '').trim();
      const sourceMsg = this.mailerService.findMessageBySenderHint(senderHint);
      const draft = this.mailerService.createDraft({
        sourceMessageId: sourceMsg?.id ?? null,
        toName: sourceMsg?.fromName ?? senderHint,
        toEmail: sourceMsg?.fromEmail ?? `${senderHint.toLowerCase()}@equipo.local`,
        subject: sourceMsg ? `Re: ${sourceMsg.subject}` : `Mensaje para ${senderHint}`,
        body: draftBody,
      });
      emotion = 'escucha';
      replyText = `He preparado un borrador para ${draft.toName} («${draft.body}»). Revísalo y confirma si deseas enviarlo.`;
      toolAction = {
        type: 'email_draft',
        draftId: draft.id,
        toName: draft.toName,
        status: draft.status,
      };
    }
    // 9. Desktop tidy preview ("Ordena mi escritorio")
    else if (
      /\b(?:ordena(?:r)?\s+(?:mi\s+)?escritorio|organiza(?:r)?\s+(?:mi\s+)?escritorio|limpia(?:r)?\s+(?:mi\s+)?escritorio)\b/i.test(
        trimmed
      )
    ) {
      const scan = this.organizerService.previewTidy();
      emotion = 'contento';
      replyText = `Analicé tu escritorio y encontré ${scan.totalFiles} archivos sueltos. Confirma en la vista previa si quieres moverlos por categoría.`;
      toolAction = {
        type: 'desktop_preview',
        totalFiles: scan.totalFiles,
        batchId: scan.batchId,
      };
    }
    // 10. App launch ("Abre Notas", "Abrime calculadora" or blocked injection "Abre $(touch ...)")
    else if (/^(?:troko[,\s]+)?(?:abr[ei](?:me)?|abrir|lanz[aá]|ejecut[aá])\s+(.+)$/i.test(trimmed)) {
      const m = /^(?:troko[,\s]+)?(?:abr[ei](?:me)?|abrir|lanz[aá]|ejecut[aá])\s+(.+)$/i.exec(trimmed);
      const targetApp = (m?.[1] ?? '').trim().replace(/[.!]+$/, '');
      const canonical = this.appLauncherService.resolveWhitelistedApp(targetApp);
      if (canonical) {
        this.appLauncherService.launchApp({ appName: canonical });
        emotion = 'contento';
        replyText = `Abriendo ${canonical}.`;
        toolAction = { type: 'launch_app', app: canonical };
        this.scheduleSuccessReset(canonical);
      } else {
        emotion = 'molesto';
        replyText = `Por seguridad, esa aplicación no está permitida en la lista blanca de Troko. Solo puedo abrir aplicaciones autorizadas (Notas, Safari, Calendario, Calculadora, Música, Correo, Finder).`;
        toolAction = { type: 'app_blocked', requested: targetApp };
        this.eventBus.setIslandState({
          state: 'idle',
          mood: 'molesto',
          statusText: 'Reposo',
          peekCard: null,
        });
      }
    }
    // 11. Weather query ("¿Qué clima hace en Madrid?" / "Decime el clima" / "Clima en Buenos Aires")
    else if (
      /(?:^(?:troko[,\s]+)?(?:¿?\s*(?:qu[eé]|cu[aá]l|c[oó]mo\s+est[aá])|dime|decime|consulta(?:r)?|ver)\s+(?:el\s+|la\s+)?(?:clima|tiempo|temperatura|pron[oó]stico))|(?:\b(?:clima|pron[oó]stico|temperatura)\s+(?:en|de)\s+)|(?:^(?:troko[,\s]+)?(?:clima|temperatura|pron[oó]stico)(?:\s+en\s+|\s+de\s+|\s*$))/i.test(
        trimmed
      )
    ) {
      const weatherInt = this.getIntegration('weather');
      const cityMatch =
        /(?:en|de)\s+([a-záéíóúñü0-9\s,-]{2,60}?)(?:\?|\.|!|$)/i.exec(trimmed);
      const configuredCity =
        typeof weatherInt?.config['city'] === 'string' &&
        weatherInt.config['city'].trim()
          ? weatherInt.config['city'].trim()
          : 'Madrid';
      const city = cityMatch?.[1]?.trim() || configuredCity;
      const units =
        weatherInt?.config['units'] === 'imperial' ? 'imperial' : 'metric';

      if (!weatherInt || !weatherInt.enabled) {
        emotion = 'contento';
        replyText =
          'La integración de Clima está desactivada. Actívala en Ajustes para consultar el clima en vivo.';
        toolAction = { type: 'weather_query', city, enabled: false };
      } else {
        const weatherRes = await this.bridgeService.getWeather(city, units);
        emotion = weatherRes.ok ? 'contento' : 'molesto';
        replyText = weatherRes.summary;
        toolAction = {
          type: 'weather_query',
          city: weatherRes.city,
          ok: weatherRes.ok,
          ...(weatherRes.temperature !== undefined
            ? { temperature: weatherRes.temperature, unitSymbol: weatherRes.unitSymbol }
            : {}),
          ...(weatherRes.error ? { error: weatherRes.error } : {}),
        };
      }
      this.eventBus.setIslandState({
        state: 'idle',
        mood: emotion,
        statusText: 'Reposo',
      });
    }
    // 12. Tavily web search ("Busca noticias sobre IA" / "Buscame sobre Node 24")
    else if (
      /^(?:troko[,\s]+)?(?:busc[aá](?:r|me)?|investiga(?:r)?)(?:\s+(?:en\s+(?:internet|la\s+web)|sobre))?\s+(.+)$/i.test(
        trimmed
      )
    ) {
      const m =
        /^(?:troko[,\s]+)?(?:busc[aá](?:r|me)?|investiga(?:r)?)(?:\s+(?:en\s+(?:internet|la\s+web)|sobre))?\s+(.+)$/i.exec(
          trimmed
        );
      const query = (m?.[1] ?? '').trim().replace(/[.?!]+$/, '');
      const tavilyInt = this.getIntegration('tavily');
      const apiKey =
        typeof tavilyInt?.config['apiKey'] === 'string'
          ? tavilyInt.config['apiKey'].trim()
          : '';

      if (!tavilyInt || !tavilyInt.enabled || !apiKey) {
        emotion = 'contento';
        replyText =
          'La búsqueda web con Tavily no está activa o falta su API Key. Configúrala y actívala en Ajustes.';
        toolAction = { type: 'web_search', query, enabled: false };
      } else {
        const searchRes = await this.bridgeService.searchTavily(apiKey, query);
        emotion = searchRes.ok ? 'contento' : 'molesto';
        replyText = searchRes.summary;
        toolAction = {
          type: 'web_search',
          query,
          ok: searchRes.ok,
          resultsCount: searchRes.results.length,
          ...(searchRes.error ? { error: searchRes.error } : {}),
        };
      }
      this.eventBus.setIslandState({
        state: 'idle',
        mood: emotion,
        statusText: 'Reposo',
      });
    }
    // 13. Telegram send ("Envía por telegram Hola equipo" / "Mandame por telegram ...")
    else if (
      /^(?:troko[,\s]+)?(?:env[ií]a(?:r)?|mand[aá](?:r|me)?|escribe)\s+(?:un\s+)?(?:mensaje\s+)?(?:por\s+)?telegram(?:\s+(?:diciendo|que|:))?\s+(.+)$/i.test(
        trimmed
      )
    ) {
      const m =
        /^(?:troko[,\s]+)?(?:env[ií]a(?:r)?|mand[aá](?:r|me)?|escribe)\s+(?:un\s+)?(?:mensaje\s+)?(?:por\s+)?telegram(?:\s+(?:diciendo|que|:))?\s+(.+)$/i.exec(
          trimmed
        );
      const messageText = (m?.[1] ?? '').trim();
      const tgInt = this.getIntegration('telegram');
      const botToken =
        typeof tgInt?.config['botToken'] === 'string'
          ? tgInt.config['botToken'].trim()
          : '';
      const chatId =
        typeof tgInt?.config['chatId'] === 'string'
          ? tgInt.config['chatId'].trim()
          : '';

      if (!tgInt || !tgInt.enabled || !botToken || !chatId) {
        emotion = 'contento';
        replyText =
          'La integración de Telegram no está activa o faltan Bot Token y Chat ID. Configúrala y actívala en Ajustes.';
        toolAction = { type: 'telegram_send', enabled: false };
      } else {
        const tgRes = await this.bridgeService.sendTelegramMessage(
          botToken,
          chatId,
          messageText
        );
        emotion = tgRes.ok ? 'contento' : 'molesto';
        replyText = tgRes.summary;
        toolAction = {
          type: 'telegram_send',
          ok: tgRes.ok,
          ...(tgRes.messageId !== undefined ? { messageId: tgRes.messageId } : {}),
          ...(tgRes.error ? { error: tgRes.error } : {}),
        };
      }
      this.eventBus.setIslandState({
        state: 'idle',
        mood: emotion,
        statusText: 'Reposo',
      });
    }
    // 14. Daily Agenda Summary ("¿Qué tengo hoy?" / "Resumen del día" / "Mis pendientes")
    else if (
      /^(?:troko[,\s]+)?(?:¿?\s*(?:qu[eé]\s+(?:tengo|hay)\s+(?:para\s+)?hoy|cu[aá]les\s+son\s+mis\s+(?:pendientes|tareas|h[aá]bitos)|c[oó]mo\s+van\s+mis\s+h[aá]bitos|agenda\s+de\s+hoy|mis\s+pendientes|resumen\s+del\s+d[ií]a)\s*\??)$/i.test(
        trimmed
      )
    ) {
      const pendingTasks = this.productivityService
        .listTasks()
        .filter((t) => !t.completed);
      const scheduledReminders = this.productivityService
        .listReminders()
        .filter((r) => r.status === 'scheduled');
      const habits = this.habitService ? this.habitService.listHabits() : [];
      const habitsDone = habits.filter((h) => h.todayProgress >= h.dailyGoal).length;
      const focus = this.productivityService.getFocusState();

      const parts: string[] = [];
      parts.push(
        pendingTasks.length === 0
          ? 'No tienes tareas pendientes'
          : `Tienes ${pendingTasks.length} ${pendingTasks.length === 1 ? 'tarea pendiente' : 'tareas pendientes'} (${pendingTasks
              .slice(0, 3)
              .map((t) => t.title)
              .join(', ')})`
      );
      if (habits.length > 0) {
        parts.push(`hábitos hoy: ${habitsDone}/${habits.length}`);
      }
      if (scheduledReminders[0]) {
        const hhmm = new Date(scheduledReminders[0].triggerAt).toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
        });
        parts.push(`próximo aviso: «${scheduledReminders[0].title}» a las ${hhmm}`);
      }
      if (focus.session && (focus.session.status === 'active' || focus.session.status === 'paused')) {
        parts.push(`enfoque ${focus.session.status === 'active' ? 'activo' : 'en pausa'}`);
      }

      emotion = 'contento';
      replyText = `Resumen de hoy: ${parts.join(' · ')}.`;
      toolAction = {
        type: 'daily_summary',
        pendingTasksCount: pendingTasks.length,
        habitsDone,
        habitsTotal: habits.length,
        scheduledReminders: scheduledReminders.length,
      };
      this.eventBus.setIslandState({
        state: 'idle',
        mood: 'contento',
        statusText: 'Reposo',
      });
    }
    // 15. System Telemetry ("Estado de mi PC" / "Cuánta RAM uso" / "Uso de CPU")
    else if (
      /^(?:troko[,\s]+)?(?:¿?\s*(?:estado\s+(?:de\s+)?(?:mi\s+)?(?:pc|equipo|computadora|sistema)|uso\s+de\s+(?:cpu|ram|memoria)|cu[aá]nta\s+(?:ram|memoria)\s+(?:uso|hay|tengo)|info(?:rmaci[oó]n)?\s+del\s+sistema)\s*\??)$/i.test(
        trimmed
      )
    ) {
      const totalGb = (os.totalmem() / 1024 ** 3).toFixed(1);
      const freeGb = (os.freemem() / 1024 ** 3).toFixed(1);
      const usedPct = Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100);
      const cpus = os.cpus();
      const cpuCores = cpus.length;
      const cpuName = cpus[0]?.model?.trim() || 'CPU';
      const uptimeH = Math.floor(os.uptime() / 3600);
      const uptimeM = Math.floor((os.uptime() % 3600) / 60);

      emotion = 'contento';
      replyText = `Equipo (${process.platform}/${os.arch()}): ${cpuCores} núcleos (${cpuName}) · RAM en uso: ${usedPct}% (${freeGb} GB libres de ${totalGb} GB) · Activo hace ${uptimeH}h ${uptimeM}m.`;
      toolAction = {
        type: 'system_stats',
        memUsedPct: usedPct,
        cpuCores,
        platform: process.platform,
      };
      this.eventBus.setIslandState({
        state: 'idle',
        mood: 'contento',
        statusText: 'Reposo',
      });
    }
    // 16. Habit logging ("Tomé un vaso de agua", "Registra 1 vaso de agua", "Sumá 1 a leer")
    else if (
      this.habitService &&
      /^(?:troko[,\s]+)?(?:tom[eé]|beb[ií]|hice|cumpl[ií](?:\s+con)?|registra(?:r)?|sum[aá](?:r)?)\s+(.+)$/i.test(
        trimmed
      ) &&
      this.findMatchingHabit(trimmed) !== null
    ) {
      const matched = this.findMatchingHabit(trimmed)!;
      const updated = this.habitService.incrementHabit(matched.id);
      const reachedGoal = updated.todayProgress >= updated.dailyGoal;
      emotion = reachedGoal ? 'festejo' : 'contento';
      replyText = reachedGoal
        ? `¡Meta diaria cumplida! «${updated.name}» quedó en ${updated.todayProgress}/${updated.dailyGoal} ${updated.unitLabel}.`
        : `Registrado +1 en «${updated.name}» (${updated.todayProgress}/${updated.dailyGoal} ${updated.unitLabel}).`;
      toolAction = {
        type: 'log_habit',
        habitId: updated.id,
        habitName: updated.name,
        progress: updated.todayProgress,
        goal: updated.dailyGoal,
      };
      this.eventBus.setIslandState({
        state: 'success',
        mood: emotion,
        statusText: 'Listo',
        badgeWord: reachedGoal ? '¡Meta!' : '+1 Hábito',
        peekCard: null,
      });
      this.scheduleSuccessReset(reachedGoal ? '¡Meta!' : '+1 Hábito');
    }
    // 17. Conversational / Emotional / BYOK + Optional AI Action Execution
    else {
      emotion = detectEmotionFromText(trimmed);
      const settings = this.settingsService.getSettings();
      const history = this.getRecentHistory(userMessage.conversationId, userMessage.id, 6);
      const aiResult = await this.aiProvider
        .generateReply(settings, history, trimmed)
        .catch(() => null);
      if (aiResult) {
        replyText = aiResult.reply;
        if (aiResult.emotion) {
          emotion = aiResult.emotion;
        }
        if (aiResult.action) {
          const executed = this.executeAiToolAction(aiResult.action);
          if (executed) {
            toolAction = executed;
          }
        } else if (aiResult.intent) {
          toolAction = { type: 'ai_intent', intent: aiResult.intent };
        }
      } else {
        replyText = buildOfflineEmotionReply(emotion, trimmed);
      }
      if (!toolAction || toolAction['type'] !== 'start_focus') {
        this.eventBus.setIslandState({
          state: 'idle',
          mood: emotion,
          statusText: 'Reposo',
        });
      }
    }

    const assistantMessage = this.insertMessage({
      conversationId,
      role: 'assistant',
      content: replyText,
      inputMode,
      emotion,
      toolAction,
    });

    this.eventBus.publish('data.updated', {
      scope: 'chat',
      userMessage,
      assistantMessage,
    });

    return {
      ok: true,
      userMessage,
      assistantMessage,
      reply: replyText,
      emotion,
      toolAction,
      island: this.eventBus.getIslandState(),
    };
  }
}
