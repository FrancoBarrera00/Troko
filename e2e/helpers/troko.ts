import {
  test as base,
  expect,
  type APIRequestContext,
  type APIResponse,
  type Locator,
  type Page,
} from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const E2E_HELPERS_DIR = path.dirname(fileURLToPath(import.meta.url));
const TROKO_REPO_ROOT = path.resolve(E2E_HELPERS_DIR, '..', '..');

export { expect };

export type TrokoTabLabel =
  | 'Inicio'
  | 'Chat'
  | 'Tareas'
  | 'Hábitos'
  | 'Enfoque'
  | 'Correo'
  | 'Mi Mac'
  | 'Ajustes';

export type IslandState =
  | 'idle'
  | 'listen'
  | 'think'
  | 'speak'
  | 'alert'
  | 'attentive'
  | 'notification'
  | 'sleep'
  | 'focus'
  | 'success'
  | 'remind';

export type TrokoMood =
  | 'contento'
  | 'enamorado'
  | 'sorpresa'
  | 'orgulloso'
  | 'guino'
  | 'bostezo'
  | 'molesto'
  | 'escucha'
  | 'mareado'
  | 'festejo'
  | 'saludo'
  | 'animo';

export type HabitSceneId =
  | 'water'
  | 'book'
  | 'dumbbell'
  | 'sun'
  | 'laptop'
  | 'sleep'
  | 'walk'
  | 'stretch'
  | 'journal'
  | 'music'
  | 'cook'
  | 'clean'
  | 'study'
  | 'detox'
  | 'breathe';

export const ALL_TROKO_MOODS: readonly TrokoMood[] = [
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

export const ALL_HABIT_SCENE_IDS: readonly HabitSceneId[] = [
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

export interface SseEvent {
  event: string;
  type: string;
  payload: unknown;
  ts: string;
  raw: string;
}

export interface JsonObject {
  [key: string]: unknown;
}

export function extractArray<T = JsonObject>(data: unknown, ...keys: string[]): T[] {
  if (Array.isArray(data)) {
    return data as T[];
  }
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of keys) {
      if (Array.isArray(obj[key])) {
        return obj[key] as T[];
      }
    }
    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) {
        return value as T[];
      }
    }
  }
  return [];
}

export class TrokoApi {
  readonly request: APIRequestContext;

  constructor(request: APIRequestContext) {
    this.request = request;
  }

  async assertOk<T = JsonObject>(res: APIResponse, contextLabel = 'API call'): Promise<T> {
    const status = res.status();
    const text = await res.text();
    if (!res.ok()) {
      throw new Error(`${contextLabel} failed with HTTP ${status}: ${text}`);
    }
    if (!text.trim()) {
      return {} as T;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  // Core
  async health(): Promise<JsonObject> {
    return this.assertOk(await this.request.get('/api/health'), 'GET /api/health');
  }

  async summary(): Promise<JsonObject> {
    return this.assertOk(await this.request.get('/api/summary'), 'GET /api/summary');
  }

  async getSettings(): Promise<JsonObject> {
    return this.assertOk(await this.request.get('/api/settings'), 'GET /api/settings');
  }

  async patchSettings(patch: Record<string, unknown>): Promise<JsonObject> {
    return this.assertOk(
      await this.request.patch('/api/settings', { data: patch }),
      'PATCH /api/settings',
    );
  }

  async exportMemory(): Promise<JsonObject> {
    return this.assertOk(await this.request.post('/api/memory/export'), 'POST /api/memory/export');
  }

  async wipeMemory(): Promise<JsonObject> {
    return this.assertOk(await this.request.post('/api/memory/wipe'), 'POST /api/memory/wipe');
  }

  async wakeApp(): Promise<JsonObject> {
    return this.assertOk(await this.request.post('/api/app/wake'), 'POST /api/app/wake');
  }

  // Tasks
  async listTasks(): Promise<JsonObject[]> {
    const data = await this.assertOk(await this.request.get('/api/tasks'), 'GET /api/tasks');
    return extractArray<JsonObject>(data, 'tasks', 'items');
  }

  async createTask(title: string): Promise<JsonObject> {
    return this.assertOk(
      await this.request.post('/api/tasks', { data: { title } }),
      'POST /api/tasks',
    );
  }

  async updateTask(id: string, patch: Record<string, unknown>): Promise<JsonObject> {
    return this.assertOk(
      await this.request.patch(`/api/tasks/${id}`, { data: patch }),
      `PATCH /api/tasks/${id}`,
    );
  }

  async deleteTask(id: string): Promise<JsonObject> {
    return this.assertOk(
      await this.request.delete(`/api/tasks/${id}`),
      `DELETE /api/tasks/${id}`,
    );
  }

  // Reminders
  async listReminders(): Promise<JsonObject[]> {
    const data = await this.assertOk(await this.request.get('/api/reminders'), 'GET /api/reminders');
    return extractArray<JsonObject>(data, 'reminders', 'items');
  }

  async createReminder(body: {
    title: string;
    triggerAt: string;
    recurrence?: string | null;
    soundEnabled?: boolean;
  }): Promise<JsonObject> {
    return this.assertOk(
      await this.request.post('/api/reminders', { data: body }),
      'POST /api/reminders',
    );
  }

  async dismissReminder(id: string): Promise<JsonObject> {
    return this.assertOk(
      await this.request.post(`/api/reminders/${id}/dismiss`),
      `POST /api/reminders/${id}/dismiss`,
    );
  }

  async ackMissedReminder(id: string): Promise<JsonObject> {
    return this.assertOk(
      await this.request.post(`/api/reminders/${id}/ack-missed`),
      `POST /api/reminders/${id}/ack-missed`,
    );
  }

  async deleteReminder(id: string): Promise<JsonObject> {
    return this.assertOk(
      await this.request.delete(`/api/reminders/${id}`),
      `DELETE /api/reminders/${id}`,
    );
  }

  // Timers
  async listTimers(): Promise<JsonObject[]> {
    const data = await this.assertOk(await this.request.get('/api/timers'), 'GET /api/timers');
    return extractArray<JsonObject>(data, 'timers', 'items');
  }

  async createTimer(body: { label: string; durationSec: number }): Promise<JsonObject> {
    return this.assertOk(
      await this.request.post('/api/timers', { data: body }),
      'POST /api/timers',
    );
  }

  async pauseTimer(id: string): Promise<JsonObject> {
    return this.assertOk(
      await this.request.post(`/api/timers/${id}/pause`),
      `POST /api/timers/${id}/pause`,
    );
  }

  async resumeTimer(id: string): Promise<JsonObject> {
    return this.assertOk(
      await this.request.post(`/api/timers/${id}/resume`),
      `POST /api/timers/${id}/resume`,
    );
  }

  async cancelTimer(id: string): Promise<JsonObject> {
    return this.assertOk(
      await this.request.post(`/api/timers/${id}/cancel`),
      `POST /api/timers/${id}/cancel`,
    );
  }

  // Focus
  async getFocus(): Promise<JsonObject> {
    return this.assertOk(await this.request.get('/api/focus'), 'GET /api/focus');
  }

  async startFocus(body: { label?: string; durationSec?: number; breakSec?: number } = {}): Promise<JsonObject> {
    return this.assertOk(
      await this.request.post('/api/focus/start', { data: body }),
      'POST /api/focus/start',
    );
  }

  async pauseFocus(): Promise<JsonObject> {
    return this.assertOk(await this.request.post('/api/focus/pause'), 'POST /api/focus/pause');
  }

  async resumeFocus(): Promise<JsonObject> {
    return this.assertOk(await this.request.post('/api/focus/resume'), 'POST /api/focus/resume');
  }

  async extendFocus(minutes = 5): Promise<JsonObject> {
    return this.assertOk(
      await this.request.post('/api/focus/extend', { data: { minutes } }),
      'POST /api/focus/extend',
    );
  }

  async finishFocus(): Promise<JsonObject> {
    return this.assertOk(await this.request.post('/api/focus/finish'), 'POST /api/focus/finish');
  }

  async stopFocus(): Promise<JsonObject> {
    return this.assertOk(await this.request.post('/api/focus/stop'), 'POST /api/focus/stop');
  }

  // Habits
  async listHabits(): Promise<JsonObject[]> {
    const data = await this.assertOk(await this.request.get('/api/habits'), 'GET /api/habits');
    return extractArray<JsonObject>(data, 'habits', 'items');
  }

  async createHabit(body: {
    name: string;
    sceneId: HabitSceneId;
    unitLabel: string;
    dailyGoal: number;
    unitVolumeLabel?: string;
    reminderTime?: string | null;
  }): Promise<JsonObject> {
    return this.assertOk(
      await this.request.post('/api/habits', { data: body }),
      'POST /api/habits',
    );
  }

  async updateHabit(id: string, patch: Record<string, unknown>): Promise<JsonObject> {
    return this.assertOk(
      await this.request.patch(`/api/habits/${id}`, { data: patch }),
      `PATCH /api/habits/${id}`,
    );
  }

  async deleteHabit(id: string): Promise<JsonObject> {
    return this.assertOk(
      await this.request.delete(`/api/habits/${id}`),
      `DELETE /api/habits/${id}`,
    );
  }

  async incrementHabit(id: string): Promise<JsonObject> {
    return this.assertOk(
      await this.request.post(`/api/habits/${id}/increment`),
      `POST /api/habits/${id}/increment`,
    );
  }

  async undoHabit(id: string): Promise<JsonObject> {
    return this.assertOk(
      await this.request.post(`/api/habits/${id}/undo`),
      `POST /api/habits/${id}/undo`,
    );
  }

  async testHabitReminder(id: string): Promise<JsonObject> {
    return this.assertOk(
      await this.request.post(`/api/habits/${id}/test-reminder`),
      `POST /api/habits/${id}/test-reminder`,
    );
  }

  // AI & Onboarding
  async getChat(): Promise<JsonObject[]> {
    const data = await this.assertOk(await this.request.get('/api/chat'), 'GET /api/chat');
    return extractArray<JsonObject>(data, 'messages', 'items');
  }

  async sendCommand(text: string, inputMode: 'text' | 'voice' = 'text'): Promise<JsonObject> {
    return this.assertOk(
      await this.request.post('/api/chat/command', { data: { text, inputMode } }),
      'POST /api/chat/command',
    );
  }

  async clearChat(): Promise<JsonObject> {
    return this.assertOk(await this.request.delete('/api/chat'), 'DELETE /api/chat');
  }

  async getOnboarding(): Promise<JsonObject> {
    return this.assertOk(await this.request.get('/api/onboarding'), 'GET /api/onboarding');
  }

  async startModelDownload(): Promise<JsonObject> {
    return this.assertOk(
      await this.request.post('/api/onboarding/download/start'),
      'POST /api/onboarding/download/start',
    );
  }

  async pauseModelDownload(): Promise<JsonObject> {
    return this.assertOk(
      await this.request.post('/api/onboarding/download/pause'),
      'POST /api/onboarding/download/pause',
    );
  }

  async resumeModelDownload(): Promise<JsonObject> {
    return this.assertOk(
      await this.request.post('/api/onboarding/download/resume'),
      'POST /api/onboarding/download/resume',
    );
  }

  async completeOnboarding(): Promise<JsonObject> {
    return this.assertOk(
      await this.request.post('/api/onboarding/complete'),
      'POST /api/onboarding/complete',
    );
  }

  // OS Tools & Bridges
  async scanDesktop(): Promise<JsonObject> {
    return this.assertOk(await this.request.get('/api/desktop/scan'), 'GET /api/desktop/scan');
  }

  async previewDesktopTidy(): Promise<JsonObject> {
    return this.assertOk(
      await this.request.post('/api/desktop/tidy/preview'),
      'POST /api/desktop/tidy/preview',
    );
  }

  async applyDesktopTidy(body: Record<string, unknown> = {}): Promise<JsonObject> {
    return this.assertOk(
      await this.request.post('/api/desktop/tidy/apply', { data: body }),
      'POST /api/desktop/tidy/apply',
    );
  }

  async undoDesktopTidy(body: Record<string, unknown> = {}): Promise<JsonObject> {
    return this.assertOk(
      await this.request.post('/api/desktop/tidy/undo', { data: body }),
      'POST /api/desktop/tidy/undo',
    );
  }

  async seedDesktopSample(): Promise<JsonObject> {
    return this.assertOk(
      await this.request.post('/api/desktop/seed-sample'),
      'POST /api/desktop/seed-sample',
    );
  }

  async getInbox(): Promise<JsonObject> {
    return this.assertOk(await this.request.get('/api/mail/inbox'), 'GET /api/mail/inbox');
  }

  async createEmailDraft(body: {
    sourceMessageId?: string;
    toName?: string;
    toEmail?: string;
    subject?: string;
    body: string;
  }): Promise<JsonObject> {
    return this.assertOk(
      await this.request.post('/api/mail/draft', { data: body }),
      'POST /api/mail/draft',
    );
  }

  async updateEmailDraft(id: string, patch: { subject?: string; body?: string }): Promise<JsonObject> {
    return this.assertOk(
      await this.request.patch(`/api/mail/drafts/${id}`, { data: patch }),
      `PATCH /api/mail/drafts/${id}`,
    );
  }

  async sendEmailDraft(id: string): Promise<JsonObject> {
    return this.assertOk(
      await this.request.post(`/api/mail/drafts/${id}/send`),
      `POST /api/mail/drafts/${id}/send`,
    );
  }

  async discardEmailDraft(id: string): Promise<JsonObject> {
    return this.assertOk(
      await this.request.post(`/api/mail/drafts/${id}/discard`),
      `POST /api/mail/drafts/${id}/discard`,
    );
  }

  async launchApp(app: string): Promise<JsonObject> {
    return this.assertOk(
      await this.request.post('/api/apps/launch', { data: { app } }),
      'POST /api/apps/launch',
    );
  }

  async launchAppRaw(app: string): Promise<APIResponse> {
    return this.request.post('/api/apps/launch', { data: { app } });
  }

  async getIntegrations(): Promise<JsonObject[]> {
    const data = await this.assertOk(
      await this.request.get('/api/integrations'),
      'GET /api/integrations',
    );
    return extractArray<JsonObject>(data, 'integrations', 'items');
  }

  async patchIntegration(type: string, patch: Record<string, unknown>): Promise<JsonObject> {
    return this.assertOk(
      await this.request.patch(`/api/integrations/${type}`, { data: patch }),
      `PATCH /api/integrations/${type}`,
    );
  }
}

export class TrokoPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get islandLocator(): Locator {
    return this.page.locator('#island, [data-testid="island"]').first();
  }

  get panelLocator(): Locator {
    return this.page.locator('#panel, [data-testid="panel"], #island [role="tablist"]').first();
  }

  get statusTextLocator(): Locator {
    return this.page.locator('#status-text, [data-testid="status-text"]').first();
  }

  get liveLocator(): Locator {
    return this.page.locator('#live, [aria-live]').first();
  }

  get avatarRootLocator(): Locator {
    return this.page.locator('[data-mood], [data-testid="troko-avatar"], #island').first();
  }

  get avatarSvgLocator(): Locator {
    return this.page
      .locator('#island [data-testid="troko-avatar"] svg, #island svg[data-mood], #island svg')
      .first();
  }

  get peekCardLocator(): Locator {
    return this.page
      .locator('[data-testid="island-peek-card"], #island [data-peek-card], #island .peek-card')
      .first();
  }

  async goto(options?: { completeOnboarding?: boolean; api?: TrokoApi }): Promise<void> {
    if (options?.completeOnboarding && options.api) {
      await options.api.completeOnboarding();
    }
    await this.page.goto('/');
    await this.islandLocator.waitFor({ state: 'visible', timeout: 10_000 });
  }

  async isIslandOpen(): Promise<boolean> {
    const expanded = await this.islandLocator.getAttribute('aria-expanded');
    if (expanded === 'true') {
      return true;
    }
    const triggerExpanded = await this.islandLocator
      .locator('[aria-expanded="true"]')
      .count();
    if (triggerExpanded > 0) {
      return true;
    }
    const openAttr = await this.islandLocator.getAttribute('data-open');
    if (openAttr === 'true') {
      return true;
    }
    const tabVisible = await this.page
      .getByRole('tab', { name: /Tareas/i })
      .or(this.page.getByRole('button', { name: /^Tareas$/i }))
      .first()
      .isVisible()
      .catch(() => false);
    return tabVisible;
  }

  async openIsland(): Promise<void> {
    if (await this.isIslandOpen()) {
      return;
    }
    const trigger = this.islandLocator
      .locator('[aria-expanded], [data-testid="island-trigger"], button')
      .first();
    if ((await trigger.count()) > 0 && (await trigger.isVisible())) {
      await trigger.click();
    } else {
      await this.islandLocator.click();
    }
    await expect(
      this.page
        .getByRole('tab', { name: /Inicio/i })
        .or(this.page.getByRole('button', { name: /^Inicio$/i }))
        .first(),
    ).toBeVisible();
  }

  async closeIsland(method: 'escape' | 'outside' | 'click' = 'escape'): Promise<void> {
    if (!(await this.isIslandOpen())) {
      return;
    }
    if (method === 'escape') {
      await this.page.keyboard.press('Escape');
    } else if (method === 'outside') {
      const vp = this.page.viewportSize() ?? { width: 1280, height: 800 };
      await this.page.mouse.click(40, Math.max(200, vp.height - 60));
    } else {
      const toggle = this.islandLocator.locator('[aria-expanded="true"]').first();
      if ((await toggle.count()) > 0) {
        await toggle.click();
      } else {
        await this.islandLocator.click();
      }
    }
    await expect
      .poll(async () => this.isIslandOpen(), { timeout: 5_000 })
      .toBe(false);
  }

  async peekIsland(): Promise<void> {
    await this.islandLocator.hover();
  }

  async getIslandStatusText(): Promise<string> {
    if ((await this.statusTextLocator.count()) > 0) {
      return (await this.statusTextLocator.innerText()).trim();
    }
    return (await this.islandLocator.innerText()).trim();
  }

  async getIslandStateAttr(): Promise<string | null> {
    const state = await this.islandLocator.getAttribute('data-state');
    if (state) {
      return state;
    }
    const nested = this.islandLocator.locator('[data-state]').first();
    if ((await nested.count()) > 0) {
      return nested.getAttribute('data-state');
    }
    return null;
  }

  async getIslandMoodAttr(): Promise<string | null> {
    const direct = await this.islandLocator.getAttribute('data-mood');
    if (direct) {
      return direct;
    }
    const nested = this.page.locator('[data-mood]').first();
    if ((await nested.count()) > 0) {
      return nested.getAttribute('data-mood');
    }
    return null;
  }

  async getPeekCard(): Promise<Locator> {
    return this.peekCardLocator;
  }

  tabLocator(tab: TrokoTabLabel): Locator {
    const pattern =
      tab === 'Mi Mac' ? /^(Mi Mac|Mi Equipo)/i : new RegExp(`^${tab}`, 'i');
    return this.page
      .getByRole('tab', { name: pattern })
      .or(this.page.getByRole('button', { name: pattern }))
      .first();
  }

  async openTab(tab: TrokoTabLabel): Promise<void> {
    await this.openIsland();
    const locator = this.tabLocator(tab);
    await locator.click();
  }

  async toggleVoiceOutput(enable?: boolean): Promise<void> {
    await this.openIsland();
    const toggle = this.page
      .getByRole('switch', { name: /Con voz/i })
      .or(this.page.getByRole('checkbox', { name: /Con voz/i }))
      .or(this.page.getByRole('button', { name: /Con voz/i }))
      .first();
    await toggle.waitFor({ state: 'visible' });
    if (typeof enable === 'boolean') {
      const checked =
        (await toggle.getAttribute('aria-checked')) === 'true' ||
        (await toggle.getAttribute('aria-pressed')) === 'true' ||
        (await toggle.isChecked().catch(() => false));
      if (checked !== enable) {
        await toggle.click();
      }
    } else {
      await toggle.click();
    }
  }

  async clickExitTroko(): Promise<void> {
    await this.openIsland();
    const btn = this.page
      .locator('[data-testid="exit-troko-btn"]')
      .or(this.page.getByRole('button', { name: /Salir de Troko/i }))
      .first();
    await btn.click();
  }

  async submitQuickPrompt(text: string): Promise<void> {
    const input = this.page
      .getByPlaceholder(/Escribe o habla con Troko/i)
      .or(this.page.getByRole('textbox', { name: /Escribe o habla con Troko|Mensaje|Comando/i }))
      .first();
    await input.waitFor({ state: 'visible' });
    await input.fill(text);
    const sendBtn = this.page
      .getByRole('button', { name: /Enviar|↑/i })
      .or(this.page.locator('button[type="submit"]'))
      .first();
    if ((await sendBtn.count()) > 0 && (await sendBtn.isEnabled())) {
      await sendBtn.click();
    } else {
      await input.press('Enter');
    }
  }

  async dismissOnboardingWithAhoraNo(): Promise<void> {
    const ahoraNo = this.page.getByRole('button', { name: /Ahora no/i }).first();
    await ahoraNo.waitFor({ state: 'visible' });
    await ahoraNo.click();
  }

  async startOnboardingDownload(): Promise<void> {
    const btn = this.page.getByRole('button', { name: /Descargar/i }).first();
    await btn.waitFor({ state: 'visible' });
    await btn.click();
  }

  async completeOnboardingIfVisible(): Promise<void> {
    await this.page.waitForLoadState('networkidle', { timeout: 1_500 }).catch(() => {});
    const dialog = this.page
      .getByRole('dialog')
      .or(this.page.locator('[data-testid="bienvenida-modal"]'))
      .first();
    const modalBtn = dialog
      .getByRole('button', { name: /Ahora no|Empezar/i })
      .or(this.page.getByRole('button', { name: /Ahora no/i }))
      .first();
    const appeared = await modalBtn
      .waitFor({ state: 'visible', timeout: 600 })
      .then(() => true)
      .catch(() => false);
    if (appeared) {
      await modalBtn.click();
      await expect(dialog).toBeHidden({ timeout: 5_000 }).catch(() => {});
      await expect(modalBtn).toBeHidden({ timeout: 5_000 });
    }
  }
}

interface SseWaiter {
  predicate: (evt: SseEvent) => boolean;
  resolve: (evt: SseEvent) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class SseCollector {
  private readonly baseUrl: string;
  private readonly controller = new AbortController();
  private readonly events: SseEvent[] = [];
  private readonly waiters = new Set<SseWaiter>();
  private started = false;
  private closed = false;
  private streamEnded = false;
  private streamError: Error | null = null;
  private readyPromise: Promise<void> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private rejectAllWaiters(err: Error): void {
    for (const waiter of [...this.waiters]) {
      clearTimeout(waiter.timer);
      this.waiters.delete(waiter);
      waiter.reject(err);
    }
  }

  async start(): Promise<void> {
    if (this.started) {
      return this.readyPromise ?? Promise.resolve();
    }
    this.started = true;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve();
        }
      }, 2000);

      const settleResolve = () => {
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      const settleReject = (err: Error) => {
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          reject(err);
        }
      };

      void (async () => {
        try {
          const response = await fetch(`${this.baseUrl}/api/events`, {
            headers: { Accept: 'text/event-stream' },
            signal: this.controller.signal,
          });
          if (!response.ok) {
            const bodyText = await response.text().catch(() => '');
            throw new Error(
              `SSE connection failed with HTTP ${response.status}: ${bodyText}`,
            );
          }
          settleResolve();
          if (!response.body) {
            this.streamEnded = true;
            this.rejectAllWaiters(new Error('SSE response has no body'));
            return;
          }
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              this.streamEnded = true;
              this.rejectAllWaiters(new Error('SSE stream ended before expected event'));
              break;
            }
            buffer += decoder.decode(value, { stream: true });
            let sepMatch = /\r?\n\r?\n/.exec(buffer);
            while (sepMatch) {
              const block = buffer.slice(0, sepMatch.index);
              buffer = buffer.slice(sepMatch.index + sepMatch[0].length);
              this.parseBlock(block);
              sepMatch = /\r?\n\r?\n/.exec(buffer);
            }
          }
        } catch (err) {
          if ((err as { name?: string })?.name === 'AbortError' || this.closed) {
            settleResolve();
            this.rejectAllWaiters(new Error('SseCollector closed'));
          } else {
            const error = err instanceof Error ? err : new Error(String(err));
            this.streamError = error;
            settleReject(error);
            this.rejectAllWaiters(error);
          }
        }
      })();
    });
    return this.readyPromise;
  }

  private parseBlock(block: string): void {
    const lines = block.split(/\r?\n/);
    let eventName = 'message';
    const dataLines: string[] = [];
    for (const line of lines) {
      if (!line || line.startsWith(':')) {
        continue;
      }
      if (line.startsWith('event:')) {
        eventName = line.slice('event:'.length).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trimStart());
      }
    }
    if (dataLines.length === 0) {
      return;
    }
    const raw = dataLines.join('\n');
    let parsed: Record<string, unknown> | unknown = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Keep raw string
    }
    const obj =
      parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    const type = typeof obj.type === 'string' ? obj.type : eventName;
    const payload = 'payload' in obj ? obj.payload : parsed;
    const ts = typeof obj.ts === 'string' ? obj.ts : new Date().toISOString();
    const evt: SseEvent = { event: eventName, type, payload, ts, raw };
    this.events.push(evt);
    for (const waiter of [...this.waiters]) {
      if (waiter.predicate(evt)) {
        clearTimeout(waiter.timer);
        this.waiters.delete(waiter);
        waiter.resolve(evt);
      }
    }
  }

  getEvents(): SseEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events.length = 0;
  }

  async waitForEvent(
    typeOrPredicate: string | ((evt: SseEvent) => boolean),
    timeoutMs = 8_000,
  ): Promise<SseEvent> {
    const predicate =
      typeof typeOrPredicate === 'string'
        ? (evt: SseEvent) => evt.type === typeOrPredicate || evt.event === typeOrPredicate
        : typeOrPredicate;

    const existing = this.events.find(predicate);
    if (existing) {
      return existing;
    }
    if (this.closed) {
      throw new Error('SseCollector is closed');
    }
    if (this.streamError) {
      throw this.streamError;
    }
    if (this.streamEnded) {
      throw new Error('SSE stream ended before expected event');
    }

    return new Promise<SseEvent>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(
          new Error(
            `Timed out after ${timeoutMs}ms waiting for SSE event. Received types: [${this.events
              .map((e) => e.type)
              .join(', ')}]`,
          ),
        );
      }, timeoutMs);

      const waiter: SseWaiter = {
        predicate,
        resolve,
        reject,
        timer,
      };
      this.waiters.add(waiter);
    });
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.controller.abort();
    this.rejectAllWaiters(new Error('SseCollector closed'));
  }
}

export async function openSseStream(baseUrl: string): Promise<SseCollector> {
  const collector = new SseCollector(baseUrl);
  await collector.start();
  return collector;
}

export class DesktopSandbox {
  private dir: string | null;

  constructor(initialDir?: string) {
    this.dir = initialDir || process.env.TROKO_E2E_DESKTOP_DIR || null;
  }

  private assertSafePath(targetDir: string): string {
    const resolved = path.resolve(targetDir);
    const homeDir = path.resolve(os.homedir());
    const realDesktop = path.join(homeDir, 'Desktop');
    if (
      resolved === homeDir ||
      resolved === realDesktop ||
      resolved.startsWith(realDesktop + path.sep)
    ) {
      throw new Error(`Refusing unsafe DesktopSandbox path: ${resolved}`);
    }
    const tmpRoot = path.resolve(os.tmpdir());
    const inTmp = resolved.startsWith(tmpRoot + path.sep);
    const repoE2eSandbox = path.join(TROKO_REPO_ROOT, '.e2e-sandbox');
    const repoDataSandbox = path.join(TROKO_REPO_ROOT, 'data', 'desktop-sandbox');
    const inRepoSandbox =
      resolved === repoE2eSandbox ||
      resolved.startsWith(repoE2eSandbox + path.sep) ||
      resolved === repoDataSandbox ||
      resolved.startsWith(repoDataSandbox + path.sep);
    const inHome = resolved.startsWith(homeDir + path.sep);

    if (inHome && !inTmp && !inRepoSandbox) {
      throw new Error(
        `Refusing DesktopSandbox path inside os.homedir(): ${resolved}`,
      );
    }
    if (!inTmp && !inRepoSandbox) {
      throw new Error(
        `DesktopSandbox path must be inside os.tmpdir() or repo sandbox: ${resolved}`,
      );
    }
    return resolved;
  }

  private resolveTarget(relativePath: string): string {
    const root = this.getDir();
    if (path.isAbsolute(relativePath)) {
      throw new Error(`Path escapes DesktopSandbox: ${relativePath}`);
    }
    const target = path.resolve(root, relativePath);
    if (!target.startsWith(root + path.sep)) {
      throw new Error(`Path escapes DesktopSandbox: ${relativePath}`);
    }
    return target;
  }

  setDir(dir: string): void {
    this.dir = this.assertSafePath(dir);
  }

  getDir(): string {
    if (!this.dir) {
      this.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'troko-desktop-sandbox-'));
    }
    const safe = this.assertSafePath(this.dir);
    fs.mkdirSync(safe, { recursive: true });
    return safe;
  }

  async resolveFromApi(api: TrokoApi): Promise<string> {
    if (this.dir) {
      return this.getDir();
    }
    const scan = await api.scanDesktop();
    const candidates = [scan.targetDir, scan.desktopDir, scan.dir];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        this.setDir(candidate);
        return this.getDir();
      }
    }
    return this.getDir();
  }

  writeFile(relativePath: string, content: string | Buffer = 'troko-sample'): string {
    const target = this.resolveTarget(relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    return target;
  }

  writeSampleSet(): Record<string, string> {
    const samples: Record<string, string> = {
      'Captura de pantalla 2026-11-17.png': 'png-screenshot-bytes',
      'foto.jpg': 'jpeg-photo-bytes',
      'contrato.pdf': 'pdf-contract-bytes',
      'presupuesto.xlsx': 'xlsx-sheet-bytes',
      'nota-voz.mp3': 'mp3-audio-bytes',
      'clip.mp4': 'mp4-video-bytes',
      'archivo.zip': 'zip-archive-bytes',
      'readme.xyz': 'misc-other-bytes',
    };
    for (const [name, content] of Object.entries(samples)) {
      this.writeFile(name, content);
    }
    return samples;
  }

  exists(relativePath: string): boolean {
    const target = this.resolveTarget(relativePath);
    return fs.existsSync(target);
  }

  readFile(relativePath: string): string {
    const target = this.resolveTarget(relativePath);
    return fs.readFileSync(target, 'utf8');
  }

  listRootFiles(): string[] {
    const root = this.getDir();
    if (!fs.existsSync(root)) {
      return [];
    }
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => d.name)
      .sort();
  }

  listRecursive(): string[] {
    const root = this.getDir();
    const results: string[] = [];
    const walk = (current: string, prefix = '') => {
      if (!fs.existsSync(current)) {
        return;
      }
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const rel = prefix ? path.posix.join(prefix, entry.name) : entry.name;
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          walk(full, rel);
        } else {
          results.push(rel);
        }
      }
    };
    walk(root);
    return results.sort();
  }

  clean(): void {
    if (!this.dir) {
      return;
    }
    const safe = this.assertSafePath(this.dir);
    if (!fs.existsSync(safe)) {
      return;
    }
    for (const entry of fs.readdirSync(safe)) {
      fs.rmSync(path.join(safe, entry), { recursive: true, force: true });
    }
  }
}

export async function resetTrokoState(
  api: TrokoApi,
  desktopSandbox?: DesktopSandbox,
): Promise<void> {
  await api.wipeMemory();
  if (desktopSandbox) {
    desktopSandbox.clean();
  }
}

export async function installBrowserSseTap(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const win = window as unknown as {
      __trokoSseEvents?: Array<{ type: string; data: unknown }>;
    };
    win.__trokoSseEvents = [];
    const OrigEventSource = window.EventSource;
    if (!OrigEventSource) {
      return;
    }
    class TappedEventSource extends OrigEventSource {
      constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
        super(url, eventSourceInitDict);
        this.addEventListener('message', (ev: MessageEvent) => {
          try {
            const parsed = JSON.parse(String(ev.data)) as { type?: string };
            win.__trokoSseEvents?.push({
              type: parsed.type || 'message',
              data: parsed,
            });
          } catch {
            win.__trokoSseEvents?.push({ type: 'message', data: ev.data });
          }
        });
      }
    }
    window.EventSource = TappedEventSource as unknown as typeof EventSource;
  });
}

export async function installSpeechRecognitionShim(
  page: Page,
  options: { denyMic?: boolean } = {},
): Promise<void> {
  await page.addInitScript(({ denyMic }) => {
    const win = window as unknown as {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
      __trokoSpeechInstances?: Array<Record<string, unknown>>;
      __trokoEmitSpeech?: (transcript: string, isFinal?: boolean) => void;
    };

    win.__trokoSpeechInstances = [];

    class MockSpeechRecognition {
      lang = 'es-ES';
      continuous = false;
      interimResults = true;
      maxAlternatives = 1;
      onstart: ((ev: Event) => void) | null = null;
      onend: ((ev: Event) => void) | null = null;
      onerror: ((ev: { error: string; message?: string }) => void) | null = null;
      onresult: ((ev: unknown) => void) | null = null;
      private started = false;

      constructor() {
        win.__trokoSpeechInstances?.push(this as unknown as Record<string, unknown>);
      }

      start(): void {
        if (denyMic) {
          this.started = false;
          queueMicrotask(() => {
            this.onerror?.({ error: 'not-allowed', message: 'Microphone denied' });
            this.onend?.(new Event('end'));
          });
          return;
        }
        this.started = true;
        queueMicrotask(() => {
          this.onstart?.(new Event('start'));
        });
      }

      stop(): void {
        this.started = false;
        queueMicrotask(() => {
          this.onend?.(new Event('end'));
        });
      }

      abort(): void {
        this.started = false;
        queueMicrotask(() => {
          this.onend?.(new Event('end'));
        });
      }

      emitTranscript(transcript: string, isFinal = true): void {
        const resultItem = {
          0: { transcript, confidence: 0.98 },
          length: 1,
          isFinal,
        };
        const event = {
          resultIndex: 0,
          results: {
            0: resultItem,
            length: 1,
          },
        };
        this.onresult?.(event);
        if (isFinal && !this.continuous) {
          this.started = false;
          this.onend?.(new Event('end'));
        }
      }
    }

    win.SpeechRecognition = MockSpeechRecognition;
    win.webkitSpeechRecognition = MockSpeechRecognition;

    win.__trokoEmitSpeech = (transcript: string, isFinal = true) => {
      const instances = win.__trokoSpeechInstances ?? [];
      let target = instances[instances.length - 1] as
        | { emitTranscript?: (t: string, f: boolean) => void }
        | undefined;
      if (!target) {
        const inst = new MockSpeechRecognition();
        inst.start();
        target = inst;
      }
      target.emitTranscript?.(transcript, isFinal);
    };

    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = async () => {
        if (denyMic) {
          throw new DOMException('Permission denied', 'NotAllowedError');
        }
        return new MediaStream();
      };
    }
  }, options);
}

export async function emitSimulatedSpeech(
  page: Page,
  transcript: string,
  isFinal = true,
): Promise<void> {
  await page.evaluate(
    ({ text, final }) => {
      const win = window as unknown as {
        __trokoEmitSpeech?: (t: string, f?: boolean) => void;
      };
      win.__trokoEmitSpeech?.(text, final);
    },
    { text: transcript, final: isFinal },
  );
}

export async function installSpeechSynthesisSpy(
  page: Page,
  options: { utteranceDurationMs?: number } = {},
): Promise<void> {
  await page.addInitScript(({ utteranceDurationMs }) => {
    const win = window as unknown as {
      __ttsUtterances?: Array<{ text: string; lang: string; rate: number }>;
      __ttsCancelCount?: number;
      __ttsSpeaking?: boolean;
      SpeechSynthesisUtterance?: unknown;
    };

    win.__ttsUtterances = [];
    win.__ttsCancelCount = 0;
    win.__ttsSpeaking = false;

    class MockUtterance {
      text: string;
      lang = 'es-ES';
      rate = 1;
      pitch = 1;
      volume = 1;
      onstart: ((ev: Event) => void) | null = null;
      onend: ((ev: Event) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;

      constructor(text = '') {
        this.text = text;
      }
    }

    let activeTimer: ReturnType<typeof setTimeout> | null = null;
    let activeUtterance: MockUtterance | null = null;

    const mockSynth = {
      speaking: false,
      pending: false,
      paused: false,
      getVoices: () => [
        {
          name: 'Monica (es-ES)',
          lang: 'es-ES',
          default: true,
          localService: true,
          voiceURI: 'Monica',
        },
      ],
      speak(utterance: MockUtterance) {
        win.__ttsUtterances?.push({
          text: utterance.text,
          lang: utterance.lang || 'es-ES',
          rate: utterance.rate ?? 1,
        });
        activeUtterance = utterance;
        mockSynth.speaking = true;
        win.__ttsSpeaking = true;
        queueMicrotask(() => {
          utterance.onstart?.(new Event('start'));
        });
        if (activeTimer) {
          clearTimeout(activeTimer);
        }
        activeTimer = setTimeout(() => {
          mockSynth.speaking = false;
          win.__ttsSpeaking = false;
          const finished = activeUtterance;
          activeUtterance = null;
          finished?.onend?.(new Event('end'));
        }, utteranceDurationMs ?? 250);
      },
      cancel() {
        win.__ttsCancelCount = (win.__ttsCancelCount ?? 0) + 1;
        if (activeTimer) {
          clearTimeout(activeTimer);
          activeTimer = null;
        }
        mockSynth.speaking = false;
        win.__ttsSpeaking = false;
        const cancelled = activeUtterance;
        activeUtterance = null;
        cancelled?.onend?.(new Event('end'));
      },
      pause() {
        mockSynth.paused = true;
      },
      resume() {
        mockSynth.paused = false;
      },
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => true,
    };

    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      writable: true,
      value: MockUtterance,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      get: () => mockSynth,
    });
  }, options);
}

export async function startMockOpenAiServer(
  replyText: string,
): Promise<{ url: string; close: () => Promise<void>; requests: Array<{ body: string }> }> {
  const requests: Array<{ body: string }> = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      requests.push({ body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'chatcmpl-mock-1',
          object: 'chat.completion',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: replyText,
              },
              finish_reason: 'stop',
            },
          ],
        }),
      );
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export interface TrokoFixtures {
  api: TrokoApi;
  troko: TrokoPage;
  sse: SseCollector;
  desktopSandbox: DesktopSandbox;
}

export const test = base.extend<TrokoFixtures>({
  api: async ({ request }, use) => {
    await use(new TrokoApi(request));
  },
  troko: async ({ page }, use) => {
    await use(new TrokoPage(page));
  },
  sse: async ({ baseURL }, use) => {
    const resolvedBase =
      baseURL ||
      process.env.BASE_URL ||
      process.env.TROKO_BASE_URL ||
      `http://127.0.0.1:${process.env.TROKO_E2E_PORT || 4173}`;
    const collector = new SseCollector(resolvedBase);
    await use(collector);
    collector.close();
  },
  desktopSandbox: async ({}, use) => {
    const sandbox = new DesktopSandbox();
    await use(sandbox);
    sandbox.clean();
  },
});
