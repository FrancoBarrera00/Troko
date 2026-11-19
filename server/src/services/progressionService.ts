import fs from 'node:fs';
import path from 'node:path';
import {
  COMPANION_IDS,
  NUKO_ACCESSORY_IDS,
  type AccessoryCatalogItem,
  type CompanionId,
  type CompanionProgressionMap,
  type NukoAccessoryId,
  type ProgressionState,
} from '../../../shared/types.ts';
import { HttpError } from '../app.ts';
import type { EventBus } from '../eventBus.ts';

interface StoredCompanionProgression {
  xp: number;
  focusStreakBlocks: number;
  totalFocusCleanBlocks: number;
  totalStudyBlocksMastered: number;
  totalQuizzesCorrect: number;
  equippedAccessory: NukoAccessoryId;
  lastRewardReason?: string;
}

interface StoredDualProgression {
  activeCompanion: CompanionId;
  companions: {
    nuko: StoredCompanionProgression;
    luma: StoredCompanionProgression;
  };
}

const LEVEL_THRESHOLDS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200] as const;

const LEVEL_TITLES_BY_COMPANION: Record<CompanionId, readonly string[]> = {
  nuko: [
    'Aprendiz Curioso',
    'Lector Ágil',
    'Estudiante Enfocado',
    'Maestro del Foco',
    'Sabio Digital',
    'Leyenda Nuko',
  ],
  luma: [
    'Chispa Curiosa',
    'Luz de Lectura',
    'Faro Enfocado',
    'Maestro del Foco',
    'Sabio Luminoso',
    'Leyenda Luma',
  ],
};

const BASE_ACCESSORIES: ReadonlyArray<{
  id: NukoAccessoryId;
  name: string;
  description: string;
  minLevel: number;
}> = [
  {
    id: 'none',
    name: 'Clásico',
    description: 'Estilo natural sin accesorios.',
    minLevel: 1,
  },
  {
    id: 'glasses',
    name: 'Lentes de estudio',
    description: 'Desbloqueado al alcanzar Nivel 2.',
    minLevel: 2,
  },
  {
    id: 'headphones',
    name: 'Auriculares chill',
    description: 'Desbloqueado al alcanzar Nivel 3.',
    minLevel: 3,
  },
  {
    id: 'headband',
    name: 'Vincha Dojo',
    description: 'Desbloqueado al alcanzar Nivel 4.',
    minLevel: 4,
  },
  {
    id: 'crown',
    name: 'Corona dorada',
    description: 'Desbloqueado al alcanzar Nivel 5.',
    minLevel: 5,
  },
  {
    id: 'halo',
    name: 'Aura neón',
    description: 'Desbloqueado al alcanzar Nivel 6.',
    minLevel: 6,
  },
];

function resolveStorePaths(dbPath?: string): { primary: string | null; legacy: string | null } {
  if (!dbPath || dbPath === ':memory:') return { primary: null, legacy: null };
  const dir = path.dirname(path.resolve(dbPath));
  return {
    primary: path.join(dir, 'nuko-progression.json'),
    legacy: path.join(dir, 'troko-progression.json'),
  };
}

function createInitialCompanionStore(): StoredCompanionProgression {
  return {
    xp: 0,
    focusStreakBlocks: 0,
    totalFocusCleanBlocks: 0,
    totalStudyBlocksMastered: 0,
    totalQuizzesCorrect: 0,
    equippedAccessory: 'none',
  };
}

function createInitialDualStore(): StoredDualProgression {
  return {
    activeCompanion: 'nuko',
    companions: {
      nuko: createInitialCompanionStore(),
      luma: createInitialCompanionStore(),
    },
  };
}

function sanitizeCompanionStore(raw: unknown): StoredCompanionProgression {
  if (typeof raw !== 'object' || raw === null) {
    return createInitialCompanionStore();
  }
  const obj = raw as Partial<StoredCompanionProgression>;
  const eq = NUKO_ACCESSORY_IDS.includes(obj.equippedAccessory as NukoAccessoryId)
    ? (obj.equippedAccessory as NukoAccessoryId)
    : 'none';
  return {
    xp: Math.max(0, Number(obj.xp ?? 0) || 0),
    focusStreakBlocks: Math.max(0, Number(obj.focusStreakBlocks ?? 0) || 0),
    totalFocusCleanBlocks: Math.max(0, Number(obj.totalFocusCleanBlocks ?? 0) || 0),
    totalStudyBlocksMastered: Math.max(0, Number(obj.totalStudyBlocksMastered ?? 0) || 0),
    totalQuizzesCorrect: Math.max(0, Number(obj.totalQuizzesCorrect ?? 0) || 0),
    equippedAccessory: eq,
    lastRewardReason: typeof obj.lastRewardReason === 'string' ? obj.lastRewardReason : undefined,
  };
}

function computeLevelInfo(xp: number, companionId: CompanionId = 'nuko'): {
  level: number;
  levelTitle: string;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPct: number;
} {
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i += 1) {
    if (xp >= LEVEL_THRESHOLDS[i]!) {
      level = i + 1;
    } else {
      break;
    }
  }
  const currentFloor = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const nextFloor = LEVEL_THRESHOLDS[level] ?? currentFloor + 800;
  const span = Math.max(1, nextFloor - currentFloor);
  const xpIntoLevel = Math.max(0, xp - currentFloor);
  const progressPct = Math.min(100, Math.round((xpIntoLevel / span) * 100));
  const titles = LEVEL_TITLES_BY_COMPANION[companionId];
  const titleIdx = Math.min(titles.length - 1, level - 1);
  return {
    level,
    levelTitle: titles[titleIdx] ?? 'Leyenda Nuko',
    xpIntoLevel,
    xpForNextLevel: span,
    progressPct,
  };
}

function buildProgressionState(
  stored: StoredCompanionProgression,
  companionId: CompanionId
): ProgressionState {
  const lvl = computeLevelInfo(stored.xp, companionId);
  const unlockedAccessories = BASE_ACCESSORIES.filter((a) => lvl.level >= a.minLevel).map(
    (a) => a.id
  );
  const equipped = unlockedAccessories.includes(stored.equippedAccessory)
    ? stored.equippedAccessory
    : 'none';

  return {
    xp: stored.xp,
    level: lvl.level,
    levelTitle: lvl.levelTitle,
    xpIntoLevel: lvl.xpIntoLevel,
    xpForNextLevel: lvl.xpForNextLevel,
    progressPct: lvl.progressPct,
    focusStreakBlocks: stored.focusStreakBlocks,
    totalFocusCleanBlocks: stored.totalFocusCleanBlocks,
    totalStudyBlocksMastered: stored.totalStudyBlocksMastered,
    totalQuizzesCorrect: stored.totalQuizzesCorrect,
    equippedAccessory: equipped,
    unlockedAccessories,
    ...(stored.lastRewardReason ? { lastRewardReason: stored.lastRewardReason } : {}),
  };
}

export class ProgressionService {
  private readonly filePath: string | null;
  private readonly legacyPath: string | null;
  private readonly eventBus: EventBus;
  private store: StoredDualProgression;

  constructor(dbPath: string | undefined, eventBus: EventBus) {
    const paths = resolveStorePaths(dbPath);
    this.filePath = paths.primary;
    this.legacyPath = paths.legacy;
    this.eventBus = eventBus;
    this.store = this.loadStore();
  }

  private loadStore(): StoredDualProgression {
    let sourcePath: string | null = null;
    if (this.filePath && fs.existsSync(this.filePath)) {
      sourcePath = this.filePath;
    } else if (this.legacyPath && fs.existsSync(this.legacyPath)) {
      sourcePath = this.legacyPath;
    }
    if (!sourcePath) {
      return createInitialDualStore();
    }
    try {
      const raw = JSON.parse(fs.readFileSync(sourcePath, 'utf8')) as Record<string, unknown>;
      // New dual-companion format
      if (raw['companions'] && typeof raw['companions'] === 'object') {
        const comps = raw['companions'] as Record<string, unknown>;
        const active: CompanionId = COMPANION_IDS.includes(raw['activeCompanion'] as CompanionId)
          ? (raw['activeCompanion'] as CompanionId)
          : 'nuko';
        const loaded: StoredDualProgression = {
          activeCompanion: active,
          companions: {
            nuko: sanitizeCompanionStore(comps['nuko']),
            luma: sanitizeCompanionStore(comps['luma']),
          },
        };
        if (sourcePath === this.legacyPath && this.filePath) {
          this.saveDualStoreToDisk(loaded);
        }
        return loaded;
      }

      // Legacy flat format -> migrate into companions.nuko, initialize luma fresh
      const migrated: StoredDualProgression = {
        activeCompanion: 'nuko',
        companions: {
          nuko: sanitizeCompanionStore(raw),
          luma: createInitialCompanionStore(),
        },
      };
      this.saveDualStoreToDisk(migrated);
      return migrated;
    } catch {
      return createInitialDualStore();
    }
  }

  private saveDualStoreToDisk(data: StoredDualProgression): void {
    if (!this.filePath) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch {
      // Ignore write failures in read-only test paths
    }
  }

  private saveStore(): void {
    this.saveDualStoreToDisk(this.store);
  }

  getActiveCompanion(): CompanionId {
    return this.store.activeCompanion;
  }

  setActiveCompanion(companion: CompanionId): CompanionId {
    if (!COMPANION_IDS.includes(companion)) {
      throw new HttpError(400, 'Compañero inválido: elegí nuko o luma.');
    }
    this.store.activeCompanion = companion;
    this.saveStore();
    this.eventBus.publish('data.updated', { scope: 'progression', activeCompanion: companion });
    return this.store.activeCompanion;
  }

  getState(companionId?: CompanionId): ProgressionState {
    const target = companionId ?? this.store.activeCompanion;
    return buildProgressionState(this.store.companions[target], target);
  }

  getAllCompanions(): CompanionProgressionMap {
    return {
      nuko: buildProgressionState(this.store.companions.nuko, 'nuko'),
      luma: buildProgressionState(this.store.companions.luma, 'luma'),
    };
  }

  getTotalCleanFocusBlocksAllCompanions(): number {
    return (
      this.store.companions.nuko.totalFocusCleanBlocks +
      this.store.companions.luma.totalFocusCleanBlocks
    );
  }

  getCatalog(companionId?: CompanionId): AccessoryCatalogItem[] {
    const { level } = this.getState(companionId);
    return BASE_ACCESSORIES.map((item) => ({
      ...item,
      unlocked: level >= item.minLevel,
    }));
  }

  awardXp(
    amount: number,
    reason: string,
    statsDelta?: {
      cleanFocusBlock?: boolean;
      resetFocusStreak?: boolean;
      studyBlockMastered?: boolean;
      quizCorrect?: boolean;
    }
  ): { state: ProgressionState; leveledUp: boolean; xpAdded: number } {
    const active = this.store.activeCompanion;
    const compStore = this.store.companions[active];
    const prevLevel = this.getState(active).level;
    const safeAmount = Math.max(0, Math.round(amount));
    compStore.xp += safeAmount;
    if (safeAmount > 0) {
      compStore.lastRewardReason = `${reason} (+${safeAmount} XP)`;
    }

    if (statsDelta?.resetFocusStreak) {
      compStore.focusStreakBlocks = 0;
    } else if (statsDelta?.cleanFocusBlock) {
      compStore.focusStreakBlocks += 1;
      compStore.totalFocusCleanBlocks += 1;
    }
    if (statsDelta?.studyBlockMastered) {
      compStore.totalStudyBlocksMastered += 1;
    }
    if (statsDelta?.quizCorrect) {
      compStore.totalQuizzesCorrect += 1;
    }

    const nextState = this.getState(active);
    const leveledUp = nextState.level > prevLevel;

    if (leveledUp) {
      const newlyUnlocked = BASE_ACCESSORIES.find((a) => a.minLevel === nextState.level);
      if (newlyUnlocked && compStore.equippedAccessory === 'none') {
        compStore.equippedAccessory = newlyUnlocked.id;
      }
      this.eventBus.setIslandState({
        state: 'success',
        mood: 'festejo',
        statusText: `Nivel ${nextState.level}`,
        badgeWord: `¡Nivel ${nextState.level}!`,
        peekCard: null,
      });
    }

    this.saveStore();
    this.eventBus.publish('data.updated', { scope: 'progression' });
    return {
      state: this.getState(active),
      leveledUp,
      xpAdded: safeAmount,
    };
  }

  breakFocusStreak(): void {
    const active = this.store.activeCompanion;
    const compStore = this.store.companions[active];
    if (compStore.focusStreakBlocks !== 0) {
      compStore.focusStreakBlocks = 0;
      this.saveStore();
      this.eventBus.publish('data.updated', { scope: 'progression' });
    }
  }

  equipAccessory(accessoryId: NukoAccessoryId): ProgressionState {
    if (!NUKO_ACCESSORY_IDS.includes(accessoryId)) {
      throw new HttpError(400, `Accesorio desconocido: ${accessoryId}`);
    }
    const active = this.store.activeCompanion;
    const state = this.getState(active);
    if (!state.unlockedAccessories.includes(accessoryId)) {
      const item = BASE_ACCESSORIES.find((a) => a.id === accessoryId);
      throw new HttpError(
        403,
        `Necesitás alcanzar el Nivel ${item?.minLevel ?? 2} con ${active === 'luma' ? 'Luma' : 'Nuko'} para desbloquear «${item?.name ?? accessoryId}».`
      );
    }
    this.store.companions[active].equippedAccessory = accessoryId;
    this.saveStore();
    this.eventBus.publish('data.updated', { scope: 'progression' });
    return this.getState(active);
  }

  wipe(): void {
    this.store = createInitialDualStore();
    this.saveStore();
    this.eventBus.publish('data.updated', { scope: 'progression' });
  }
}
