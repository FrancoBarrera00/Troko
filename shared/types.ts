// === Exact Enumerations / Literal Unions (PROJECT.md § Interface Contracts) ===
export const ISLAND_STATES = [
  'idle',
  'listen',
  'think',
  'speak',
  'alert',
  'attentive',
  'notification',
  'sleep',
  'focus',
  'success',
  'remind',
] as const;
export type IslandState = (typeof ISLAND_STATES)[number];

export const TROKO_MOODS = [
  'contento',
  'enamorado',
  'sorpresa',
  'orgulloso',
  'guino',
  'bostezo',
  'molesto',
  'escucha',
  'mareado',
  'festejo',
  'saludo',
  'animo',
] as const;
export type TrokoMood = (typeof TROKO_MOODS)[number];

export const HABIT_SCENE_IDS = [
  'water',
  'book',
  'dumbbell',
  'sun',
  'laptop',
  'sleep',
  'walk',
  'stretch',
  'journal',
  'music',
  'cook',
  'clean',
  'study',
  'detox',
  'breathe',
] as const;
export type HabitSceneId = (typeof HABIT_SCENE_IDS)[number];

export const TAB_IDS = [
  'inicio',
  'chat',
  'tareas',
  'habitos',
  'enfoque',
  'correo',
  'mi_mac',
  'ajustes',
] as const;
export type TabId = (typeof TAB_IDS)[number];

export const AI_PROVIDERS = [
  'local_fallback',
  'ollama',
  'llama_cpp',
  'openai_compatible',
  'openai',
] as const;
export type AIProviderType = (typeof AI_PROVIDERS)[number];

export const OS_PERMISSION_STATUSES = [
  'granted',
  'denied',
  'prompt',
  'unavailable',
] as const;
export type OSPermissionStatus = (typeof OS_PERMISSION_STATUSES)[number];

export const REMINDER_RECURRENCES = ['daily', 'weekdays', 'weekly'] as const;
export type ReminderRecurrence = (typeof REMINDER_RECURRENCES)[number] | null;

// === Peek Cards & Island Status ===
export type PeekCard =
  | {
      kind: 'desktop_tidy';
      batchId: string;
      totalFiles: number;
      categories: Record<string, number>;
      items: Array<{ fileName: string; category: string }>;
    }
  | {
      kind: 'email_draft';
      draftId: string;
      toName: string;
      toEmail: string;
      subject: string;
      body: string;
    }
  | {
      kind: 'habit_remind';
      habitId: string;
      habitName: string;
      progress: number;
      goal: number;
      unitLabel: string;
    }
  | {
      kind: 'missed_reminders';
      reminders: Array<{ id: string; title: string; triggerAt: string }>;
    };

export interface IslandStatusPayload {
  state: IslandState;
  mood: TrokoMood;
  statusText: string;
  badgeWord?: string;
  focusRemainingSec?: number;
  remindMessage?: string;
  transcript?: string;
  peekCard?: PeekCard | null;
}

// === Settings ===
export interface OSPermissionsMap {
  microphone: OSPermissionStatus;
  speechRecognition: OSPermissionStatus;
  desktopFolder: OSPermissionStatus;
  mailAutomation: OSPermissionStatus;
}

export interface AppSettings {
  voiceEnabled: boolean;
  wakeWordEnabled: boolean;
  wakeWord: string;
  focusMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  sleepTimeoutSec: number;
  aiProvider: AIProviderType;
  aiEndpoint: string;
  aiModel: string;
  aiApiKey: string;
  desktopTargetDir: string;
  language: 'es' | 'en';
  onboardingCompleted: boolean;
  soundEnabled: boolean;
  permissions: OSPermissionsMap;
}

export type SettingsPatch = Partial<AppSettings>;

export interface AiDetectResult {
  ollamaDetected: boolean;
  endpoint: string;
  models: string[];
  error?: string;
}

export interface AiConnectionTestResult {
  ok: boolean;
  provider: AIProviderType;
  endpoint: string;
  model: string;
  latencyMs: number;
  replyPreview?: string;
  error?: string;
}

// === Domain Models (1-to-1 with the 15 SQLite Tables) ===
export interface Task {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  completedAt: string | null;
}

export type ReminderStatus = 'scheduled' | 'fired' | 'missed' | 'dismissed' | 'acknowledged';
export interface Reminder {
  id: string;
  title: string;
  triggerAt: string;
  recurrence: ReminderRecurrence;
  status: ReminderStatus;
  firedAt: string | null;
  soundEnabled: boolean;
  createdAt: string;
}

export type TimerStatus = 'running' | 'paused' | 'finished' | 'cancelled';
export interface Timer {
  id: string;
  label: string;
  durationSec: number;
  remainingSec: number;
  status: TimerStatus;
  startedAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

export interface Habit {
  id: string;
  name: string;
  sceneId: HabitSceneId;
  unitLabel: string;
  dailyGoal: number;
  unitVolumeLabel: string | null;
  reminderTime: string | null;
  streakCurrent: number;
  streakBest: number;
  sortOrder: number;
  createdAt: string;
}

export interface HabitLog {
  id: string;
  habitId: string;
  dateYmd: string;
  delta: number;
  loggedAt: string;
}

export type FocusPhase = 'focus' | 'break' | 'long_break';
export type FocusStatus = 'active' | 'paused' | 'completed' | 'stopped';
export interface FocusSession {
  id: string;
  label: string | null;
  durationSec: number;
  breakSec: number;
  remainingSec: number;
  phase: FocusPhase;
  cycleIndex: number;
  status: FocusStatus;
  startedAt: string;
  endedAt: string | null;
  lastTickAt: string | null;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
}

export type MessageRole = 'user' | 'assistant' | 'system';
export type InputMode = 'text' | 'voice';
export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  inputMode: InputMode;
  intentJson: string | null;
  createdAt: string;
}

export type DesktopTidyBatchStatus = 'preview' | 'applied' | 'undone';
export interface DesktopTidyBatch {
  id: string;
  targetDir: string;
  status: DesktopTidyBatchStatus;
  fileCount: number;
  createdAt: string;
  undoneAt: string | null;
}

export interface DesktopTidyMove {
  id: string;
  batchId: string;
  fileName: string;
  category: string;
  sourcePath: string;
  destPath: string;
}

export interface EmailMessage {
  id: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  body: string;
  unread: boolean;
  receivedAt: string;
}

export type EmailDraftStatus = 'pending_confirmation' | 'sent' | 'discarded';
export interface EmailDraft {
  id: string;
  sourceMessageId: string | null;
  toName: string;
  toEmail: string;
  subject: string;
  body: string;
  status: EmailDraftStatus;
  createdAt: string;
  sentAt: string | null;
}

export type ModelDownloadStatus = 'idle' | 'downloading' | 'paused' | 'completed' | 'error';
export interface ModelDownload {
  id: string;
  modelName: string;
  totalBytes: number;
  downloadedBytes: number;
  status: ModelDownloadStatus;
  localPath: string | null;
  updatedAt: string;
}

export const INTEGRATION_TYPES = ['telegram', 'tavily', 'weather', 'imap_smtp'] as const;
export type IntegrationType = (typeof INTEGRATION_TYPES)[number];
export interface IntegrationRecord {
  id: string;
  type: IntegrationType;
  enabled: boolean;
  config: Record<string, unknown>;
  updatedAt: string;
}

// === Summary, Health, Memory Export & SSE ===
export interface SummarySnapshot {
  habitsCompletedToday: number;
  habitsTotalToday: number;
  pendingTasksCount: number;
  nextReminder: Reminder | null;
  activeFocus: FocusSession | null;
  unreadEmailsCount: number;
  looseDesktopFilesCount: number;
}

export interface HealthStatus {
  ok: true;
  version: string;
  uptimeSec: number;
}

export type ServerEventType =
  | 'island.state'
  | 'timer.tick'
  | 'focus.tick'
  | 'reminder.due'
  | 'habit.nudge'
  | 'data.updated'
  | 'mail.unread'
  | 'desktop.changed';

export interface ServerEvent<T = unknown> {
  type: ServerEventType;
  payload: T;
  ts: string;
}

export interface MemoryExportPayload {
  version: string;
  exportedAt: string;
  settings: AppSettings;
  tasks: Task[];
  reminders: Reminder[];
  timers: Timer[];
  habits: Habit[];
  habitLogs: HabitLog[];
  focusSessions: FocusSession[];
  conversations: Conversation[];
  messages: ConversationMessage[];
  desktopTidyBatches: DesktopTidyBatch[];
  desktopTidyMoves: DesktopTidyMove[];
  emailMessages: EmailMessage[];
  emailDrafts: EmailDraft[];
  modelDownloads: ModelDownload[];
  integrations: IntegrationRecord[];
}

// === Round 5: Progression / Accessories, Focus Guardian & PDF Study Blocks ===
export const TROKO_ACCESSORY_IDS = [
  'none',
  'glasses',
  'headphones',
  'headband',
  'crown',
  'halo',
] as const;
export type TrokoAccessoryId = (typeof TROKO_ACCESSORY_IDS)[number];

export interface AccessoryCatalogItem {
  id: TrokoAccessoryId;
  name: string;
  description: string;
  minLevel: number;
  unlocked: boolean;
}

export interface ProgressionState {
  xp: number;
  level: number;
  levelTitle: string;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPct: number;
  focusStreakBlocks: number;
  totalFocusCleanBlocks: number;
  totalStudyBlocksMastered: number;
  totalQuizzesCorrect: number;
  equippedAccessory: TrokoAccessoryId;
  unlockedAccessories: TrokoAccessoryId[];
  lastRewardReason?: string;
}

export type GuardianMode = 'blacklist' | 'whitelist';

export interface GuardianConfig {
  enabled: boolean;
  mode: GuardianMode;
  distractionKeywords: string[];
  allowedKeywords: string[];
  graceSec: number;
}

export interface GuardianRuntimeStatus {
  sessionDistractions: number;
  lastDetectedTitle: string | null;
  lastDistractionTitle: string | null;
  lastAlertAt: string | null;
  distractedSeconds: number;
  isCurrentlyDistracted: boolean;
}

export interface StudyQuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  answeredCorrectly?: boolean;
}

export interface StudyBlock {
  id: string;
  index: number;
  title: string;
  pageRange: string;
  fullText: string;
  keyPoints: string[];
  estimatedReadSec: number;
  quizQuestions: StudyQuizQuestion[];
  mastered: boolean;
  masteredAt: string | null;
}

export interface StudyDocument {
  id: string;
  title: string;
  sourceType: 'pdf' | 'text';
  fileName: string | null;
  totalPages: number;
  totalChars: number;
  blocks: StudyBlock[];
  createdAt: string;
  updatedAt: string;
}

export interface StudyDecodeProgress {
  active: boolean;
  stage: 'idle' | 'extracting' | 'chunking' | 'enriching' | 'done' | 'error';
  message: string;
  currentBlock: number;
  totalBlocks: number;
  totalPages: number;
}

