import {
  AI_PROVIDERS,
  HABIT_SCENE_IDS,
  INTEGRATION_TYPES,
  ISLAND_STATES,
  OS_PERMISSION_STATUSES,
  REMINDER_RECURRENCES,
  TAB_IDS,
  TROKO_MOODS,
} from './types.ts';
import type {
  AIProviderType,
  HabitSceneId,
  InputMode,
  IntegrationType,
  IslandState,
  IslandStatusPayload,
  OSPermissionStatus,
  OSPermissionsMap,
  PeekCard,
  ReminderRecurrence,
  SettingsPatch,
  TabId,
  TrokoMood,
} from './types.ts';

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const PERMISSION_KEYS = [
  'microphone',
  'speechRecognition',
  'desktopFolder',
  'mailAutomation',
] as const;

const ALLOWED_SETTINGS_KEYS = new Set<string>([
  'voiceEnabled',
  'ttsEnabled',
  'conVoz',
  'wakeWordEnabled',
  'wakeWord',
  'focusMinutes',
  'focusDurationMin',
  'breakMinutes',
  'breakDurationMin',
  'longBreakMinutes',
  'sleepTimeoutSec',
  'aiProvider',
  'aiEndpoint',
  'aiModel',
  'aiApiKey',
  'desktopTargetDir',
  'language',
  'onboardingCompleted',
  'soundEnabled',
  'permissions',
]);

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isNonEmptyString(v: unknown, maxLen = 500): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= maxLen;
}

export function isIsoDateString(v: unknown): v is string {
  if (typeof v !== 'string' || v.trim().length === 0) return false;
  const ms = Date.parse(v);
  return Number.isFinite(ms);
}

export function isIslandState(v: unknown): v is IslandState {
  return typeof v === 'string' && (ISLAND_STATES as readonly string[]).includes(v);
}

export function isTrokoMood(v: unknown): v is TrokoMood {
  return typeof v === 'string' && (TROKO_MOODS as readonly string[]).includes(v);
}

export function isHabitSceneId(v: unknown): v is HabitSceneId {
  return typeof v === 'string' && (HABIT_SCENE_IDS as readonly string[]).includes(v);
}

export function isTabId(v: unknown): v is TabId {
  return typeof v === 'string' && (TAB_IDS as readonly string[]).includes(v);
}

export function isAIProviderType(v: unknown): v is AIProviderType {
  return typeof v === 'string' && (AI_PROVIDERS as readonly string[]).includes(v);
}

export function isOSPermissionStatus(v: unknown): v is OSPermissionStatus {
  return typeof v === 'string' && (OS_PERMISSION_STATUSES as readonly string[]).includes(v);
}

export function isIntegrationType(v: unknown): v is IntegrationType {
  return typeof v === 'string' && (INTEGRATION_TYPES as readonly string[]).includes(v);
}

export function validatePeekCard(input: unknown): ValidationResult<PeekCard> {
  if (!isPlainObject(input)) {
    return { ok: false, error: 'peekCard must be an object' };
  }
  const kind = input['kind'];
  if (kind === 'desktop_tidy') {
    if (!isNonEmptyString(input['batchId'], 120)) {
      return { ok: false, error: 'desktop_tidy.batchId is required' };
    }
    const totalFiles = input['totalFiles'];
    if (typeof totalFiles !== 'number' || !Number.isInteger(totalFiles) || totalFiles < 0) {
      return { ok: false, error: 'desktop_tidy.totalFiles must be a non-negative integer' };
    }
    if (!isPlainObject(input['categories'])) {
      return { ok: false, error: 'desktop_tidy.categories must be an object' };
    }
    const categories: Record<string, number> = {};
    for (const [k, v] of Object.entries(input['categories'])) {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
        return { ok: false, error: `desktop_tidy.categories["${k}"] must be a non-negative number` };
      }
      categories[k] = v;
    }
    if (!Array.isArray(input['items'])) {
      return { ok: false, error: 'desktop_tidy.items must be an array' };
    }
    const items: Array<{ fileName: string; category: string }> = [];
    for (const item of input['items']) {
      if (
        !isPlainObject(item) ||
        !isNonEmptyString(item['fileName'], 260) ||
        !isNonEmptyString(item['category'], 100)
      ) {
        return { ok: false, error: 'desktop_tidy.items entries require fileName and category' };
      }
      items.push({ fileName: item['fileName'].trim(), category: item['category'].trim() });
    }
    return {
      ok: true,
      value: {
        kind: 'desktop_tidy',
        batchId: input['batchId'].trim(),
        totalFiles,
        categories,
        items,
      },
    };
  }

  if (kind === 'email_draft') {
    if (
      !isNonEmptyString(input['draftId'], 120) ||
      !isNonEmptyString(input['toName'], 200) ||
      !isNonEmptyString(input['toEmail'], 320) ||
      typeof input['subject'] !== 'string' ||
      typeof input['body'] !== 'string'
    ) {
      return {
        ok: false,
        error: 'email_draft requires draftId, toName, toEmail, subject, and body',
      };
    }
    return {
      ok: true,
      value: {
        kind: 'email_draft',
        draftId: input['draftId'].trim(),
        toName: input['toName'].trim(),
        toEmail: input['toEmail'].trim(),
        subject: input['subject'],
        body: input['body'],
      },
    };
  }

  if (kind === 'habit_remind') {
    const progress = input['progress'];
    const goal = input['goal'];
    if (
      !isNonEmptyString(input['habitId'], 120) ||
      !isNonEmptyString(input['habitName'], 120) ||
      typeof progress !== 'number' ||
      !Number.isFinite(progress) ||
      progress < 0 ||
      typeof goal !== 'number' ||
      !Number.isFinite(goal) ||
      goal < 1 ||
      !isNonEmptyString(input['unitLabel'], 80)
    ) {
      return {
        ok: false,
        error: 'habit_remind requires habitId, habitName, progress >= 0, goal >= 1, unitLabel',
      };
    }
    return {
      ok: true,
      value: {
        kind: 'habit_remind',
        habitId: input['habitId'].trim(),
        habitName: input['habitName'].trim(),
        progress,
        goal,
        unitLabel: input['unitLabel'].trim(),
      },
    };
  }

  if (kind === 'missed_reminders') {
    if (!Array.isArray(input['reminders'])) {
      return { ok: false, error: 'missed_reminders.reminders must be an array' };
    }
    const reminders: Array<{ id: string; title: string; triggerAt: string }> = [];
    for (const r of input['reminders']) {
      if (
        !isPlainObject(r) ||
        !isNonEmptyString(r['id'], 120) ||
        !isNonEmptyString(r['title'], 300) ||
        !isIsoDateString(r['triggerAt'])
      ) {
        return {
          ok: false,
          error: 'missed_reminders.reminders entries require id, title, and valid triggerAt',
        };
      }
      reminders.push({
        id: r['id'].trim(),
        title: r['title'].trim(),
        triggerAt: r['triggerAt'],
      });
    }
    return {
      ok: true,
      value: {
        kind: 'missed_reminders',
        reminders,
      },
    };
  }

  return { ok: false, error: `Unknown peekCard.kind: ${String(kind)}` };
}

export function validateIslandStatusPayload(input: unknown): ValidationResult<IslandStatusPayload> {
  if (!isPlainObject(input)) {
    return { ok: false, error: 'Island payload must be an object' };
  }
  if (!isIslandState(input['state'])) {
    return { ok: false, error: `Invalid island state: ${String(input['state'])}` };
  }
  if (!isTrokoMood(input['mood'])) {
    return { ok: false, error: `Invalid Troko mood: ${String(input['mood'])}` };
  }
  if (typeof input['statusText'] !== 'string' || input['statusText'].trim().length === 0) {
    return { ok: false, error: 'statusText must be a non-empty string' };
  }

  const out: IslandStatusPayload = {
    state: input['state'],
    mood: input['mood'],
    statusText: input['statusText'].trim(),
  };

  if (input['badgeWord'] !== undefined) {
    if (typeof input['badgeWord'] !== 'string') {
      return { ok: false, error: 'badgeWord must be a string' };
    }
    out.badgeWord = input['badgeWord'];
  }
  if (input['focusRemainingSec'] !== undefined) {
    const sec = input['focusRemainingSec'];
    if (typeof sec !== 'number' || !Number.isFinite(sec) || sec < 0) {
      return { ok: false, error: 'focusRemainingSec must be a non-negative number' };
    }
    out.focusRemainingSec = Math.floor(sec);
  }
  if (input['remindMessage'] !== undefined) {
    if (typeof input['remindMessage'] !== 'string') {
      return { ok: false, error: 'remindMessage must be a string' };
    }
    out.remindMessage = input['remindMessage'];
  }
  if (input['transcript'] !== undefined) {
    if (typeof input['transcript'] !== 'string') {
      return { ok: false, error: 'transcript must be a string' };
    }
    out.transcript = input['transcript'];
  }
  if (input['peekCard'] !== undefined) {
    if (input['peekCard'] === null) {
      out.peekCard = null;
    } else {
      const cardRes = validatePeekCard(input['peekCard']);
      if (!cardRes.ok) return cardRes;
      out.peekCard = cardRes.value;
    }
  }

  return { ok: true, value: out };
}

function validateIntRange(
  val: unknown,
  field: string,
  min: number,
  max: number
): ValidationResult<number> {
  if (typeof val !== 'number' || !Number.isInteger(val) || val < min || val > max) {
    return { ok: false, error: `${field} must be an integer between ${min} and ${max}` };
  }
  return { ok: true, value: val };
}

export function validateSettingsPatch(input: unknown): ValidationResult<SettingsPatch> {
  if (!isPlainObject(input)) {
    return { ok: false, error: 'Settings patch must be a plain object' };
  }

  for (const key of Object.keys(input)) {
    if (!ALLOWED_SETTINGS_KEYS.has(key)) {
      return { ok: false, error: `Unknown setting key: "${key}"` };
    }
  }

  const patch: SettingsPatch = {};

  if ('voiceEnabled' in input) {
    if (typeof input['voiceEnabled'] !== 'boolean') {
      return { ok: false, error: 'voiceEnabled must be a boolean' };
    }
    patch.voiceEnabled = input['voiceEnabled'];
  }

  for (const aliasKey of ['ttsEnabled', 'conVoz'] as const) {
    if (aliasKey in input) {
      if (typeof input[aliasKey] !== 'boolean') {
        return { ok: false, error: `${aliasKey} must be a boolean` };
      }
      if (patch.voiceEnabled === undefined) {
        patch.voiceEnabled = input[aliasKey];
      }
    }
  }

  if ('wakeWordEnabled' in input) {
    if (typeof input['wakeWordEnabled'] !== 'boolean') {
      return { ok: false, error: 'wakeWordEnabled must be a boolean' };
    }
    patch.wakeWordEnabled = input['wakeWordEnabled'];
  }

  if ('onboardingCompleted' in input) {
    if (typeof input['onboardingCompleted'] !== 'boolean') {
      return { ok: false, error: 'onboardingCompleted must be a boolean' };
    }
    patch.onboardingCompleted = input['onboardingCompleted'];
  }

  if ('soundEnabled' in input) {
    if (typeof input['soundEnabled'] !== 'boolean') {
      return { ok: false, error: 'soundEnabled must be a boolean' };
    }
    patch.soundEnabled = input['soundEnabled'];
  }

  if ('wakeWord' in input) {
    if (!isNonEmptyString(input['wakeWord'], 40)) {
      return { ok: false, error: 'wakeWord must be a non-empty string (1..40 chars)' };
    }
    patch.wakeWord = input['wakeWord'].trim();
  }

  if ('focusMinutes' in input) {
    const res = validateIntRange(input['focusMinutes'], 'focusMinutes', 1, 180);
    if (!res.ok) return res;
    patch.focusMinutes = res.value;
  }

  if ('focusDurationMin' in input) {
    const res = validateIntRange(input['focusDurationMin'], 'focusDurationMin', 1, 180);
    if (!res.ok) return res;
    if (patch.focusMinutes === undefined) {
      patch.focusMinutes = res.value;
    }
  }

  if ('breakMinutes' in input) {
    const res = validateIntRange(input['breakMinutes'], 'breakMinutes', 1, 60);
    if (!res.ok) return res;
    patch.breakMinutes = res.value;
  }

  if ('breakDurationMin' in input) {
    const res = validateIntRange(input['breakDurationMin'], 'breakDurationMin', 1, 60);
    if (!res.ok) return res;
    if (patch.breakMinutes === undefined) {
      patch.breakMinutes = res.value;
    }
  }

  if ('longBreakMinutes' in input) {
    const res = validateIntRange(input['longBreakMinutes'], 'longBreakMinutes', 1, 90);
    if (!res.ok) return res;
    patch.longBreakMinutes = res.value;
  }

  if ('sleepTimeoutSec' in input) {
    const v = input['sleepTimeoutSec'];
    if (typeof v !== 'number' || !Number.isInteger(v) || (v !== 0 && (v < 5 || v > 3600))) {
      return { ok: false, error: 'sleepTimeoutSec must be 0 or an integer between 5 and 3600' };
    }
    patch.sleepTimeoutSec = v;
  }

  if ('aiProvider' in input) {
    if (!isAIProviderType(input['aiProvider'])) {
      return { ok: false, error: `Invalid aiProvider: ${String(input['aiProvider'])}` };
    }
    patch.aiProvider = input['aiProvider'];
  }

  for (const strKey of ['aiEndpoint', 'aiModel', 'aiApiKey', 'desktopTargetDir'] as const) {
    if (strKey in input) {
      const v = input[strKey];
      if (typeof v !== 'string' || v.length > 500) {
        return { ok: false, error: `${strKey} must be a string <= 500 chars` };
      }
      patch[strKey] = v;
    }
  }

  if ('language' in input) {
    if (input['language'] !== 'es' && input['language'] !== 'en') {
      return { ok: false, error: 'language must be "es" or "en"' };
    }
    patch.language = input['language'];
  }

  if ('permissions' in input) {
    const perms = input['permissions'];
    if (!isPlainObject(perms)) {
      return { ok: false, error: 'permissions must be an object' };
    }
    const nextPerms: Partial<OSPermissionsMap> = {};
    for (const [k, v] of Object.entries(perms)) {
      if (!(PERMISSION_KEYS as readonly string[]).includes(k)) {
        return { ok: false, error: `Unknown permission key: "${k}"` };
      }
      if (!isOSPermissionStatus(v)) {
        return { ok: false, error: `Invalid permission status for "${k}"` };
      }
      nextPerms[k as keyof OSPermissionsMap] = v;
    }
    patch.permissions = nextPerms as OSPermissionsMap;
  }

  return { ok: true, value: patch };
}

export function validateCreateTaskInput(input: unknown): ValidationResult<{ title: string }> {
  if (!isPlainObject(input) || !isNonEmptyString(input['title'], 300)) {
    return { ok: false, error: 'title is required (1..300 chars)' };
  }
  return { ok: true, value: { title: input['title'].trim() } };
}

export function validateCreateReminderInput(
  input: unknown
): ValidationResult<{
  title: string;
  triggerAt: string;
  recurrence: ReminderRecurrence;
  soundEnabled: boolean;
}> {
  if (!isPlainObject(input)) {
    return { ok: false, error: 'Reminder body must be an object' };
  }
  if (!isNonEmptyString(input['title'], 300)) {
    return { ok: false, error: 'title is required (1..300 chars)' };
  }
  if (!isIsoDateString(input['triggerAt'])) {
    return { ok: false, error: 'triggerAt must be a valid ISO date string' };
  }
  let recurrence: ReminderRecurrence = null;
  if (input['recurrence'] !== undefined && input['recurrence'] !== null) {
    if (
      typeof input['recurrence'] !== 'string' ||
      !(REMINDER_RECURRENCES as readonly string[]).includes(input['recurrence'])
    ) {
      return { ok: false, error: 'recurrence must be daily, weekdays, weekly, or null' };
    }
    recurrence = input['recurrence'] as ReminderRecurrence;
  }
  let soundEnabled = true;
  if (input['soundEnabled'] !== undefined) {
    if (typeof input['soundEnabled'] !== 'boolean') {
      return { ok: false, error: 'soundEnabled must be a boolean' };
    }
    soundEnabled = input['soundEnabled'];
  }
  return {
    ok: true,
    value: {
      title: input['title'].trim(),
      triggerAt: new Date(input['triggerAt']).toISOString(),
      recurrence,
      soundEnabled,
    },
  };
}

export function validateCreateTimerInput(
  input: unknown
): ValidationResult<{ label: string; durationSec: number }> {
  if (!isPlainObject(input)) {
    return { ok: false, error: 'Timer body must be an object' };
  }
  const label = isNonEmptyString(input['label'], 120) ? input['label'].trim() : 'Temporizador';
  const durRes = validateIntRange(input['durationSec'], 'durationSec', 1, 86400);
  if (!durRes.ok) return durRes;
  return { ok: true, value: { label, durationSec: durRes.value } };
}

const HH_MM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateCreateHabitInput(
  input: unknown
): ValidationResult<{
  name: string;
  sceneId: HabitSceneId;
  unitLabel: string;
  dailyGoal: number;
  unitVolumeLabel: string | null;
  reminderTime: string | null;
}> {
  if (!isPlainObject(input)) {
    return { ok: false, error: 'Habit body must be an object' };
  }
  if (!isNonEmptyString(input['name'], 120)) {
    return { ok: false, error: 'name is required (1..120 chars)' };
  }
  if (!isHabitSceneId(input['sceneId'])) {
    return { ok: false, error: `Invalid sceneId: ${String(input['sceneId'])}` };
  }
  if (!isNonEmptyString(input['unitLabel'], 60)) {
    return { ok: false, error: 'unitLabel is required (1..60 chars)' };
  }
  const goalRes = validateIntRange(input['dailyGoal'], 'dailyGoal', 1, 1000);
  if (!goalRes.ok) return goalRes;

  let unitVolumeLabel: string | null = null;
  if (input['unitVolumeLabel'] !== undefined && input['unitVolumeLabel'] !== null) {
    if (typeof input['unitVolumeLabel'] !== 'string' || input['unitVolumeLabel'].trim().length > 60) {
      return { ok: false, error: 'unitVolumeLabel must be a string <= 60 chars' };
    }
    const trimmed = input['unitVolumeLabel'].trim();
    unitVolumeLabel = trimmed.length > 0 ? trimmed : null;
  }

  let reminderTime: string | null = null;
  if (input['reminderTime'] !== undefined && input['reminderTime'] !== null && input['reminderTime'] !== '') {
    if (typeof input['reminderTime'] !== 'string' || !HH_MM_REGEX.test(input['reminderTime'])) {
      return { ok: false, error: 'reminderTime must match HH:MM (00:00..23:59)' };
    }
    reminderTime = input['reminderTime'];
  }

  return {
    ok: true,
    value: {
      name: input['name'].trim(),
      sceneId: input['sceneId'],
      unitLabel: input['unitLabel'].trim(),
      dailyGoal: goalRes.value,
      unitVolumeLabel,
      reminderTime,
    },
  };
}

export function validateChatCommandInput(
  input: unknown
): ValidationResult<{ text: string; inputMode: InputMode; conversationId?: string }> {
  if (!isPlainObject(input)) {
    return { ok: false, error: 'Chat command body must be an object' };
  }
  const rawText = input['text'] ?? input['message'];
  if (!isNonEmptyString(rawText, 4000)) {
    return { ok: false, error: 'text is required (1..4000 chars)' };
  }
  let inputMode: InputMode = 'text';
  if (input['inputMode'] !== undefined) {
    if (input['inputMode'] !== 'text' && input['inputMode'] !== 'voice') {
      return { ok: false, error: 'inputMode must be "text" or "voice"' };
    }
    inputMode = input['inputMode'];
  }
  let conversationId: string | undefined;
  if (input['conversationId'] !== undefined) {
    if (!isNonEmptyString(input['conversationId'], 120)) {
      return { ok: false, error: 'conversationId must be a non-empty string' };
    }
    conversationId = input['conversationId'].trim();
  }
  return {
    ok: true,
    value: {
      text: rawText.trim(),
      inputMode,
      ...(conversationId ? { conversationId } : {}),
    },
  };
}

export function validateEmailDraftInput(
  input: unknown
): ValidationResult<{
  sourceMessageId: string | null;
  toName: string;
  toEmail: string;
  subject: string;
  body: string;
}> {
  if (!isPlainObject(input)) {
    return { ok: false, error: 'Email draft body must be an object' };
  }
  if (typeof input['body'] !== 'string' || input['body'].trim().length === 0) {
    return { ok: false, error: 'body is required' };
  }
  let sourceMessageId: string | null = null;
  if (input['sourceMessageId'] !== undefined && input['sourceMessageId'] !== null) {
    if (!isNonEmptyString(input['sourceMessageId'], 120)) {
      return { ok: false, error: 'sourceMessageId must be a non-empty string' };
    }
    sourceMessageId = input['sourceMessageId'].trim();
  }
  const rawToName = input['toName'] ?? input['recipientName'];
  const rawToEmail = input['toEmail'] ?? input['recipientEmail'];
  const hasExplicitRecipient =
    isNonEmptyString(rawToName, 200) && isNonEmptyString(rawToEmail, 320);
  if (!sourceMessageId && !hasExplicitRecipient) {
    return { ok: false, error: 'toName and toEmail are required when sourceMessageId is absent' };
  }
  return {
    ok: true,
    value: {
      sourceMessageId,
      toName: isNonEmptyString(rawToName, 200) ? rawToName.trim() : '',
      toEmail: isNonEmptyString(rawToEmail, 320) ? rawToEmail.trim() : '',
      subject: isNonEmptyString(input['subject'], 300) ? input['subject'].trim() : '',
      body: input['body'],
    },
  };
}

export function validateEmailDraftPatchInput(
  input: unknown
): ValidationResult<{ subject?: string; body?: string }> {
  if (!isPlainObject(input)) {
    return { ok: false, error: 'Email draft patch must be an object' };
  }
  const out: { subject?: string; body?: string } = {};
  if ('subject' in input) {
    if (!isNonEmptyString(input['subject'], 300)) {
      return { ok: false, error: 'subject must be a non-empty string' };
    }
    out.subject = input['subject'].trim();
  }
  if ('body' in input) {
    if (typeof input['body'] !== 'string' || input['body'].trim().length === 0) {
      return { ok: false, error: 'body must be a non-empty string' };
    }
    out.body = input['body'];
  }
  return { ok: true, value: out };
}

const SHELL_META_REGEX = /[;&|`$<>\\\r\n()]/;

export function validateAppLaunchInput(input: unknown): ValidationResult<{ appName: string }> {
  if (!isPlainObject(input)) {
    return { ok: false, error: 'App launch body must be an object' };
  }
  const rawName = input['appName'] ?? input['app'];
  if (!isNonEmptyString(rawName, 80)) {
    return { ok: false, error: 'appName is required (1..80 chars)' };
  }
  const appName = rawName.trim();
  if (SHELL_META_REGEX.test(appName)) {
    return { ok: false, error: 'appName contains forbidden shell characters' };
  }
  return { ok: true, value: { appName } };
}

export function validateIntegrationPatchInput(
  input: unknown
): ValidationResult<{ enabled?: boolean; config?: Record<string, unknown> }> {
  if (!isPlainObject(input)) {
    return { ok: false, error: 'Integration patch must be an object' };
  }
  const out: { enabled?: boolean; config?: Record<string, unknown> } = {};
  if ('enabled' in input) {
    if (typeof input['enabled'] !== 'boolean') {
      return { ok: false, error: 'enabled must be a boolean' };
    }
    out.enabled = input['enabled'];
  }
  if ('config' in input) {
    if (!isPlainObject(input['config'])) {
      return { ok: false, error: 'config must be a plain object' };
    }
    out.config = input['config'];
  }
  return { ok: true, value: out };
}
