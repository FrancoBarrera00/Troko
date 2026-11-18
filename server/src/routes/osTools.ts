import {
  validateEmailDraftInput,
  validateEmailDraftPatchInput,
  validateIntegrationPatchInput,
} from '../../../shared/validators.ts';
import { HttpError, sendJson } from '../app.ts';
import type { Router, ServerContext } from '../app.ts';

export function registerOsToolsRoutes(router: Router, ctx: ServerContext): void {
  // Desktop Organizer (/api/desktop/*, /api/desktop/tidy/*, /api/os/desktop/*)
  for (const prefix of ['/api/desktop', '/api/os/desktop']) {
    router.get(`${prefix}/scan`, (_req, res) => {
      sendJson(res, 200, ctx.organizerService.scanDesktop());
    });

    for (const previewPath of [`${prefix}/preview`, `${prefix}/tidy/preview`]) {
      router.post(previewPath, (_req, res) => {
        sendJson(res, 200, ctx.organizerService.previewTidy());
      });
    }

    for (const applyPath of [`${prefix}/apply`, `${prefix}/tidy/apply`]) {
      router.post(applyPath, (_req, res) => {
        sendJson(res, 200, ctx.organizerService.applyTidy());
      });
    }

    for (const undoPath of [`${prefix}/undo`, `${prefix}/tidy/undo`]) {
      router.post(undoPath, async (req, res) => {
        const body = await req.readJson<Record<string, unknown>>();
        const batchId =
          typeof body?.['batchId'] === 'string' && body['batchId'].trim()
            ? body['batchId'].trim()
            : undefined;
        sendJson(res, 200, ctx.organizerService.undoTidy(batchId));
      });
    }

    for (const seedPath of [`${prefix}/seed`, `${prefix}/seed-sample`]) {
      router.post(seedPath, (_req, res) => {
        sendJson(res, 200, ctx.organizerService.seedSampleFiles());
      });
    }
  }

  // Email Inbox & Drafts (/api/mail/* and /api/os/mail/*)
  for (const prefix of ['/api/mail', '/api/os/mail']) {
    router.get(`${prefix}/inbox`, (_req, res) => {
      sendJson(res, 200, ctx.mailerService.getInbox());
    });

    router.post(`${prefix}/draft`, async (req, res) => {
      const body = await req.readJson();
      const validated = validateEmailDraftInput(body);
      if (!validated.ok) {
        throw new HttpError(400, validated.error);
      }
      const draft = ctx.mailerService.createDraft(validated.value);
      sendJson(res, 201, { ok: true, draft, ...draft });
    });

    router.patch(`${prefix}/drafts/:id`, async (req, res) => {
      const id = req.params['id'] ?? '';
      const body = await req.readJson();
      const validated = validateEmailDraftPatchInput(body);
      if (!validated.ok) {
        throw new HttpError(400, validated.error);
      }
      const draft = ctx.mailerService.updateDraft(id, validated.value);
      sendJson(res, 200, { ok: true, draft, ...draft });
    });

    router.post(`${prefix}/drafts/:id/send`, (req, res) => {
      const id = req.params['id'] ?? '';
      const draft = ctx.mailerService.sendDraft(id);
      sendJson(res, 200, { ok: true, draft, ...draft });
    });

    router.post(`${prefix}/drafts/:id/discard`, (req, res) => {
      const id = req.params['id'] ?? '';
      const draft = ctx.mailerService.discardDraft(id);
      sendJson(res, 200, { ok: true, draft, ...draft });
    });
  }

  // App Launcher (/api/apps/* and /api/os/apps/*)
  for (const prefix of ['/api/apps', '/api/os/apps']) {
    router.get(prefix, (_req, res) => {
      sendJson(res, 200, ctx.appLauncherService.listApps());
    });

    router.post(`${prefix}/launch`, async (req, res) => {
      const body = await req.readJson();
      const result = ctx.appLauncherService.launchApp(body);
      sendJson(res, 200, result);
    });
  }

  // Integrations
  router.get('/api/integrations', (_req, res) => {
    const integrations = ctx.appLauncherService.listIntegrations();
    sendJson(res, 200, { ok: true, integrations });
  });

  router.patch('/api/integrations/:type', async (req, res) => {
    const type = req.params['type'] ?? '';
    const body = await req.readJson();
    const validated = validateIntegrationPatchInput(body);
    if (!validated.ok) {
      throw new HttpError(400, validated.error);
    }
    const integration = ctx.appLauncherService.patchIntegration(type, validated.value);
    sendJson(res, 200, { ok: true, integration, ...integration });
  });
}
