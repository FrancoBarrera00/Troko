import type { AppSettings } from '../../../shared/types.ts';

export const DEFAULT_SETTINGS: AppSettings = {
  voiceEnabled: true,
  wakeWordEnabled: true,
  wakeWord: 'Troko',
  focusMinutes: 25,
  breakMinutes: 5,
  longBreakMinutes: 15,
  sleepTimeoutSec: 35,
  aiProvider: 'local_fallback',
  aiEndpoint: 'http://127.0.0.1:11434',
  aiModel: 'llama3.2:3b',
  aiApiKey: '',
  desktopTargetDir: '',
  language: 'es',
  onboardingCompleted: false,
  soundEnabled: true,
  permissions: {
    microphone: 'prompt',
    speechRecognition: 'prompt',
    desktopFolder: 'prompt',
    mailAutomation: 'prompt',
  },
};

export const EXPECTED_TABLES = [
  'conversations',
  'desktop_tidy_batches',
  'desktop_tidy_moves',
  'email_drafts',
  'email_messages',
  'focus_sessions',
  'habit_logs',
  'habits',
  'integrations',
  'messages',
  'model_downloads',
  'reminders',
  'settings',
  'tasks',
  'timers',
] as const;

export const MIGRATION_001_INIT_SQL = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  trigger_at TEXT NOT NULL,
  recurrence TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  fired_at TEXT,
  sound_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS timers (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  duration_sec INTEGER NOT NULL,
  remaining_sec INTEGER NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scene_id TEXT NOT NULL,
  unit_label TEXT NOT NULL,
  daily_goal INTEGER NOT NULL,
  unit_volume_label TEXT,
  reminder_time TEXT,
  streak_current INTEGER NOT NULL DEFAULT 0,
  streak_best INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL,
  date_ymd TEXT NOT NULL,
  delta INTEGER NOT NULL,
  logged_at TEXT NOT NULL,
  FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS focus_sessions (
  id TEXT PRIMARY KEY,
  label TEXT,
  duration_sec INTEGER NOT NULL,
  break_sec INTEGER NOT NULL,
  remaining_sec INTEGER NOT NULL,
  phase TEXT NOT NULL,
  cycle_index INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  last_tick_at TEXT
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  input_mode TEXT NOT NULL DEFAULT 'text',
  intent_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS desktop_tidy_batches (
  id TEXT PRIMARY KEY,
  target_dir TEXT NOT NULL,
  status TEXT NOT NULL,
  file_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  undone_at TEXT
);

CREATE TABLE IF NOT EXISTS desktop_tidy_moves (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  category TEXT NOT NULL,
  source_path TEXT NOT NULL,
  dest_path TEXT NOT NULL,
  FOREIGN KEY (batch_id) REFERENCES desktop_tidy_batches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS email_messages (
  id TEXT PRIMARY KEY,
  from_name TEXT NOT NULL,
  from_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  snippet TEXT NOT NULL,
  body TEXT NOT NULL,
  unread INTEGER NOT NULL DEFAULT 1,
  received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_drafts (
  id TEXT PRIMARY KEY,
  source_message_id TEXT,
  to_name TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE TABLE IF NOT EXISTS model_downloads (
  id TEXT PRIMARY KEY,
  model_name TEXT NOT NULL,
  total_bytes INTEGER NOT NULL,
  downloaded_bytes INTEGER NOT NULL,
  status TEXT NOT NULL,
  local_path TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  config_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed, created_at);
CREATE INDEX IF NOT EXISTS idx_reminders_status_trigger ON reminders(status, trigger_at);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_date ON habit_logs(habit_id, date_ymd);
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tidy_moves_batch ON desktop_tidy_moves(batch_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_integrations_type ON integrations(type);
`;
