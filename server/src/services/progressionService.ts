import fs from 'node:fs';
import path from 'node:path';
import {
  TROKO_ACCESSORY_IDS,
  type AccessoryCatalogItem,
  type ProgressionState,
  type TrokoAccessoryId,
} from '../../../shared/types.ts';
import { HttpError } from '../app.ts';
import type { EventBus } from '../eventBus.ts';

interface StoredProgression {
  xp: number;
  focusStreakBlocks: number;
  totalFocusCleanBlocks: number;
  totalStudyBlocksMastered: number;
  totalQuizzesCorrect: number;
  equippedAccessory: TrokoAccessoryId;
  lastRewardReason?: string;
}

const LEVEL_THRESHOLDS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200] as const;

const LEVEL_TITLES = [
  'Aprendiz Curioso',
  'Lector Ágil',
  'Estudiante Enfocado',
  'Maestro del Foco',
  'Sabio Digital',
  'Leyenda Troko',
] as const;

const BASE_ACCESSORIES: ReadonlyArray<{
  id: TrokoAccessoryId;
  name: string;
  description: string;
  minLevel: number;
}> = [
  {
    id: 'none',
    name: 'Clásico',
    description: 'Estilo natural de Troko sin accesorios.',
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

function resolveStorePath(dbPath?: string): string | null {
  if (!dbPath || dbPath === ':memory:') return null;
  return path.join(path.dirname(path.resolve(dbPath)), 'troko-progression.json');
}

function createInitialStore(): StoredProgression {
  return {
    xp: 0,
    focusStreakBlocks: 0,
    totalFocusCleanBlocks: 0,
    totalStudyBlocksMastered: 0,
    totalQuizzesCorrect: 0,
    equippedAccessory: 'none',
  };
}

function computeLevelInfo(xp: number): {
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
  const nextFloor =
    LEVEL_THRESHOLDS[level] ?? currentFloor + 800;
  const span = Math.max(1, nextFloor - currentFloor);
  const xpIntoLevel = Math.max(0, xp - currentFloor);
  const progressPct = Math.min(100, Math.round((xpIntoLevel / span) * 100));
  const titleIdx = Math.min(LEVEL_TITLES.length - 1, level - 1);
  return {
    level,
    levelTitle: LEVEL_TITLES[titleIdx] ?? 'Leyenda Troko',
    xpIntoLevel,
    xpForNextLevel: span,
    progressPct,
  };
}

export class ProgressionService {
  private readonly filePath: string | null;
  private readonly eventBus: EventBus;
  private store: StoredProgression;

  constructor(dbPath: string | undefined, eventBus: EventBus) {
    this.filePath = resolveStorePath(dbPath);
    this.eventBus = eventBus;
    this.store = this.loadStore();
  }

  private loadStore(): StoredProgression {
    if (!this.filePath || !fs.existsSync(this.filePath)) {
      return createInitialStore();
    }
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Partial<StoredProgression>;
      const eq = TROKO_ACCESSORY_IDS.includes(raw.equippedAccessory as TrokoAccessoryId)
        ? (raw.equippedAccessory as TrokoAccessoryId)
        : 'none';
      return {
        xp: Math.max(0, Number(raw.xp ?? 0) || 0),
        focusStreakBlocks: Math.max(0, Number(raw.focusStreakBlocks ?? 0) || 0),
        totalFocusCleanBlocks: Math.max(0, Number(raw.totalFocusCleanBlocks ?? 0) || 0),
        totalStudyBlocksMastered: Math.max(0, Number(raw.totalStudyBlocksMastered ?? 0) || 0),
        totalQuizzesCorrect: Math.max(0, Number(raw.totalQuizzesCorrect ?? 0) || 0),
        equippedAccessory: eq,
        lastRewardReason: typeof raw.lastRewardReason === 'string' ? raw.lastRewardReason : undefined,
      };
    } catch {
      return createInitialStore();
    }
  }

  private saveStore(): void {
    if (!this.filePath) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.store, null, 2), 'utf8');
    } catch {
      // Ignore write failures in read-only test paths
    }
  }

  getState(): ProgressionState {
    const lvl = computeLevelInfo(this.store.xp);
    const unlockedAccessories = BASE_ACCESSORIES.filter((a) => lvl.level >= a.minLevel).map(
      (a) => a.id
    );
    const equipped = unlockedAccessories.includes(this.store.equippedAccessory)
      ? this.store.equippedAccessory
      : 'none';

    return {
      xp: this.store.xp,
      level: lvl.level,
      levelTitle: lvl.levelTitle,
      xpIntoLevel: lvl.xpIntoLevel,
      xpForNextLevel: lvl.xpForNextLevel,
      progressPct: lvl.progressPct,
      focusStreakBlocks: this.store.focusStreakBlocks,
      totalFocusCleanBlocks: this.store.totalFocusCleanBlocks,
      totalStudyBlocksMastered: this.store.totalStudyBlocksMastered,
      totalQuizzesCorrect: this.store.totalQuizzesCorrect,
      equippedAccessory: equipped,
      unlockedAccessories,
      ...(this.store.lastRewardReason ? { lastRewardReason: this.store.lastRewardReason } : {}),
    };
  }

  getCatalog(): AccessoryCatalogItem[] {
    const { level } = this.getState();
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
    const prevLevel = this.getState().level;
    const safeAmount = Math.max(0, Math.round(amount));
    this.store.xp += safeAmount;
    if (safeAmount > 0) {
      this.store.lastRewardReason = `${reason} (+${safeAmount} XP)`;
    }

    if (statsDelta?.resetFocusStreak) {
      this.store.focusStreakBlocks = 0;
    } else if (statsDelta?.cleanFocusBlock) {
      this.store.focusStreakBlocks += 1;
      this.store.totalFocusCleanBlocks += 1;
    }
    if (statsDelta?.studyBlockMastered) {
      this.store.totalStudyBlocksMastered += 1;
    }
    if (statsDelta?.quizCorrect) {
      this.store.totalQuizzesCorrect += 1;
    }

    const nextState = this.getState();
    const leveledUp = nextState.level > prevLevel;

    // Auto-equip newest unlock when leveling up from 'none' or celebrate
    if (leveledUp) {
      const newlyUnlocked = BASE_ACCESSORIES.find((a) => a.minLevel === nextState.level);
      if (newlyUnlocked && this.store.equippedAccessory === 'none') {
        this.store.equippedAccessory = newlyUnlocked.id;
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
      state: this.getState(),
      leveledUp,
      xpAdded: safeAmount,
    };
  }

  breakFocusStreak(): void {
    if (this.store.focusStreakBlocks !== 0) {
      this.store.focusStreakBlocks = 0;
      this.saveStore();
      this.eventBus.publish('data.updated', { scope: 'progression' });
    }
  }

  equipAccessory(accessoryId: TrokoAccessoryId): ProgressionState {
    if (!TROKO_ACCESSORY_IDS.includes(accessoryId)) {
      throw new HttpError(400, `Accesorio desconocido: ${accessoryId}`);
    }
    const state = this.getState();
    if (!state.unlockedAccessories.includes(accessoryId)) {
      const item = BASE_ACCESSORIES.find((a) => a.id === accessoryId);
      throw new HttpError(
        403,
        `Necesitas alcanzar el Nivel ${item?.minLevel ?? 2} para desbloquear «${item?.name ?? accessoryId}».`
      );
    }
    this.store.equippedAccessory = accessoryId;
    this.saveStore();
    this.eventBus.publish('data.updated', { scope: 'progression' });
    return this.getState();
  }

  wipe(): void {
    this.store = createInitialStore();
    this.saveStore();
    this.eventBus.publish('data.updated', { scope: 'progression' });
  }
}
