import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AmbientSoundId,
  FocusAssistantSnapshot,
  FocusInsights,
  FocusIntention,
  FocusPreset,
  FocusPresetId,
  ParkingLotItem,
  ShieldedNotification,
} from '../../../shared/types.ts';
import { HttpError } from '../app.ts';
import type { TrokoDatabase } from '../db/database.ts';
import type { EventBus } from '../eventBus.ts';
import type { GuardianService } from './guardianService.ts';
import type { ProductivityService } from './productivityService.ts';
import type { ProgressionService } from './progressionService.ts';

export const FOCUS_PRESETS: FocusPreset[] = [
  {
    id: 'estudio_profundo',
    name: 'Estudio Profundo',
    description: '25/5 min · Guardián en Solo estudio · Ruido marrón + Escudo activo',
    focusMinutes: 25,
    breakMinutes: 5,
    guardianMode: 'whitelist',
    soundId: 'brown',
    shieldEnabled: true,
  },
  {
    id: 'trabajo_codigo',
    name: 'Trabajo / Código',
    description: '50/10 min · Lista negra de redes · Lluvia suave + Escudo activo',
    focusMinutes: 50,
    breakMinutes: 10,
    guardianMode: 'blacklist',
    soundId: 'rain',
    shieldEnabled: true,
  },
  {
    id: 'sprint_rapido',
    name: 'Sprint Rápido',
    description: '15/3 min · Arranque anti-procrastinación · Pulso 40 Hz',
    focusMinutes: 15,
    breakMinutes: 3,
    guardianMode: 'blacklist',
    soundId: 'binaural40',
    shieldEnabled: true,
  },
];

interface PersistedFocusAssistant {
  activePresetId: FocusPresetId;
  activeIntention: FocusIntention | null;
  shieldEnabled: boolean;
  shieldedQueue: ShieldedNotification[];
  parkingLot: ParkingLotItem[];
  recommendedSound: AmbientSoundId;
}

function defaultState(): PersistedFocusAssistant {
  return {
    activePresetId: 'estudio_profundo',
    activeIntention: null,
    shieldEnabled: true,
    shieldedQueue: [],
    parkingLot: [],
    recommendedSound: 'off',
  };
}

function resolveStorePath(dbPath?: string): string | null {
  if (!dbPath || dbPath === ':memory:') return null;
  return path.join(path.dirname(path.resolve(dbPath)), 'troko-focus-assistant.json');
}

export class FocusAssistantService {
  private readonly filePath: string | null;
  private readonly trokoDb: TrokoDatabase;
  private readonly eventBus: EventBus;
  private readonly productivityService: ProductivityService;
  private readonly guardianService: GuardianService;
  private readonly progressionService: ProgressionService;
  private state: PersistedFocusAssistant;

  constructor(deps: {
    dbPath?: string;
    db: TrokoDatabase;
    eventBus: EventBus;
    productivityService: ProductivityService;
    guardianService: GuardianService;
    progressionService: ProgressionService;
  }) {
    this.filePath = resolveStorePath(deps.dbPath);
    this.trokoDb = deps.db;
    this.eventBus = deps.eventBus;
    this.productivityService = deps.productivityService;
    this.guardianService = deps.guardianService;
    this.progressionService = deps.progressionService;
    this.state = this.loadState();
  }

  private loadState(): PersistedFocusAssistant {
    if (!this.filePath || !fs.existsSync(this.filePath)) {
      return defaultState();
    }
    try {
      const raw = JSON.parse(
        fs.readFileSync(this.filePath, 'utf8')
      ) as Partial<PersistedFocusAssistant>;
      const validPreset = FOCUS_PRESETS.some((p) => p.id === raw.activePresetId)
        ? (raw.activePresetId as FocusPresetId)
        : 'estudio_profundo';
      return {
        activePresetId: validPreset,
        activeIntention: raw.activeIntention ?? null,
        shieldEnabled: typeof raw.shieldEnabled === 'boolean' ? raw.shieldEnabled : true,
        shieldedQueue: Array.isArray(raw.shieldedQueue) ? raw.shieldedQueue : [],
        parkingLot: Array.isArray(raw.parkingLot) ? raw.parkingLot : [],
        recommendedSound:
          raw.recommendedSound === 'brown' ||
          raw.recommendedSound === 'rain' ||
          raw.recommendedSound === 'binaural40'
            ? raw.recommendedSound
            : 'off',
      };
    } catch {
      return defaultState();
    }
  }

  private saveState(): void {
    if (!this.filePath) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch {
      // Ignore write failures
    }
  }

  listPresets(): FocusPreset[] {
    return FOCUS_PRESETS.map((p) => ({ ...p }));
  }

  getPreset(id: FocusPresetId): FocusPreset {
    const found = FOCUS_PRESETS.find((p) => p.id === id);
    if (!found) {
      throw new HttpError(404, 'Perfil de enfoque no encontrado');
    }
    return found;
  }

  getSnapshot(): FocusAssistantSnapshot {
    return {
      presets: this.listPresets(),
      activePresetId: this.state.activePresetId,
      activeIntention: this.state.activeIntention ? { ...this.state.activeIntention } : null,
      shieldEnabled: this.state.shieldEnabled,
      shieldedQueue: this.state.shieldedQueue.map((item) => ({ ...item })),
      parkingLot: this.state.parkingLot.map((item) => ({ ...item })),
      recommendedSound: this.state.recommendedSound,
      insights: this.getInsights(),
    };
  }

  setIntention(input: {
    label: string;
    taskId?: string | null;
    studyDocId?: string | null;
    studyBlockId?: string | null;
    presetId?: FocusPresetId | null;
  }): FocusIntention {
    const trimmed = input.label.trim().slice(0, 140);
    if (!trimmed) {
      throw new HttpError(400, 'Define una intención o meta para tu bloque de enfoque');
    }
    const intention: FocusIntention = {
      label: trimmed,
      taskId: input.taskId ?? null,
      studyDocId: input.studyDocId ?? null,
      studyBlockId: input.studyBlockId ?? null,
      presetId: input.presetId ?? this.state.activePresetId,
      setAt: new Date().toISOString(),
    };
    this.state.activeIntention = intention;
    this.saveState();
    this.eventBus.publish('data.updated', { scope: 'focus_assistant' });
    return { ...intention };
  }

  startWithPreset(
    presetId: FocusPresetId,
    options: {
      label?: string;
      taskId?: string | null;
      studyDocId?: string | null;
      studyBlockId?: string | null;
    } = {}
  ): {
    preset: FocusPreset;
    intention: FocusIntention;
    snapshot: FocusAssistantSnapshot;
  } {
    const preset = this.getPreset(presetId);
    this.state.activePresetId = preset.id;
    this.state.shieldEnabled = preset.shieldEnabled;
    this.state.recommendedSound = preset.soundId;

    const intentionLabel = (options.label?.trim() || preset.name).slice(0, 140);
    const intention = this.setIntention({
      label: intentionLabel,
      taskId: options.taskId ?? null,
      studyDocId: options.studyDocId ?? null,
      studyBlockId: options.studyBlockId ?? null,
      presetId: preset.id,
    });

    this.guardianService.patchConfig({
      enabled: true,
      mode: preset.guardianMode,
    });

    this.productivityService.startFocus({
      label: intention.label,
      durationSec: preset.focusMinutes * 60,
      breakSec: preset.breakMinutes * 60,
      phase: 'focus',
    });

    this.saveState();
    this.eventBus.publish('data.updated', { scope: 'focus_assistant' });
    return {
      preset,
      intention,
      snapshot: this.getSnapshot(),
    };
  }

  // === Parking Lot Mental ===
  listParkingLot(): ParkingLotItem[] {
    return this.state.parkingLot.map((item) => ({ ...item }));
  }

  addParkingItem(text: string): ParkingLotItem {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new HttpError(400, 'Escribe el pensamiento o pendiente a estacionar');
    }
    const item: ParkingLotItem = {
      id: `park-${crypto.randomUUID()}`,
      text: trimmed.slice(0, 300),
      createdAt: new Date().toISOString(),
      promotedTaskId: null,
    };
    this.state.parkingLot.unshift(item);
    this.saveState();
    this.eventBus.publish('data.updated', { scope: 'focus_assistant' });
    return { ...item };
  }

  promoteParkingItemToTask(id: string): { item: ParkingLotItem; taskId: string } {
    const item = this.state.parkingLot.find((p) => p.id === id);
    if (!item) {
      throw new HttpError(404, 'Ítem del Parking Lot no encontrado');
    }
    const task = this.productivityService.createTask(item.text);
    item.promotedTaskId = task.id;
    this.saveState();
    this.eventBus.publish('data.updated', { scope: 'focus_assistant' });
    return { item: { ...item }, taskId: task.id };
  }

  deleteParkingItem(id: string): void {
    const before = this.state.parkingLot.length;
    this.state.parkingLot = this.state.parkingLot.filter((p) => p.id !== id);
    if (this.state.parkingLot.length === before) {
      throw new HttpError(404, 'Ítem del Parking Lot no encontrado');
    }
    this.saveState();
    this.eventBus.publish('data.updated', { scope: 'focus_assistant' });
  }

  // === Notification Shield ===
  setShieldEnabled(enabled: boolean): boolean {
    this.state.shieldEnabled = Boolean(enabled);
    this.saveState();
    this.eventBus.publish('data.updated', { scope: 'focus_assistant' });
    return this.state.shieldEnabled;
  }

  shouldDeferDuringFocus(item: {
    id: string;
    kind: 'reminder' | 'habit';
    title: string;
    originalAt: string;
  }): boolean {
    if (!this.state.shieldEnabled) return false;
    const focus = this.productivityService.getFocusState();
    const isFocusActive = focus.status === 'active' && focus.phase === 'focus';
    if (!isFocusActive) return false;

    const alreadyQueued = this.state.shieldedQueue.some((q) => q.id === item.id);
    if (!alreadyQueued) {
      this.state.shieldedQueue.push({
        id: item.id,
        kind: item.kind,
        title: item.title,
        originalAt: item.originalAt,
        heldAt: new Date().toISOString(),
      });
      this.saveState();
      this.eventBus.publish('data.updated', { scope: 'focus_assistant' });
    }
    return true;
  }

  flushShieldedQueue(publishPeekCard = true): ShieldedNotification[] {
    if (this.state.shieldedQueue.length === 0) {
      return [];
    }
    const flushed = this.state.shieldedQueue.map((item) => ({ ...item }));
    this.state.shieldedQueue = [];
    this.saveState();

    if (publishPeekCard && flushed.length > 0) {
      this.eventBus.setIslandState({
        state: 'remind',
        mood: 'animo',
        statusText: 'Avisos retenidos',
        remindMessage: `${flushed.length} aviso(s) durante tu enfoque`,
        peekCard: {
          kind: 'missed_reminders',
          reminders: flushed.map((item) => ({
            id: item.id,
            title: item.title,
            triggerAt: item.originalAt,
          })),
        },
      });
    }
    this.eventBus.publish('data.updated', { scope: 'focus_assistant' });
    return flushed;
  }

  // === Focus Insights (Radiografía de Enfoque) ===
  getInsights(): FocusInsights {
    const rows = this.trokoDb.db
      .prepare(
        "SELECT duration_sec, started_at FROM focus_sessions WHERE status = 'completed' AND phase = 'focus'"
      )
      .all() as Array<Record<string, unknown>>;

    let totalSeconds = 0;
    const bySlot = { manana: 0, tarde: 0, noche: 0 };

    for (const r of rows) {
      const dur = Number(r['duration_sec'] ?? 0);
      totalSeconds += Math.max(0, dur);
      const startedIso = String(r['started_at'] ?? '');
      const d = new Date(startedIso);
      if (!Number.isNaN(d.getTime())) {
        const h = d.getHours();
        if (h >= 6 && h < 12) bySlot.manana += 1;
        else if (h >= 12 && h < 19) bySlot.tarde += 1;
        else bySlot.noche += 1;
      }
    }

    const totalCompletedBlocks = rows.length;
    const totalFocusMinutes = Math.round(totalSeconds / 60);
    const totalCleanAll = this.progressionService.getTotalCleanFocusBlocksAllCompanions();
    const cleanBlocks = Math.min(totalCompletedBlocks, totalCleanAll);
    const cleanBlocksPct =
      totalCompletedBlocks > 0
        ? Math.round((cleanBlocks / totalCompletedBlocks) * 100)
        : 100;

    let bestTimeSlot: FocusInsights['bestTimeSlot'] = 'Sin datos';
    const maxSlot = Math.max(bySlot.manana, bySlot.tarde, bySlot.noche);
    if (maxSlot > 0) {
      if (bySlot.manana === maxSlot) bestTimeSlot = 'Mañana';
      else if (bySlot.tarde === maxSlot) bestTimeSlot = 'Tarde';
      else bestTimeSlot = 'Noche';
    }

    return {
      totalCompletedBlocks,
      totalFocusMinutes,
      cleanBlocksPct,
      bestTimeSlot,
      bySlot,
      topDistractions: this.guardianService.getTopDistractions(5),
      totalDistractions: this.guardianService.getTotalDistractions(),
    };
  }

  wipe(): void {
    this.state = defaultState();
    this.saveState();
    this.eventBus.publish('data.updated', { scope: 'focus_assistant' });
  }
}
