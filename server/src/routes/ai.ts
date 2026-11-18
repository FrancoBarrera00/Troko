import { validateChatCommandInput } from '../../../shared/validators.ts';
import { HttpError, sendJson } from '../app.ts';
import type { Router, ServerContext } from '../app.ts';

export function registerAiRoutes(router: Router, ctx: ServerContext): void {
  // Chat history (both /api/chat and /api/chat/messages)
  for (const path of ['/api/chat', '/api/chat/messages']) {
    router.get(path, (_req, res) => {
      const messages = ctx.nluService.listMessages();
      sendJson(res, 200, { ok: true, messages });
    });
  }

  // Chat command / send (both /api/chat/command and /api/chat/send)
  for (const path of ['/api/chat/command', '/api/chat/send']) {
    router.post(path, async (req, res) => {
      const body = await req.readJson();
      const validated = validateChatCommandInput(body);
      if (!validated.ok) {
        throw new HttpError(400, validated.error);
      }
      const result = await ctx.nluService.processUserMessage(
        validated.value.text,
        validated.value.inputMode,
        validated.value.conversationId
      );
      sendJson(res, 200, result);
    });
  }

  // Clear chat
  router.delete('/api/chat', (_req, res) => {
    ctx.nluService.clearMessages();
    sendJson(res, 200, { ok: true });
  });

  router.post('/api/chat/clear', (_req, res) => {
    ctx.nluService.clearMessages();
    sendJson(res, 200, { ok: true });
  });

  // Onboarding & Local Model Download
  router.get('/api/onboarding', (_req, res) => {
    sendJson(res, 200, ctx.nluService.getOnboardingState());
  });

  router.post('/api/onboarding/download/start', (_req, res) => {
    sendJson(res, 200, ctx.nluService.startModelDownload());
  });

  router.post('/api/onboarding/download/pause', (_req, res) => {
    sendJson(res, 200, ctx.nluService.pauseModelDownload());
  });

  router.post('/api/onboarding/download/resume', (_req, res) => {
    sendJson(res, 200, ctx.nluService.resumeModelDownload());
  });

  router.post('/api/onboarding/complete', async (req, res) => {
    const body = await req.readJson<Record<string, unknown>>();
    const skipped = Boolean(body?.['skipped']);
    sendJson(res, 200, ctx.nluService.completeOnboarding(skipped));
  });

  // Privacy: Memory Export & Wipe
  router.get('/api/memory/export', (_req, res) => {
    sendJson(res, 200, ctx.settingsService.exportMemory());
  });

  router.post('/api/memory/export', (_req, res) => {
    sendJson(res, 200, ctx.settingsService.exportMemory());
  });

  router.post('/api/memory/wipe', (_req, res) => {
    ctx.settingsService.wipeMemory();
    ctx.settingsService.patchSettings({ voiceEnabled: false });
    ctx.nluService.resetState();
    ctx.appLauncherService.resetState();
    ctx.eventBus.setIslandState({
      state: 'idle',
      mood: 'contento',
      statusText: 'Reposo',
      peekCard: null,
    });
    sendJson(res, 200, { ok: true });
  });

  // App Wake & Clean Exit
  router.post('/api/app/wake', (_req, res) => {
    const result = ctx.productivityService.wakeCatchUp();
    sendJson(res, 200, {
      ok: true,
      missedReminders: result.missedReminders,
      island: ctx.eventBus.getIslandState(),
    });
  });

  router.post('/api/app/exit', (_req, res) => {
    const island = ctx.eventBus.setIslandState({
      state: 'sleep',
      mood: 'bostezo',
      statusText: 'Dormido',
      peekCard: null,
    });
    sendJson(res, 200, { ok: true, exited: true, island });
  });
}
