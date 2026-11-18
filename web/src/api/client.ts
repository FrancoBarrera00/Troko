import type {
  AiConnectionTestResult,
  AiDetectResult,
  AppSettings,
  EmailDraft,
  EmailMessage,
  FocusPhase,
  FocusSession,
  Habit,
  HabitSceneId,
  IntegrationRecord,
  IslandStatusPayload,
  MemoryExportPayload,
  Reminder,
  ReminderRecurrence,
  SettingsPatch,
  SummarySnapshot,
  Task,
  Timer,
  TrokoMood,
} from '../../../shared/types.ts';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!res.ok) {
    let errText = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) errText = data.error;
    } catch {
      // ignore
    }
    throw new Error(errText);
  }
  return (await res.json()) as T;
}

export interface HabitWithProgress extends Habit {
  todayProgress: number;
  progressToday: number;
  weeklyRing: Array<{
    day: string;
    dateYmd: string;
    progress: number;
    goal: number;
    completed: boolean;
  }>;
}

export interface FocusStateResponse {
  ok: true;
  session: FocusSession | null;
  id?: string;
  label?: string | null;
  durationSec: number;
  breakSec: number;
  remainingSec: number;
  phase: FocusPhase;
  cycleIndex: number;
  status: string;
  completedBlocksToday: number;
  totalMinutesToday: number;
  lastCompletedPhase: FocusPhase | null;
  readyForBreak: boolean;
  weeklyStats: Array<{
    day: string;
    dateYmd: string;
    blocks: number;
    minutes: number;
  }>;
}

export interface ChatMessageItem {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  inputMode: 'text' | 'voice';
  emotion: TrokoMood | null;
  toolAction: Record<string, unknown> | null;
  createdAt: string;
}

export interface OnboardingStateResponse {
  ok: true;
  completed: boolean;
  onboardingCompleted: boolean;
  modelName: string;
  quantization: string;
  sizeLabel: string;
  totalBytes: number;
  downloadedBytes: number;
  progressPct: number;
  status: 'idle' | 'downloading' | 'paused' | 'completed' | 'error';
}

export interface DesktopScanResponse {
  ok: true;
  batchId: string;
  targetDir: string;
  totalFiles: number;
  files: Array<{
    fileName: string;
    category: string;
    sizeBytes: number;
    sourcePath: string;
    destPath: string;
  }>;
  byCategory: Record<string, number>;
  lastBatchId: string | null;
}

export const apiClient = {
  // Core
  getSummary(): Promise<SummarySnapshot> {
    return requestJson<SummarySnapshot>('/api/summary');
  },
  getSettings(): Promise<AppSettings> {
    return requestJson<AppSettings>('/api/settings');
  },
  patchSettings(patch: SettingsPatch & Record<string, unknown>): Promise<AppSettings> {
    return requestJson<AppSettings>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },
  getIslandState(): Promise<IslandStatusPayload> {
    return requestJson<IslandStatusPayload>('/api/island/state');
  },
  setIslandState(
    payload: Partial<IslandStatusPayload>
  ): Promise<{ ok: true; island: IslandStatusPayload }> {
    return requestJson<{ ok: true; island: IslandStatusPayload }>('/api/island/state', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  wakeApp(): Promise<{
    ok: true;
    missedReminders: Reminder[];
    island: IslandStatusPayload;
  }> {
    return requestJson('/api/app/wake', { method: 'POST', body: '{}' });
  },
  exitApp(): Promise<{ ok: true; exited: true; island: IslandStatusPayload }> {
    return requestJson('/api/app/exit', { method: 'POST', body: '{}' });
  },

  // AI Detection & Connection Test
  detectOllama(endpoint?: string): Promise<AiDetectResult> {
    const qs = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : '';
    return requestJson<AiDetectResult>(`/api/ai/detect${qs}`);
  },
  testAiConnection(
    config?: Partial<
      Pick<AppSettings, 'aiProvider' | 'aiEndpoint' | 'aiModel' | 'aiApiKey'>
    >
  ): Promise<AiConnectionTestResult> {
    return requestJson<AiConnectionTestResult>('/api/ai/test', {
      method: 'POST',
      body: JSON.stringify(config ?? {}),
    });
  },

  // Tasks
  async listTasks(): Promise<Task[]> {
    const res = await requestJson<{ ok: true; tasks: Task[] }>('/api/tasks');
    return res.tasks ?? [];
  },
  async createTask(title: string): Promise<Task> {
    const res = await requestJson<{ ok: true; task: Task }>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
    return res.task;
  },
  async updateTask(
    id: string,
    patch: { title?: string; completed?: boolean }
  ): Promise<Task> {
    const res = await requestJson<{ ok: true; task: Task }>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    return res.task;
  },
  async deleteTask(id: string): Promise<void> {
    await requestJson(`/api/tasks/${id}`, { method: 'DELETE' });
  },

  // Reminders
  async listReminders(): Promise<Reminder[]> {
    const res = await requestJson<{ ok: true; reminders: Reminder[] }>('/api/reminders');
    return res.reminders ?? [];
  },
  async createReminder(input: {
    title: string;
    triggerAt: string;
    recurrence?: ReminderRecurrence;
    soundEnabled?: boolean;
  }): Promise<Reminder> {
    const res = await requestJson<{ ok: true; reminder: Reminder }>('/api/reminders', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return res.reminder;
  },
  async dismissReminder(id: string): Promise<Reminder> {
    const res = await requestJson<{ ok: true; reminder: Reminder }>(
      `/api/reminders/${id}/dismiss`,
      { method: 'POST', body: '{}' }
    );
    return res.reminder;
  },
  async ackMissedReminder(id: string): Promise<Reminder> {
    const res = await requestJson<{ ok: true; reminder: Reminder }>(
      `/api/reminders/${id}/ack-missed`,
      { method: 'POST', body: '{}' }
    );
    return res.reminder;
  },
  async deleteReminder(id: string): Promise<void> {
    await requestJson(`/api/reminders/${id}`, { method: 'DELETE' });
  },

  // Timers
  async listTimers(): Promise<Timer[]> {
    const res = await requestJson<{ ok: true; timers: Timer[] }>('/api/timers');
    return res.timers ?? [];
  },
  async createTimer(input: { label: string; durationSec: number }): Promise<Timer> {
    const res = await requestJson<{ ok: true; timer: Timer }>('/api/timers', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return res.timer;
  },
  async pauseTimer(id: string): Promise<Timer> {
    const res = await requestJson<{ ok: true; timer: Timer }>(
      `/api/timers/${id}/pause`,
      { method: 'POST', body: '{}' }
    );
    return res.timer;
  },
  async resumeTimer(id: string): Promise<Timer> {
    const res = await requestJson<{ ok: true; timer: Timer }>(
      `/api/timers/${id}/resume`,
      { method: 'POST', body: '{}' }
    );
    return res.timer;
  },
  async cancelTimer(id: string): Promise<Timer> {
    const res = await requestJson<{ ok: true; timer: Timer }>(
      `/api/timers/${id}/cancel`,
      { method: 'POST', body: '{}' }
    );
    return res.timer;
  },

  // Focus
  getFocus(): Promise<FocusStateResponse> {
    return requestJson<FocusStateResponse>('/api/focus');
  },
  startFocus(
    input: {
      label?: string;
      durationSec?: number;
      breakSec?: number;
      phase?: FocusPhase;
    } = {}
  ): Promise<FocusStateResponse> {
    return requestJson<FocusStateResponse>('/api/focus/start', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  pauseFocus(): Promise<FocusStateResponse> {
    return requestJson<FocusStateResponse>('/api/focus/pause', {
      method: 'POST',
      body: '{}',
    });
  },
  resumeFocus(): Promise<FocusStateResponse> {
    return requestJson<FocusStateResponse>('/api/focus/resume', {
      method: 'POST',
      body: '{}',
    });
  },
  extendFocus(minutes = 5): Promise<FocusStateResponse> {
    return requestJson<FocusStateResponse>('/api/focus/extend', {
      method: 'POST',
      body: JSON.stringify({ minutes }),
    });
  },
  finishFocus(): Promise<FocusStateResponse> {
    return requestJson<FocusStateResponse>('/api/focus/finish', {
      method: 'POST',
      body: '{}',
    });
  },
  stopFocus(): Promise<FocusStateResponse> {
    return requestJson<FocusStateResponse>('/api/focus/stop', {
      method: 'POST',
      body: '{}',
    });
  },

  // Habits
  async listHabits(): Promise<HabitWithProgress[]> {
    const res = await requestJson<{ ok: true; habits: HabitWithProgress[] }>(
      '/api/habits'
    );
    return res.habits ?? [];
  },
  async createHabit(input: {
    name: string;
    sceneId: HabitSceneId;
    unitLabel: string;
    dailyGoal: number;
    unitVolumeLabel?: string | null;
    reminderTime?: string | null;
  }): Promise<HabitWithProgress> {
    const res = await requestJson<{ ok: true; habit: HabitWithProgress }>(
      '/api/habits',
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    );
    return res.habit;
  },
  async updateHabit(
    id: string,
    patch: Partial<{
      name: string;
      sceneId: HabitSceneId;
      unitLabel: string;
      dailyGoal: number;
      unitVolumeLabel: string | null;
      reminderTime: string | null;
    }>
  ): Promise<HabitWithProgress> {
    const res = await requestJson<{ ok: true; habit: HabitWithProgress }>(
      `/api/habits/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }
    );
    return res.habit;
  },
  async deleteHabit(id: string): Promise<void> {
    await requestJson(`/api/habits/${id}`, { method: 'DELETE' });
  },
  async incrementHabit(id: string): Promise<HabitWithProgress> {
    const res = await requestJson<{ ok: true; habit: HabitWithProgress }>(
      `/api/habits/${id}/increment`,
      { method: 'POST', body: '{}' }
    );
    return res.habit;
  },
  async undoHabit(id: string): Promise<HabitWithProgress> {
    const res = await requestJson<{ ok: true; habit: HabitWithProgress }>(
      `/api/habits/${id}/undo`,
      { method: 'POST', body: '{}' }
    );
    return res.habit;
  },
  async testHabitReminder(id: string): Promise<HabitWithProgress> {
    const res = await requestJson<{ ok: true; habit: HabitWithProgress }>(
      `/api/habits/${id}/test-reminder`,
      { method: 'POST', body: '{}' }
    );
    return res.habit;
  },

  // Chat & NLU
  async listChatMessages(): Promise<ChatMessageItem[]> {
    const res = await requestJson<{ ok: true; messages: ChatMessageItem[] }>(
      '/api/chat'
    );
    return res.messages ?? [];
  },
  sendChatCommand(
    text: string,
    inputMode: 'text' | 'voice' = 'text'
  ): Promise<{
    ok: true;
    userMessage: ChatMessageItem;
    assistantMessage: ChatMessageItem;
    reply: string;
    emotion: TrokoMood;
    toolAction: Record<string, unknown> | null;
    island: IslandStatusPayload;
  }> {
    return requestJson('/api/chat/command', {
      method: 'POST',
      body: JSON.stringify({ text, inputMode }),
    });
  },
  async clearChat(): Promise<void> {
    await requestJson('/api/chat', { method: 'DELETE' });
  },

  // Onboarding
  getOnboarding(): Promise<OnboardingStateResponse> {
    return requestJson<OnboardingStateResponse>('/api/onboarding');
  },
  startModelDownload(): Promise<OnboardingStateResponse> {
    return requestJson<OnboardingStateResponse>('/api/onboarding/download/start', {
      method: 'POST',
      body: '{}',
    });
  },
  pauseModelDownload(): Promise<OnboardingStateResponse> {
    return requestJson<OnboardingStateResponse>('/api/onboarding/download/pause', {
      method: 'POST',
      body: '{}',
    });
  },
  resumeModelDownload(): Promise<OnboardingStateResponse> {
    return requestJson<OnboardingStateResponse>('/api/onboarding/download/resume', {
      method: 'POST',
      body: '{}',
    });
  },
  completeOnboarding(skipped = false): Promise<OnboardingStateResponse> {
    return requestJson<OnboardingStateResponse>('/api/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify({ skipped }),
    });
  },

  // OS Tools: Desktop
  scanDesktop(): Promise<DesktopScanResponse> {
    return requestJson<DesktopScanResponse>('/api/desktop/scan');
  },
  previewDesktopTidy(): Promise<DesktopScanResponse> {
    return requestJson<DesktopScanResponse>('/api/desktop/tidy/preview', {
      method: 'POST',
      body: '{}',
    });
  },
  applyDesktopTidy(): Promise<{
    ok: true;
    batchId: string;
    movedCount: number;
    targetDir: string;
  }> {
    return requestJson('/api/desktop/tidy/apply', {
      method: 'POST',
      body: '{}',
    });
  },
  undoDesktopTidy(batchId?: string): Promise<{
    ok: true;
    batchId: string | null;
    restoredCount: number;
  }> {
    return requestJson('/api/desktop/tidy/undo', {
      method: 'POST',
      body: JSON.stringify(batchId ? { batchId } : {}),
    });
  },
  seedDesktopSample(): Promise<DesktopScanResponse> {
    return requestJson<DesktopScanResponse>('/api/desktop/seed-sample', {
      method: 'POST',
      body: '{}',
    });
  },

  // OS Tools: Mail
  getInbox(): Promise<{
    ok: true;
    messages: EmailMessage[];
    drafts: EmailDraft[];
    unreadCount: number;
  }> {
    return requestJson('/api/mail/inbox');
  },
  syncInbox(): Promise<{
    ok: true;
    messages: EmailMessage[];
    drafts: EmailDraft[];
    unreadCount: number;
  }> {
    return requestJson('/api/mail/sync', { method: 'POST', body: '{}' });
  },
  async createEmailDraft(input: {
    sourceMessageId?: string | null;
    toName?: string;
    toEmail?: string;
    subject?: string;
    body: string;
  }): Promise<EmailDraft> {
    const res = await requestJson<{ ok: true; draft: EmailDraft }>(
      '/api/mail/draft',
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    );
    return res.draft;
  },
  async updateEmailDraft(
    id: string,
    patch: { subject?: string; body?: string }
  ): Promise<EmailDraft> {
    const res = await requestJson<{ ok: true; draft: EmailDraft }>(
      `/api/mail/drafts/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }
    );
    return res.draft;
  },
  async sendEmailDraft(id: string): Promise<EmailDraft> {
    const res = await requestJson<{ ok: true; draft: EmailDraft }>(
      `/api/mail/drafts/${id}/send`,
      { method: 'POST', body: '{}' }
    );
    return res.draft;
  },
  async discardEmailDraft(id: string): Promise<EmailDraft> {
    const res = await requestJson<{ ok: true; draft: EmailDraft }>(
      `/api/mail/drafts/${id}/discard`,
      { method: 'POST', body: '{}' }
    );
    return res.draft;
  },

  // OS Tools: Apps & Integrations
  listApps(): Promise<{
    ok: true;
    apps: string[];
    recentLaunches: Array<{ app: string; launchedAt: string }>;
  }> {
    return requestJson('/api/apps');
  },
  launchApp(app: string): Promise<{ ok: true; app: string; launchedAt: string }> {
    return requestJson('/api/apps/launch', {
      method: 'POST',
      body: JSON.stringify({ app }),
    });
  },
  async listIntegrations(): Promise<IntegrationRecord[]> {
    const res = await requestJson<{ ok: true; integrations: IntegrationRecord[] }>(
      '/api/integrations'
    );
    return res.integrations ?? [];
  },
  async patchIntegration(
    type: string,
    patch: { enabled?: boolean; config?: Record<string, unknown> }
  ): Promise<IntegrationRecord> {
    const res = await requestJson<{ ok: true; integration: IntegrationRecord }>(
      `/api/integrations/${type}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }
    );
    return res.integration;
  },
  testIntegration(
    type: string,
    config?: Record<string, unknown>
  ): Promise<{
    ok: boolean;
    imapOk?: boolean;
    smtpOk?: boolean;
    details: string;
  }> {
    return requestJson(`/api/integrations/${type}/test`, {
      method: 'POST',
      body: JSON.stringify(config ? { config } : {}),
    });
  },

  // System Telemetry & Real Desktop Path
  getSystemStats(): Promise<{
    ok: true;
    hostname: string;
    platform: string;
    arch: string;
    release: string;
    cpuModel: string;
    cpuCores: number;
    loadAvg1m: number;
    memTotalBytes: number;
    memFreeBytes: number;
    memUsedPct: number;
    uptimeSec: number;
    realDesktopDir: string;
    currentDesktopDir: string;
  }> {
    return requestJson('/api/system/stats');
  },

  // Quick Scratchpad Notes
  async listNotes(): Promise<
    Array<{
      id: string;
      content: string;
      pinned: boolean;
      createdAt: string;
      updatedAt: string;
    }>
  > {
    const res = await requestJson<{
      ok: true;
      notes: Array<{
        id: string;
        content: string;
        pinned: boolean;
        createdAt: string;
        updatedAt: string;
      }>;
    }>('/api/notes');
    return res.notes ?? [];
  },
  async createNote(content: string, pinned = false): Promise<{
    id: string;
    content: string;
    pinned: boolean;
    createdAt: string;
    updatedAt: string;
  }> {
    const res = await requestJson<{
      ok: true;
      note: {
        id: string;
        content: string;
        pinned: boolean;
        createdAt: string;
        updatedAt: string;
      };
    }>('/api/notes', {
      method: 'POST',
      body: JSON.stringify({ content, pinned }),
    });
    return res.note;
  },
  async updateNote(
    id: string,
    patch: { content?: string; pinned?: boolean }
  ): Promise<{
    id: string;
    content: string;
    pinned: boolean;
    createdAt: string;
    updatedAt: string;
  }> {
    const res = await requestJson<{
      ok: true;
      note: {
        id: string;
        content: string;
        pinned: boolean;
        createdAt: string;
        updatedAt: string;
      };
    }>(`/api/notes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    return res.note;
  },
  async deleteNote(id: string): Promise<void> {
    await requestJson(`/api/notes/${id}`, { method: 'DELETE' });
  },

  // Memory Export & Wipe
  exportMemory(): Promise<MemoryExportPayload> {
    return requestJson<MemoryExportPayload>('/api/memory/export', {
      method: 'POST',
      body: '{}',
    });
  },
  wipeMemory(): Promise<{ ok: true }> {
    return requestJson<{ ok: true }>('/api/memory/wipe', {
      method: 'POST',
      body: '{}',
    });
  },
};

export const api = apiClient;

