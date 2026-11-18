import type {
  AppSettings,
  MemoryExportPayload,
  SettingsPatch,
} from '../../../shared/types.ts';
import type { TrokoDatabase } from '../db/database.ts';
import type { EventBus } from '../eventBus.ts';

export class SettingsService {
  private readonly trokoDb: TrokoDatabase;
  private readonly eventBus: EventBus;

  constructor(trokoDb: TrokoDatabase, eventBus: EventBus) {
    this.trokoDb = trokoDb;
    this.eventBus = eventBus;
  }

  getSettings(): AppSettings {
    return this.trokoDb.getSettingsObject();
  }

  patchSettings(patch: SettingsPatch): AppSettings {
    const current = this.trokoDb.getSettingsObject();
    const now = new Date().toISOString();

    this.trokoDb.transaction(() => {
      const stmt = this.trokoDb.db.prepare(
        `INSERT INTO settings (key, value_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`
      );

      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        if (key === 'permissions' && typeof value === 'object' && value !== null) {
          const mergedPerms = {
            ...current.permissions,
            ...value,
          };
          stmt.run('permissions', JSON.stringify(mergedPerms), now);
        } else {
          stmt.run(key, JSON.stringify(value), now);
        }
      }
    });

    const updated = this.trokoDb.getSettingsObject();
    this.eventBus.publish('data.updated', { scope: 'settings' });
    return updated;
  }

  exportMemory(): MemoryExportPayload {
    return this.trokoDb.exportMemory();
  }

  wipeMemory(): AppSettings {
    this.trokoDb.wipeMemory();
    this.eventBus.resetIslandState();
    this.eventBus.publish('data.updated', { scope: 'memory_wiped' });
    return this.trokoDb.getSettingsObject();
  }
}
