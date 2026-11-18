import crypto from 'node:crypto';
import type {
  ConversationMessage,
  InputMode,
  MessageRole,
  ModelDownloadStatus,
  TrokoMood,
} from '../../../shared/types.ts';
import type { TrokoDatabase } from '../db/database.ts';
import type { EventBus } from '../eventBus.ts';
import type { AppLauncherService } from './appLauncherService.ts';
import type { MailerService } from './mailerService.ts';
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
  private readonly mailerService: MailerService;
  private readonly organizerService: OrganizerService;
  private readonly appLauncherService: AppLauncherService;

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
    mailerService: MailerService;
    organizerService: OrganizerService;
    appLauncherService: AppLauncherService;
  }) {
    this.db = deps.db;
    this.eventBus = deps.eventBus;
    this.settingsService = deps.settingsService;
    this.productivityService = deps.productivityService;
    this.mailerService = deps.mailerService;
    this.organizerService = deps.organizerService;
    this.appLauncherService = deps.appLauncherService;
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

  private async tryExternalProvider(userText: string): Promise<string | null> {
    const settings = this.settingsService.getSettings();
    if (settings.aiProvider === 'local_fallback') {
      return null;
    }
    const baseEndpoint = settings.aiEndpoint.trim().replace(/\/+$/, '');
    if (!baseEndpoint.startsWith('http://') && !baseEndpoint.startsWith('https://')) {
      return null;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (settings.aiApiKey && settings.aiApiKey.trim().length > 0) {
      headers['Authorization'] = `Bearer ${settings.aiApiKey.trim()}`;
    }

    const url = baseEndpoint.endsWith('/chat/completions')
      ? baseEndpoint
      : `${baseEndpoint}/v1/chat/completions`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    timeout.unref();

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: settings.aiModel || 'llama3.2:3b',
          messages: [
            {
              role: 'system',
              content:
                'Eres Troko, un compañero de escritorio inteligente en español, conciso y amable.',
            },
            { role: 'user', content: userText },
          ],
          temperature: 0.4,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        return null;
      }

      const data = (await res.json()) as Record<string, unknown>;
      const choices = data['choices'];
      if (Array.isArray(choices) && choices.length > 0) {
        const first = choices[0] as Record<string, unknown>;
        const msg = first['message'] as Record<string, unknown> | undefined;
        if (msg && typeof msg['content'] === 'string' && msg['content'].trim()) {
          return msg['content'].trim();
        }
      }
      if (typeof data['response'] === 'string' && data['response'].trim()) {
        return data['response'].trim();
      }
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
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

    // 1. Sleep command ("Troko, descansa" / "Descansa")
    if (
      /^(?:troko[,\s]+)?(?:descansa|duerme|vete\s+a\s+dormir|modo\s+reposo|a\s+dormir)$/i.test(
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
    // 2. Task creation (Spanish or English)
    else if (
      /^(?:troko[,\s]+)?(?:anota(?:r)?(?:\s+una)?(?:\s+tarea)?|agrega(?:r)?(?:\s+una)?\s+tarea|crea(?:r)?(?:\s+una)?\s+tarea|nueva\s+tarea|add\s+(?:a\s+)?task|create\s+(?:a\s+)?task)[:\s]+(.+)$/i.test(
        trimmed
      )
    ) {
      const match =
        /^(?:troko[,\s]+)?(?:anota(?:r)?(?:\s+una)?(?:\s+tarea)?|agrega(?:r)?(?:\s+una)?\s+tarea|crea(?:r)?(?:\s+una)?\s+tarea|nueva\s+tarea|add\s+(?:a\s+)?task|create\s+(?:a\s+)?task)[:\s]+(.+)$/i.exec(
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
    // 3. Focus session (Spanish or English)
    else if (
      /\b(?:enf[oó]cate|inicia(?:r)?\s+enfoque|modo\s+enfoque|empieza(?:r)?\s+enfoque|start\s+focus|focus\s+for)\b/i.test(
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
    // 4. Timer creation
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
    // 5. Email draft ("Responde a Ana diciendo que...")
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
    // 6. Desktop tidy preview ("Ordena mi escritorio")
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
    // 7. App launch ("Abre Notas" or blocked injection "Abre $(touch ...)")
    else if (/^(?:troko[,\s]+)?(?:abre|abrir|lanza|ejecuta)\s+(.+)$/i.test(trimmed)) {
      const m = /^(?:troko[,\s]+)?(?:abre|abrir|lanza|ejecuta)\s+(.+)$/i.exec(trimmed);
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
    // 8. Conversational / Emotional / BYOK
    else {
      emotion = detectEmotionFromText(trimmed);
      const externalReply = await this.tryExternalProvider(trimmed);
      replyText = externalReply ?? buildOfflineEmotionReply(emotion, trimmed);
      this.eventBus.setIslandState({
        state: 'idle',
        mood: emotion,
        statusText: 'Reposo',
      });
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
