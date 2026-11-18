import {
  validateEmailDraftInput,
  validateEmailDraftPatchInput,
  validateIntegrationPatchInput,
} from '../../../shared/validators.ts';
import { HttpError, sendJson } from '../app.ts';
import type { Router, ServerContext } from '../app.ts';
import {
  verifyImapSmtpConnection,
  type ImapSmtpConfig,
} from '../services/mailTransport.ts';

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

    router.post(`${prefix}/sync`, async (_req, res) => {
      const inbox = await ctx.mailerService.syncInbox();
      sendJson(res, 200, inbox);
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

    router.post(`${prefix}/drafts/:id/send`, async (req, res) => {
      const id = req.params['id'] ?? '';
      const mode = ctx.mailerService.isRealMailEnabled() ? 'smtp' : 'sandbox';
      const draft = await ctx.mailerService.sendDraft(id);
      sendJson(res, 200, { ok: true, draft, mode, ...draft });
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

  router.post('/api/integrations/:type/test', async (req, res) => {
    const type = req.params['type'] ?? '';
    const existing = ctx.appLauncherService
      .listIntegrations()
      .find((item) => item.type === type || item.id === type);
    if (!existing) {
      throw new HttpError(404, `Integración "${type}" no encontrada`);
    }

    const body = await req.readJson<Record<string, unknown>>();
    const bodyConfig =
      body && typeof body['config'] === 'object' && body['config'] !== null && !Array.isArray(body['config'])
        ? (body['config'] as Record<string, unknown>)
        : body && typeof body === 'object' && !Array.isArray(body)
        ? body
        : {};
    const merged: Record<string, unknown> = {
      ...existing.config,
      ...bodyConfig,
    };

    if (existing.type === 'imap_smtp') {
      const str = (k: string): string =>
        typeof merged[k] === 'string' ? (merged[k] as string).trim() : '';
      const num = (k: string, fb: number): number => {
        const n = Number(merged[k]);
        return Number.isFinite(n) && n > 0 ? n : fb;
      };
      const boolOpt = (k: string): boolean | undefined =>
        typeof merged[k] === 'boolean' ? (merged[k] as boolean) : undefined;

      const host = str('host');
      const config: ImapSmtpConfig = {
        host: host || undefined,
        imapHost: str('imapHost') || host,
        imapPort: num('imapPort', 993),
        smtpHost: str('smtpHost') || host,
        smtpPort: num('smtpPort', 465),
        user: str('user'),
        pass: str('pass'),
        imapTls: boolOpt('imapTls'),
        smtpTls: boolOpt('smtpTls'),
        rejectUnauthorized: boolOpt('rejectUnauthorized'),
      };
      const result = await verifyImapSmtpConnection(config);
      sendJson(res, 200, result);
      return;
    }

    if (existing.type === 'weather') {
      const city = typeof merged['city'] === 'string' ? merged['city'].trim() : '';
      if (!city) {
        sendJson(res, 200, {
          ok: false,
          details: 'Falta configurar la ciudad para Clima.',
        });
        return;
      }
      const units = merged['units'] === 'imperial' ? 'imperial' : 'metric';
      const weatherRes = await ctx.bridgeService.getWeather(city, units);
      sendJson(res, 200, {
        ...weatherRes,
        details: weatherRes.ok
          ? weatherRes.summary
          : weatherRes.error ?? weatherRes.summary,
      });
      return;
    }

    if (existing.type === 'tavily') {
      const apiKey = typeof merged['apiKey'] === 'string' ? merged['apiKey'].trim() : '';
      if (!apiKey) {
        sendJson(res, 200, {
          ok: false,
          details: 'Falta configurar la API Key de Tavily.',
        });
        return;
      }
      const tavilyRes = await ctx.bridgeService.searchTavily(apiKey, 'Troko');
      sendJson(res, 200, {
        ...tavilyRes,
        details: tavilyRes.ok
          ? 'Conexión con Tavily verificada.'
          : tavilyRes.error ?? tavilyRes.summary,
      });
      return;
    }

    if (existing.type === 'telegram') {
      const botToken =
        typeof merged['botToken'] === 'string' ? merged['botToken'].trim() : '';
      const chatId =
        typeof merged['chatId'] === 'string' ? merged['chatId'].trim() : '';
      if (!botToken || !chatId) {
        sendJson(res, 200, {
          ok: false,
          details: 'Falta configurar Bot Token y Chat ID.',
        });
        return;
      }
      const tgRes = await ctx.bridgeService.sendTelegramMessage(
        botToken,
        chatId,
        'Prueba de conexión desde Troko-Desk'
      );
      sendJson(res, 200, {
        ...tgRes,
        details: tgRes.ok ? tgRes.summary : tgRes.error ?? tgRes.summary,
      });
      return;
    }

    sendJson(res, 200, { ok: true, details: 'Configuración válida.' });
  });
}
