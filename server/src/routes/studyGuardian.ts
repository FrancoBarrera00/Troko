import { TROKO_ACCESSORY_IDS, type TrokoAccessoryId } from '../../../shared/types.ts';
import { HttpError, sendJson } from '../app.ts';
import type { Router, ServerContext } from '../app.ts';

export function registerStudyGuardianRoutes(router: Router, ctx: ServerContext): void {
  // === Progression / XP & Accessories ===
  router.get('/api/progression', (_req, res) => {
    sendJson(res, 200, {
      ok: true,
      progression: ctx.progressionService.getState(),
      catalog: ctx.progressionService.getCatalog(),
    });
  });

  router.post('/api/progression/equip', async (req, res) => {
    const body = await req.readJson<{ accessory?: string }>();
    const accessory = String(body?.accessory ?? '') as TrokoAccessoryId;
    if (!TROKO_ACCESSORY_IDS.includes(accessory)) {
      throw new HttpError(400, 'Accesorio inválido');
    }
    const progression = ctx.progressionService.equipAccessory(accessory);
    sendJson(res, 200, { ok: true, progression });
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
}
