import {
  COMPANION_IDS,
  NUKO_ACCESSORY_IDS,
  type CompanionId,
  type NukoAccessoryId,
} from '../../../shared/types.ts';
import { HttpError, sendJson } from '../app.ts';
import type { Router, ServerContext } from '../app.ts';

export function registerStudyGuardianRoutes(router: Router, ctx: ServerContext): void {
  // === Progression / XP, Dual Companions (Nuko & Luma) & Accessories ===
  router.get('/api/progression', (_req, res) => {
    sendJson(res, 200, {
      ok: true,
      activeCompanion: ctx.progressionService.getActiveCompanion(),
      progression: ctx.progressionService.getState(),
      companions: ctx.progressionService.getAllCompanions(),
      catalog: ctx.progressionService.getCatalog(),
    });
  });

  router.post('/api/progression/companion', async (req, res) => {
    const body = await req.readJson<{ companion?: string }>();
    const companion = String(body?.companion ?? '').trim().toLowerCase() as CompanionId;
    if (!COMPANION_IDS.includes(companion)) {
      throw new HttpError(400, 'Compañero inválido: elegí nuko o luma.');
    }
    ctx.progressionService.setActiveCompanion(companion);
    sendJson(res, 200, {
      ok: true,
      activeCompanion: ctx.progressionService.getActiveCompanion(),
      progression: ctx.progressionService.getState(),
      companions: ctx.progressionService.getAllCompanions(),
      catalog: ctx.progressionService.getCatalog(),
    });
  });

  router.post('/api/progression/equip', async (req, res) => {
    const body = await req.readJson<{ accessory?: string }>();
    const accessory = String(body?.accessory ?? '') as NukoAccessoryId;
    if (!NUKO_ACCESSORY_IDS.includes(accessory)) {
      throw new HttpError(400, 'Accesorio inválido');
    }
    const progression = ctx.progressionService.equipAccessory(accessory);
    sendJson(res, 200, {
      ok: true,
      activeCompanion: ctx.progressionService.getActiveCompanion(),
      progression,
      companions: ctx.progressionService.getAllCompanions(),
      catalog: ctx.progressionService.getCatalog(),
    });
  });

  // === Focus Guardian (Anti-Distraction) ===
  router.get('/api/guardian', (_req, res) => {
    sendJson(res, 200, {
      ok: true,
      config: ctx.guardianService.getConfig(),
      runtime: ctx.guardianService.getRuntime(),
    });
  });

  router.patch('/api/guardian', async (req, res) => {
    const body = await req.readJson<Record<string, unknown>>();
    const config = ctx.guardianService.patchConfig(body);
    sendJson(res, 200, {
      ok: true,
      config,
      runtime: ctx.guardianService.getRuntime(),
    });
  });

  router.post('/api/guardian/check', async (req, res) => {
    const body = await req.readJson<{
      windowTitle?: string;
      elapsedHiddenSec?: number;
    }>();
    const focus = ctx.productivityService.getFocusState();
    const isFocusActive = focus.status === 'active' && focus.phase === 'focus';
    const result = ctx.guardianService.evaluateWindow({
      windowTitle: typeof body?.windowTitle === 'string' ? body.windowTitle : '',
      isFocusActive,
      focusLabel: focus.label ?? null,
      elapsedHiddenSec: body?.elapsedHiddenSec,
    });
    sendJson(res, 200, { ok: true, ...result });
  });

  router.post('/api/guardian/test-alert', async (req, res) => {
    const body = await req.readJson<{ sampleTitle?: string }>();
    const focus = ctx.productivityService.getFocusState();
    const resAlert = ctx.guardianService.triggerTestAlert(
      body?.sampleTitle?.trim() || 'YouTube - Videos recomendados',
      focus.label || 'Estudio'
    );
    sendJson(res, 200, { ok: true, ...resAlert });
  });

  // === Study PDF & Lossless Block Decoder ===
  router.get('/api/study/docs', (_req, res) => {
    sendJson(res, 200, {
      ok: true,
      docs: ctx.studyService.listDocuments(),
      decodeStatus: ctx.studyService.getDecodeStatus(),
    });
  });

  router.get('/api/study/status', (_req, res) => {
    sendJson(res, 200, {
      ok: true,
      decodeStatus: ctx.studyService.getDecodeStatus(),
    });
  });

  router.post('/api/study/decode', async (req, res) => {
    // Allow up to 20MB JSON payload for base64 PDFs
    const body = await req.readJson<{
      title?: string;
      fileName?: string;
      pdfBase64?: string;
      text?: string;
    }>(20 * 1024 * 1024);

    const doc = await ctx.studyService.decodeDocument(body ?? {});
    sendJson(res, 201, {
      ok: true,
      doc,
      decodeStatus: ctx.studyService.getDecodeStatus(),
    });
  });

  router.delete('/api/study/docs/:id', (req, res) => {
    ctx.studyService.deleteDocument(req.params['id'] ?? '');
    sendJson(res, 200, { ok: true });
  });

  router.post('/api/study/docs/:id/blocks/:blockId/master', async (req, res) => {
    const body = await req.readJson<{ mastered?: boolean }>();
    const result = ctx.studyService.masterBlock(
      req.params['id'] ?? '',
      req.params['blockId'] ?? '',
      body?.mastered ?? true
    );
    sendJson(res, 200, {
      ok: true,
      ...result,
      progression: ctx.progressionService.getState(),
    });
  });

  router.post('/api/study/docs/:id/blocks/:blockId/quiz', async (req, res) => {
    const body = await req.readJson<{ questionId?: string; selectedIndex?: number }>();
    if (!body?.questionId || typeof body.selectedIndex !== 'number') {
      throw new HttpError(400, 'questionId y selectedIndex son obligatorios');
    }
    const result = ctx.studyService.answerQuiz(
      req.params['id'] ?? '',
      req.params['blockId'] ?? '',
      body.questionId,
      body.selectedIndex
    );
    sendJson(res, 200, {
      ok: true,
      ...result,
      progression: ctx.progressionService.getState(),
    });
  });

  router.post('/api/study/docs/:id/blocks/:blockId/feynman', async (req, res) => {
    const body = await req.readJson<{ explanation?: string }>();
    const result = await ctx.studyService.evaluateFeynman(
      req.params['id'] ?? '',
      req.params['blockId'] ?? '',
      String(body?.explanation ?? '')
    );
    sendJson(res, 200, {
      ok: true,
      ...result,
      progression: ctx.progressionService.getState(),
    });
  });

  // === Spaced Repetition Reviews ===
  router.get('/api/study/due-reviews', (req, res) => {
    const refIso = req.query.get('at') ?? undefined;
    const dueReviews = ctx.studyService.listDueReviews(refIso);
    sendJson(res, 200, {
      ok: true,
      dueReviews,
      count: dueReviews.length,
    });
  });

  router.post('/api/study/docs/:id/blocks/:blockId/review', async (req, res) => {
    const body = await req.readJson<{ quality?: string }>();
    const quality = body?.quality;
    if (quality !== 'again' && quality !== 'good' && quality !== 'easy') {
      throw new HttpError(400, 'quality debe ser again, good o easy');
    }
    const result = ctx.studyService.recordReview(
      req.params['id'] ?? '',
      req.params['blockId'] ?? '',
      quality
    );
    sendJson(res, 200, {
      ok: true,
      ...result,
      dueReviews: ctx.studyService.listDueReviews(),
      progression: ctx.progressionService.getState(),
    });
  });

  // === Focus Virtual Assistant (Presets, Intention, Parking Lot, Shield, Insights) ===
  router.get('/api/focus/assistant', (_req, res) => {
    sendJson(res, 200, {
      ok: true,
      ...ctx.focusAssistantService.getSnapshot(),
    });
  });

  router.get('/api/focus/insights', (_req, res) => {
    sendJson(res, 200, {
      ok: true,
      insights: ctx.focusAssistantService.getInsights(),
    });
  });

  router.post('/api/focus/intention', async (req, res) => {
    const body = await req.readJson<{
      label?: string;
      taskId?: string | null;
      studyDocId?: string | null;
      studyBlockId?: string | null;
    }>();
    const intention = ctx.focusAssistantService.setIntention({
      label: String(body?.label ?? ''),
      taskId: body?.taskId ?? null,
      studyDocId: body?.studyDocId ?? null,
      studyBlockId: body?.studyBlockId ?? null,
    });
    sendJson(res, 200, {
      ok: true,
      intention,
      assistant: ctx.focusAssistantService.getSnapshot(),
    });
  });

  router.post('/api/focus/presets/:id/start', async (req, res) => {
    const presetId = req.params['id'] ?? '';
    if (
      presetId !== 'estudio_profundo' &&
      presetId !== 'trabajo_codigo' &&
      presetId !== 'sprint_rapido'
    ) {
      throw new HttpError(404, 'Perfil de enfoque no encontrado');
    }
    const body = await req.readJson<{
      label?: string;
      taskId?: string | null;
      studyDocId?: string | null;
      studyBlockId?: string | null;
    }>();
    const result = ctx.focusAssistantService.startWithPreset(presetId, {
      label: body?.label,
      taskId: body?.taskId ?? null,
      studyDocId: body?.studyDocId ?? null,
      studyBlockId: body?.studyBlockId ?? null,
    });
    sendJson(res, 200, {
      ok: true,
      preset: result.preset,
      intention: result.intention,
      assistant: result.snapshot,
      focus: ctx.productivityService.getFocusState(),
    });
  });

  router.patch('/api/focus/shield', async (req, res) => {
    const body = await req.readJson<{ enabled?: boolean }>();
    if (typeof body?.enabled !== 'boolean') {
      throw new HttpError(400, 'enabled debe ser booleano');
    }
    const shieldEnabled = ctx.focusAssistantService.setShieldEnabled(body.enabled);
    sendJson(res, 200, {
      ok: true,
      shieldEnabled,
      assistant: ctx.focusAssistantService.getSnapshot(),
    });
  });

  router.post('/api/focus/shield/flush', (_req, res) => {
    const flushed = ctx.focusAssistantService.flushShieldedQueue(true);
    sendJson(res, 200, {
      ok: true,
      flushed,
      assistant: ctx.focusAssistantService.getSnapshot(),
    });
  });

  router.post('/api/focus/parking-lot', async (req, res) => {
    const body = await req.readJson<{ text?: string }>();
    const item = ctx.focusAssistantService.addParkingItem(String(body?.text ?? ''));
    sendJson(res, 201, {
      ok: true,
      item,
      parkingLot: ctx.focusAssistantService.listParkingLot(),
    });
  });

  router.post('/api/focus/parking-lot/:id/promote', (req, res) => {
    const result = ctx.focusAssistantService.promoteParkingItemToTask(
      req.params['id'] ?? ''
    );
    sendJson(res, 200, {
      ok: true,
      ...result,
      parkingLot: ctx.focusAssistantService.listParkingLot(),
    });
  });

  router.delete('/api/focus/parking-lot/:id', (req, res) => {
    ctx.focusAssistantService.deleteParkingItem(req.params['id'] ?? '');
    sendJson(res, 200, {
      ok: true,
      parkingLot: ctx.focusAssistantService.listParkingLot(),
    });
  });
}
