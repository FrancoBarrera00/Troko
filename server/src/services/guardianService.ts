import fs from 'node:fs';
import path from 'node:path';
import type {
  GuardianConfig,
  GuardianRuntimeStatus,
} from '../../../shared/types.ts';
import type { EventBus } from '../eventBus.ts';
import type { ProgressionService } from './progressionService.ts';

const DEFAULT_DISTRACTIONS = [
  'youtube',
  'twitch',
  'instagram',
  'tiktok',
  'facebook',
  'reddit',
  'netflix',
  'discord',
  'x.com',
  'twitter',
];

const DEFAULT_ALLOWED = [
  'pdf',
  'word',
  'docs',
  'notion',
  'obsidian',
  'estudio',
  'code',
  'troko',
];

function resolveStorePath(dbPath?: string): string | null {
  if (!dbPath || dbPath === ':memory:') return null;
  return path.join(path.dirname(path.resolve(dbPath)), 'troko-guardian.json');
}

function defaultConfig(): GuardianConfig {
  return {
    enabled: true,
    mode: 'blacklist',
    distractionKeywords: [...DEFAULT_DISTRACTIONS],
    allowedKeywords: [...DEFAULT_ALLOWED],
    graceSec: 12,
  };
}

export class GuardianService {
  private readonly filePath: string | null;
  private readonly eventBus: EventBus;
  private readonly progressionService?: ProgressionService;
  private config: GuardianConfig;
  private runtime: GuardianRuntimeStatus = {
    sessionDistractions: 0,
    lastDetectedTitle: null,
    lastDistractionTitle: null,
    lastAlertAt: null,
    distractedSeconds: 0,
    isCurrentlyDistracted: false,
  };
  private distractedSinceMs: number | null = null;
  private lastAlertAtMs = 0;

  constructor(
    dbPath: string | undefined,
    eventBus: EventBus,
    progressionService?: ProgressionService
  ) {
    this.filePath = resolveStorePath(dbPath);
    this.eventBus = eventBus;
    this.progressionService = progressionService;
    this.config = this.loadConfig();
  }

  private loadConfig(): GuardianConfig {
    if (!this.filePath || !fs.existsSync(this.filePath)) {
      return defaultConfig();
    }
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Partial<GuardianConfig>;
      return {
        enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
        mode: raw.mode === 'whitelist' ? 'whitelist' : 'blacklist',
        distractionKeywords: Array.isArray(raw.distractionKeywords)
          ? raw.distractionKeywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean)
          : [...DEFAULT_DISTRACTIONS],
        allowedKeywords: Array.isArray(raw.allowedKeywords)
          ? raw.allowedKeywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean)
          : [...DEFAULT_ALLOWED],
        graceSec:
          typeof raw.graceSec === 'number' && Number.isFinite(raw.graceSec)
            ? Math.min(120, Math.max(3, Math.round(raw.graceSec)))
            : 12,
      };
    } catch {
      return defaultConfig();
    }
  }

  private saveConfig(): void {
    if (!this.filePath) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.config, null, 2), 'utf8');
    } catch {
      // Ignore write failures
    }
  }

  getConfig(): GuardianConfig {
    return {
      ...this.config,
      distractionKeywords: [...this.config.distractionKeywords],
      allowedKeywords: [...this.config.allowedKeywords],
    };
  }

  getRuntime(): GuardianRuntimeStatus {
    return { ...this.runtime };
  }

  patchConfig(patch: Partial<GuardianConfig>): GuardianConfig {
    if (typeof patch.enabled === 'boolean') {
      this.config.enabled = patch.enabled;
    }
    if (patch.mode === 'blacklist' || patch.mode === 'whitelist') {
      this.config.mode = patch.mode;
    }
    if (Array.isArray(patch.distractionKeywords)) {
      this.config.distractionKeywords = Array.from(
        new Set(
          patch.distractionKeywords
            .map((k) => String(k).trim().toLowerCase())
            .filter(Boolean)
        )
      );
    }
    if (Array.isArray(patch.allowedKeywords)) {
      this.config.allowedKeywords = Array.from(
        new Set(
          patch.allowedKeywords
            .map((k) => String(k).trim().toLowerCase())
            .filter(Boolean)
        )
      );
    }
    if (typeof patch.graceSec === 'number' && Number.isFinite(patch.graceSec)) {
      this.config.graceSec = Math.min(120, Math.max(3, Math.round(patch.graceSec)));
    }
    this.saveConfig();
    this.eventBus.publish('data.updated', { scope: 'guardian' });
    return this.getConfig();
  }

  resetSession(): void {
    this.runtime = {
      sessionDistractions: 0,
      lastDetectedTitle: this.runtime.lastDetectedTitle,
      lastDistractionTitle: null,
      lastAlertAt: null,
      distractedSeconds: 0,
      isCurrentlyDistracted: false,
    };
    this.distractedSinceMs = null;
    this.lastAlertAtMs = 0;
  }

  isTitleDistracting(rawTitle: string): { distracting: boolean; matchedKeyword: string | null } {
    const title = rawTitle.trim().toLowerCase();
    if (!title || title.includes('troko')) {
      return { distracting: false, matchedKeyword: null };
    }

    if (this.config.mode === 'blacklist') {
      for (const kw of this.config.distractionKeywords) {
        if (kw && title.includes(kw)) {
          return { distracting: true, matchedKeyword: kw };
        }
      }
      return { distracting: false, matchedKeyword: null };
    }

    // Whitelist mode: everything not matching allowedKeywords is distracting
    if (this.config.allowedKeywords.length === 0) {
      return { distracting: false, matchedKeyword: null };
    }
    const allowed = this.config.allowedKeywords.some((kw) => kw && title.includes(kw));
    return { distracting: !allowed, matchedKeyword: allowed ? null : 'fuera de lista' };
  }

  evaluateWindow(input: {
    windowTitle: string;
    isFocusActive: boolean;
    focusLabel?: string | null;
    elapsedHiddenSec?: number;
  }): {
    distracting: boolean;
    triggered: boolean;
    message?: string;
    runtime: GuardianRuntimeStatus;
  } {
    const title = input.windowTitle.trim();
    if (title) {
      this.runtime.lastDetectedTitle = title;
    }

    if (!this.config.enabled || !input.isFocusActive) {
      this.distractedSinceMs = null;
      this.runtime.distractedSeconds = 0;
      this.runtime.isCurrentlyDistracted = false;
      return { distracting: false, triggered: false, runtime: this.getRuntime() };
    }

    const check = this.isTitleDistracting(title);
    if (!check.distracting) {
      this.distractedSinceMs = null;
      this.runtime.distractedSeconds = 0;
      this.runtime.isCurrentlyDistracted = false;
      const cur = this.eventBus.getIslandState();
      if (cur.state === 'alert' || cur.state === 'remind') {
        this.eventBus.setIslandState({
          state: 'focus',
          mood: 'contento',
          statusText: 'Enfoque',
          peekCard: null,
        });
      }
      return { distracting: false, triggered: false, runtime: this.getRuntime() };
    }

    const nowMs = Date.now();
    if (this.distractedSinceMs === null) {
      this.distractedSinceMs =
        typeof input.elapsedHiddenSec === 'number' && input.elapsedHiddenSec > 0
          ? nowMs - input.elapsedHiddenSec * 1000
          : nowMs;
    }

    const elapsedSec = Math.max(0, Math.round((nowMs - this.distractedSinceMs) / 1000));
    this.runtime.distractedSeconds = elapsedSec;
    this.runtime.isCurrentlyDistracted = true;
    this.runtime.lastDistractionTitle = title || check.matchedKeyword;

    // Gentle pre-warning face while inside grace period
    if (elapsedSec < this.config.graceSec) {
      this.eventBus.setIslandState({
        state: 'focus',
        mood: 'sorpresa',
        statusText: 'Enfoque',
      });
      return { distracting: true, triggered: false, runtime: this.getRuntime() };
    }

    // Cooldown of 25s between alerts so it nudges effectively without spamming
    if (nowMs - this.lastAlertAtMs < 25_000) {
      return { distracting: true, triggered: false, runtime: this.getRuntime() };
    }

    this.lastAlertAtMs = nowMs;
    this.runtime.sessionDistractions += 1;
    this.runtime.lastAlertAt = new Date(nowMs).toISOString();
    this.progressionService?.breakFocusStreak();

    const targetLabel = input.focusLabel ? `«${input.focusLabel}»` : 'tu bloque de estudio';
    const message = `¡Guardián de Enfoque! Detecté «${title || check.matchedKeyword}» mientras estabas en ${targetLabel}. Volvamos para cuidar tu racha.`;

    this.eventBus.setIslandState({
      state: 'remind',
      mood: 'molesto',
      statusText: '¡Al foco!',
      remindMessage: `Vuelve a ${input.focusLabel || 'tu estudio'}`,
      peekCard: null,
    });
    this.eventBus.publish('data.updated', { scope: 'guardian' });

    return {
      distracting: true,
      triggered: true,
      message,
      runtime: this.getRuntime(),
    };
  }

  triggerTestAlert(sampleTitle = 'YouTube - Videos recomendados', focusLabel = 'Estudio'): {
    triggered: true;
    message: string;
    runtime: GuardianRuntimeStatus;
  } {
    this.runtime.lastDetectedTitle = sampleTitle;
    this.runtime.lastDistractionTitle = sampleTitle;
    this.runtime.sessionDistractions += 1;
    this.runtime.isCurrentlyDistracted = true;
    this.runtime.distractedSeconds = this.config.graceSec;
    this.runtime.lastAlertAt = new Date().toISOString();

    const message = `¡Guardián de Enfoque! Detecté «${sampleTitle}» mientras estabas en «${focusLabel}». Volvamos para mantener tu combo XP.`;
    this.eventBus.setIslandState({
      state: 'remind',
      mood: 'molesto',
      statusText: '¡Al foco!',
      remindMessage: `Vuelve a ${focusLabel}`,
      peekCard: null,
    });
    this.eventBus.publish('data.updated', { scope: 'guardian' });

    return {
      triggered: true,
      message,
      runtime: this.getRuntime(),
    };
  }

  wipe(): void {
    this.config = defaultConfig();
    this.resetSession();
    this.runtime.lastDetectedTitle = null;
    this.saveConfig();
    this.eventBus.publish('data.updated', { scope: 'guardian' });
  }
}
