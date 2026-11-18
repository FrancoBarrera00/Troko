import type {
  IntegrationRecord,
  IntegrationType,
} from '../../../shared/types.ts';
import { validateAppLaunchInput } from '../../../shared/validators.ts';
import { HttpError } from '../app.ts';
import type { TrokoDatabase } from '../db/database.ts';
import type { EventBus } from '../eventBus.ts';

export const WHITELISTED_APPS = [
  'Notas',
  'Safari',
  'Calendario',
  'Calculadora',
  'Música',
  'Correo',
  'Finder',
] as const;

export type WhitelistedAppName = (typeof WHITELISTED_APPS)[number];

function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export interface LaunchedAppRecord {
  app: WhitelistedAppName;
  launchedAt: string;
}

export interface IntegrationCompat extends IntegrationRecord {
  lastStatus: string;
}

export class AppLauncherService {
  private readonly db: TrokoDatabase;
  private readonly eventBus: EventBus;
  private launchedHistory: LaunchedAppRecord[] = [];

  constructor(db: TrokoDatabase, eventBus: EventBus) {
    this.db = db;
    this.eventBus = eventBus;
  }

  resolveWhitelistedApp(inputName: string): WhitelistedAppName | null {
    const validated = validateAppLaunchInput({ appName: inputName });
    if (!validated.ok) {
      return null;
    }
    const targetNorm = normalizeText(validated.value.appName);
    for (const candidate of WHITELISTED_APPS) {
      if (normalizeText(candidate) === targetNorm) {
        return candidate;
      }
    }
    return null;
  }

  launchApp(rawInput: unknown): {
    ok: true;
    app: WhitelistedAppName;
    appName: WhitelistedAppName;
    launchedAt: string;
  } {
    const validated = validateAppLaunchInput(rawInput);
    if (!validated.ok) {
      throw new HttpError(400, validated.error);
    }
    const canonical = this.resolveWhitelistedApp(validated.value.appName);
    if (!canonical) {
      throw new HttpError(
        400,
        `Aplicación "${validated.value.appName}" no está en la lista segura (${WHITELISTED_APPS.join(', ')})`
      );
    }

    const launchedAt = new Date().toISOString();
    this.launchedHistory.unshift({ app: canonical, launchedAt });
    if (this.launchedHistory.length > 20) {
      this.launchedHistory.length = 20;
    }

    this.eventBus.setIslandState({
      state: 'success',
      mood: 'contento',
      statusText: 'Listo',
      badgeWord: canonical,
      peekCard: null,
    });
    this.eventBus.publish('data.updated', { scope: 'apps' });

    return {
      ok: true,
      app: canonical,
      appName: canonical,
      launchedAt,
    };
  }

  listApps(): {
    ok: true;
    apps: readonly WhitelistedAppName[];
    recentLaunches: LaunchedAppRecord[];
  } {
    return {
      ok: true,
      apps: WHITELISTED_APPS,
      recentLaunches: [...this.launchedHistory],
    };
  }

  ensureIntegrationsSeeded(): void {
    const row = this.db.db
      .prepare('SELECT COUNT(*) AS cnt FROM integrations')
      .get() as Record<string, unknown> | undefined;
    if (Number(row?.['cnt'] ?? 0) > 0) return;

    const nowIso = new Date().toISOString();
    const stmt = this.db.db.prepare(
      `INSERT INTO integrations (id, type, enabled, config_json, updated_at)
       VALUES (?, ?, 0, ?, ?)`
    );

    const defaults: Array<{
      id: string;
      type: IntegrationType;
      config: Record<string, unknown>;
    }> = [
      { id: 'int-telegram', type: 'telegram', config: { botToken: '', chatId: '' } },
      { id: 'int-weather', type: 'weather', config: { city: 'Madrid', units: 'metric' } },
      { id: 'int-tavily', type: 'tavily', config: { apiKey: '' } },
      { id: 'int-imap-smtp', type: 'imap_smtp', config: { host: '', user: '' } },
    ];

    for (const item of defaults) {
      stmt.run(item.id, item.type, JSON.stringify(item.config), nowIso);
    }
  }

  private mapIntegrationRow(row: Record<string, unknown>): IntegrationCompat {
    let config: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(String(row['config_json'] ?? '{}')) as unknown;
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        config = parsed as Record<string, unknown>;
      }
    } catch {
      config = {};
    }
    const enabled = Number(row['enabled']) === 1;
    return {
      id: String(row['id']),
      type: String(row['type']) as IntegrationType,
      enabled,
      config,
      lastStatus: enabled ? 'active' : 'disabled',
      updatedAt: String(row['updated_at']),
    };
  }

  listIntegrations(): IntegrationCompat[] {
    this.ensureIntegrationsSeeded();
    const rows = this.db.db
      .prepare('SELECT * FROM integrations ORDER BY id ASC')
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapIntegrationRow(r));
  }

  patchIntegration(
    typeOrId: string,
    patch: { enabled?: boolean; config?: Record<string, unknown> }
  ): IntegrationCompat {
    this.ensureIntegrationsSeeded();
    const row = this.db.db
      .prepare('SELECT * FROM integrations WHERE type = ? OR id = ?')
      .get(typeOrId, typeOrId) as Record<string, unknown> | undefined;
    if (!row) {
      throw new HttpError(404, `Integración "${typeOrId}" no encontrada`);
    }

    const existing = this.mapIntegrationRow(row);
    const nextEnabled =
      typeof patch.enabled === 'boolean' ? patch.enabled : existing.enabled;
    const nextConfig: Record<string, unknown> = {
      ...existing.config,
      ...(patch.config && typeof patch.config === 'object' && !Array.isArray(patch.config)
        ? patch.config
        : {}),
    };
    const nowIso = new Date().toISOString();

    this.db.db
      .prepare(
        `UPDATE integrations
         SET enabled = ?, config_json = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(nextEnabled ? 1 : 0, JSON.stringify(nextConfig), nowIso, existing.id);

    const updatedRow = this.db.db
      .prepare('SELECT * FROM integrations WHERE id = ?')
      .get(existing.id) as Record<string, unknown>;
    const updated = this.mapIntegrationRow(updatedRow);
    this.eventBus.publish('data.updated', { scope: 'integrations' });
    return updated;
  }

  resetState(): void {
    this.launchedHistory = [];
  }
}
