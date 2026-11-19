import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createApp, type TrokoApp } from '../src/app.ts';
import { EXPECTED_TABLES } from '../src/db/schema.ts';

async function jsonReq<T>(
  baseUrl: string,
  method: string,
  pathname: string,
  body?: unknown
): Promise<{ status: number; data: T }> {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = (await res.json()) as T;
  return { status: res.status, data };
}

describe('M9 Round 7: Nuko Desk Rebranding & Dual Companions (Nuko + Luma Option A XP)', () => {
  let app: TrokoApp;
  let baseUrl: string;

  beforeEach(async () => {
    app = createApp({ dbPath: ':memory:', heartbeatMs: 60_000 });
    const bound = await app.listen(0, '127.0.0.1');
    baseUrl = `http://${bound.host}:${bound.port}`;
  });

  afterEach(async () => {
    await app.close();
  });

  it('defaults wakeWord to Nuko and tracks independent XP, level, and accessories for Nuko and Luma (Option A)', async () => {
    const settingsRes = await jsonReq<{ wakeWord: string }>(baseUrl, 'GET', '/api/settings');
    assert.equal(settingsRes.status, 200);
    assert.equal(settingsRes.data.wakeWord, 'Nuko');

    const initProg = await jsonReq<{
      ok: boolean;
      activeCompanion: string;
      progression: { xp: number; level: number; equippedAccessory: string };
      companions: {
        nuko: { xp: number; level: number; equippedAccessory: string };
        luma: { xp: number; level: number; equippedAccessory: string };
      };
    }>(baseUrl, 'GET', '/api/progression');

    assert.equal(initProg.status, 200);
    assert.equal(initProg.data.activeCompanion, 'nuko');
    assert.equal(initProg.data.companions.nuko.xp, 0);
    assert.equal(initProg.data.companions.luma.xp, 0);

    // 1. Level up Nuko to Level 2 (80 XP focus + 35 XP PDF block = 115 XP)
    await jsonReq(baseUrl, 'POST', '/api/focus/start', { label: 'Entrenar a Nuko' });
    await jsonReq(baseUrl, 'POST', '/api/focus/finish', {});
    const dec = await jsonReq<{ doc: { id: string; blocks: Array<{ id: string }> } }>(
      baseUrl,
      'POST',
      '/api/study/decode',
      {
        title: 'Algoritmos',
        text: '# Grafos\n\nEl algoritmo de Dijkstra encuentra caminos minimos con pesos no negativos.',
      }
    );
    await jsonReq(
      baseUrl,
      'POST',
      `/api/study/docs/${dec.data.doc.id}/blocks/${dec.data.doc.blocks[0]!.id}/master`,
      { mastered: true }
    );

    const nukoLeveled = await jsonReq<{
      activeCompanion: string;
      progression: { xp: number; level: number; equippedAccessory: string };
      companions: {
        nuko: { xp: number; level: number; equippedAccessory: string };
        luma: { xp: number; level: number; equippedAccessory: string };
      };
    }>(baseUrl, 'GET', '/api/progression');

    assert.equal(nukoLeveled.data.activeCompanion, 'nuko');
    assert.equal(nukoLeveled.data.companions.nuko.xp, 115);
    assert.equal(nukoLeveled.data.companions.nuko.level, 2);
    assert.equal(nukoLeveled.data.companions.nuko.equippedAccessory, 'glasses');
    // Luma must remain at 0 XP / Level 1!
    assert.equal(nukoLeveled.data.companions.luma.xp, 0);
    assert.equal(nukoLeveled.data.companions.luma.level, 1);
    assert.equal(nukoLeveled.data.companions.luma.equippedAccessory, 'none');

    // 2. Switch active companion to Luma
    const switchRes = await jsonReq<{
      ok: boolean;
      activeCompanion: string;
      progression: { xp: number; level: number };
      companions: {
        nuko: { xp: number; level: number };
        luma: { xp: number; level: number };
      };
    }>(baseUrl, 'POST', '/api/progression/companion', { companion: 'luma' });

    assert.equal(switchRes.status, 200);
    assert.equal(switchRes.data.activeCompanion, 'luma');
    assert.equal(switchRes.data.progression.xp, 0);
    assert.equal(switchRes.data.progression.level, 1);

    // Luma cannot equip glasses yet (still Level 1)
    const lumaEquipLocked = await jsonReq(baseUrl, 'POST', '/api/progression/equip', {
      accessory: 'glasses',
    });
    assert.equal(lumaEquipLocked.status, 403);

    // 3. Complete a clean focus block with Luma -> credits Luma (+80 XP), Nuko stays at 115 XP
    await jsonReq(baseUrl, 'POST', '/api/focus/start', { label: 'Entrenar a Luma' });
    await jsonReq(baseUrl, 'POST', '/api/focus/finish', {});

    const afterLumaFocus = await jsonReq<{
      activeCompanion: string;
      progression: { xp: number; level: number };
      companions: {
        nuko: { xp: number; level: number };
        luma: { xp: number; level: number };
      };
    }>(baseUrl, 'GET', '/api/progression');

    assert.equal(afterLumaFocus.data.activeCompanion, 'luma');
    assert.equal(afterLumaFocus.data.companions.luma.xp, 80);
    assert.equal(afterLumaFocus.data.companions.nuko.xp, 115);

    // Rejects invalid companion IDs with 400
    const badComp = await jsonReq(baseUrl, 'POST', '/api/progression/companion', {
      companion: 'pikachu',
    });
    assert.equal(badComp.status, 400);
  });

  it('migrates legacy flat troko-progression.json into companions.nuko with luma fresh', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuko-mig-'));
    try {
      const legacyFile = path.join(tmpDir, 'troko-progression.json');
      fs.writeFileSync(
        legacyFile,
        JSON.stringify({
          xp: 260,
          focusStreakBlocks: 3,
          totalFocusCleanBlocks: 4,
          totalStudyBlocksMastered: 2,
          totalQuizzesCorrect: 5,
          equippedAccessory: 'headphones',
        }),
        'utf8'
      );

      const dbFile = path.join(tmpDir, 'nuko.db');
      const migApp = createApp({ dbPath: dbFile, heartbeatMs: 60_000 });
      try {
        const all = migApp.ctx.progressionService.getAllCompanions();
        assert.equal(migApp.ctx.progressionService.getActiveCompanion(), 'nuko');
        assert.equal(all.nuko.xp, 260);
        assert.equal(all.nuko.level, 3);
        assert.equal(all.nuko.equippedAccessory, 'headphones');
        assert.equal(all.luma.xp, 0);
        assert.equal(all.luma.level, 1);
      } finally {
        await migApp.close();
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('accepts both Nuko and Luma wake words in NLU and self-excludes both in Focus Guardian', async () => {
    const cmdNuko = await jsonReq<{
      ok: boolean;
      toolAction: { type: string; title: string };
    }>(baseUrl, 'POST', '/api/chat/command', {
      text: 'Nuko, anotame preparar presentación',
    });
    assert.equal(cmdNuko.status, 200);
    assert.equal(cmdNuko.data.toolAction.type, 'create_task');

    const cmdLuma = await jsonReq<{
      ok: boolean;
      toolAction: { type: string; text: string };
    }>(baseUrl, 'POST', '/api/chat/command', {
      text: 'Luma, estaciona revisar bibliografía',
    });
    assert.equal(cmdLuma.status, 200);
    assert.equal(cmdLuma.data.toolAction.type, 'parking_lot_add');

    // Focus Guardian in strict whitelist mode must never flag Nuko Desk or Luma window titles
    await jsonReq(baseUrl, 'POST', '/api/focus/presets/estudio_profundo/start', {
      label: 'Estudio',
    });
    const checkNuko = await jsonReq<{ distracting: boolean }>(
      baseUrl,
      'POST',
      '/api/guardian/check',
      { windowTitle: 'Nuko Desk — Modo Enfoque' }
    );
    assert.equal(checkNuko.data.distracting, false);

    const checkLuma = await jsonReq<{ distracting: boolean }>(
      baseUrl,
      'POST',
      '/api/guardian/check',
      { windowTitle: 'Luma Companion Window' }
    );
    assert.equal(checkLuma.data.distracting, false);

    // Wipe resets both companions and preserves 15 SQLite tables
    await jsonReq(baseUrl, 'POST', '/api/memory/wipe', {});
    const afterWipe = await jsonReq<{
      activeCompanion: string;
      companions: { nuko: { xp: number }; luma: { xp: number } };
    }>(baseUrl, 'GET', '/api/progression');
    assert.equal(afterWipe.data.activeCompanion, 'nuko');
    assert.equal(afterWipe.data.companions.nuko.xp, 0);
    assert.equal(afterWipe.data.companions.luma.xp, 0);

    const tables = app.db.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as Array<{ name: string }>;
    assert.deepEqual(
      tables.map((t) => t.name),
      [...EXPECTED_TABLES]
    );
  });
});
