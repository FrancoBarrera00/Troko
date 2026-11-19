import assert from 'node:assert/strict';
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

describe('M8 Round 6: Full Focus Virtual Assistant Suite', () => {
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

  it('starts focus presets with intention, guardian mode, shield, and recommended ambient sound', async () => {
    const startRes = await jsonReq<{
      ok: boolean;
      preset: { id: string; focusMinutes: number; guardianMode: string; soundId: string };
      intention: { label: string };
      assistant: { activePresetId: string; shieldEnabled: boolean; recommendedSound: string };
      focus: { status: string; durationSec: number; label: string };
    }>(baseUrl, 'POST', '/api/focus/presets/estudio_profundo/start', {
      label: 'Repasar Sistemas Operativos',
    });

    assert.equal(startRes.status, 200);
    assert.equal(startRes.data.ok, true);
    assert.equal(startRes.data.preset.focusMinutes, 25);
    assert.equal(startRes.data.preset.guardianMode, 'whitelist');
    assert.equal(startRes.data.preset.soundId, 'brown');
    assert.equal(startRes.data.intention.label, 'Repasar Sistemas Operativos');
    assert.equal(startRes.data.assistant.shieldEnabled, true);
    assert.equal(startRes.data.focus.status, 'active');
    assert.equal(startRes.data.focus.durationSec, 1500);

    const guardianRes = await jsonReq<{ config: { mode: string; enabled: boolean } }>(
      baseUrl,
      'GET',
      '/api/guardian'
    );
    assert.equal(guardianRes.data.config.mode, 'whitelist');
    assert.equal(guardianRes.data.config.enabled, true);
  });

  it('captures intrusive thoughts in Parking Lot (API & NLU) and promotes them to SQLite tasks', async () => {
    const nluRes = await jsonReq<{
      ok: boolean;
      toolAction: { type: string; itemId: string };
    }>(baseUrl, 'POST', '/api/chat/command', {
      text: 'Estaciona llamar al médico mañana',
    });
    assert.equal(nluRes.status, 200);
    assert.equal(nluRes.data.toolAction.type, 'parking_lot_add');

    const apiRes = await jsonReq<{
      ok: boolean;
      item: { id: string; text: string };
      parkingLot: Array<{ id: string; text: string }>;
    }>(baseUrl, 'POST', '/api/focus/parking-lot', {
      text: 'Enviar factura al cliente',
    });
    assert.equal(apiRes.status, 201);
    assert.equal(apiRes.data.parkingLot.length, 2);

    const promoteRes = await jsonReq<{
      ok: boolean;
      taskId: string;
      item: { promotedTaskId: string | null };
    }>(baseUrl, 'POST', `/api/focus/parking-lot/${apiRes.data.item.id}/promote`, {});
    assert.equal(promoteRes.status, 200);
    assert.ok(promoteRes.data.taskId);
    assert.equal(promoteRes.data.item.promotedTaskId, promoteRes.data.taskId);

    const tasksRes = await jsonReq<{ tasks: Array<{ id: string; title: string }> }>(
      baseUrl,
      'GET',
      '/api/tasks'
    );
    assert.ok(tasksRes.data.tasks.some((t) => t.title === 'Enviar factura al cliente'));

    const delRes = await jsonReq<{ ok: boolean; parkingLot: Array<{ id: string }> }>(
      baseUrl,
      'DELETE',
      `/api/focus/parking-lot/${apiRes.data.item.id}`
    );
    assert.equal(delRes.status, 200);
    assert.equal(delRes.data.parkingLot.length, 1);
  });

  it('shields due reminders during active focus and flushes them as a single PeekCard upon completion', async () => {
    await jsonReq(baseUrl, 'POST', '/api/focus/presets/sprint_rapido/start', {
      label: 'Sprint sin interrupciones',
    });

    // Schedule a reminder due right now (within 15s of creation so scheduler processes it)
    const triggerAt = new Date(Date.now() + 120).toISOString();
    await jsonReq(baseUrl, 'POST', '/api/reminders', {
      title: 'Revisar correo urgente',
      triggerAt,
      soundEnabled: true,
    });

    // Wait for reminder scheduler (300ms interval)
    await new Promise((r) => setTimeout(r, 550));

    const assistantMid = await jsonReq<{
      shieldedQueue: Array<{ title: string }>;
    }>(baseUrl, 'GET', '/api/focus/assistant');
    assert.equal(assistantMid.data.shieldedQueue.length, 1);
    assert.equal(assistantMid.data.shieldedQueue[0]?.title, 'Revisar correo urgente');

    // Island must stay in focus state (not interrupted!)
    const islandMid = await jsonReq<{ state: string }>(baseUrl, 'GET', '/api/island/state');
    assert.equal(islandMid.data.state, 'focus');

    // Finish focus -> flushes shielded queue into consolidated missed_reminders PeekCard
    await jsonReq(baseUrl, 'POST', '/api/focus/finish', {});

    const assistantAfter = await jsonReq<{ shieldedQueue: unknown[] }>(
      baseUrl,
      'GET',
      '/api/focus/assistant'
    );
    assert.equal(assistantAfter.data.shieldedQueue.length, 0);

    const islandAfter = await jsonReq<{
      state: string;
      peekCard: { kind: string; reminders: Array<{ title: string }> } | null;
    }>(baseUrl, 'GET', '/api/island/state');
    assert.equal(islandAfter.data.state, 'remind');
    assert.equal(islandAfter.data.peekCard?.kind, 'missed_reminders');
    assert.equal(islandAfter.data.peekCard?.reminders[0]?.title, 'Revisar correo urgente');
  });

  it('schedules spaced repetition reviews on mastered study blocks and advances intervals with XP', async () => {
    const dec = await jsonReq<{
      doc: { id: string; blocks: Array<{ id: string }> };
    }>(baseUrl, 'POST', '/api/study/decode', {
      title: 'Redes',
      text: '# Modelo OSI\n\nLa capa de transporte TCP garantiza entrega ordenada y control de congestion.',
    });
    const docId = dec.data.doc.id;
    const blockId = dec.data.doc.blocks[0]!.id;

    // Mastering schedules first review for +1 day
    await jsonReq(baseUrl, 'POST', `/api/study/docs/${docId}/blocks/${blockId}/master`, {
      mastered: true,
    });

    // Query due reviews 2 days in the future
    const futureIso = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const dueRes = await jsonReq<{
      count: number;
      dueReviews: Array<{ docId: string; blockId: string; reviewStage: number }>;
    }>(baseUrl, 'GET', `/api/study/due-reviews?at=${encodeURIComponent(futureIso)}`);

    assert.equal(dueRes.status, 200);
    assert.equal(dueRes.data.count, 1);
    assert.equal(dueRes.data.dueReviews[0]?.blockId, blockId);
    assert.equal(dueRes.data.dueReviews[0]?.reviewStage, 1);

    // Record "good" review -> advances to stage 2 (3 days) + 20 XP
    const revRes = await jsonReq<{
      ok: boolean;
      intervalDays: number;
      xpEarned: number;
      progression: { xp: number };
    }>(baseUrl, 'POST', `/api/study/docs/${docId}/blocks/${blockId}/review`, {
      quality: 'good',
    });
    assert.equal(revRes.status, 200);
    assert.equal(revRes.data.intervalDays, 3);
    assert.equal(revRes.data.xpEarned, 20);
    assert.equal(revRes.data.progression.xp, 55); // 35 master + 20 review
  });

  it('computes Focus Insights (best slot, clean %, top distractions) and preserves 15-table invariant on wipe', async () => {
    await jsonReq(baseUrl, 'POST', '/api/focus/presets/trabajo_codigo/start', {
      label: 'Implementar API',
    });
    await jsonReq(baseUrl, 'POST', '/api/guardian/test-alert', {
      sampleTitle: 'YouTube - Música',
    });
    await jsonReq(baseUrl, 'POST', '/api/focus/finish', {});

    const insightsRes = await jsonReq<{
      ok: boolean;
      insights: {
        totalCompletedBlocks: number;
        totalFocusMinutes: number;
        bestTimeSlot: string;
        topDistractions: Array<{ label: string; count: number }>;
        totalDistractions: number;
      };
    }>(baseUrl, 'GET', '/api/focus/insights');

    assert.equal(insightsRes.status, 200);
    assert.equal(insightsRes.data.insights.totalCompletedBlocks, 1);
    assert.equal(insightsRes.data.insights.totalFocusMinutes, 50);
    assert.notEqual(insightsRes.data.insights.bestTimeSlot, 'Sin datos');
    assert.equal(insightsRes.data.insights.totalDistractions, 1);
    assert.equal(insightsRes.data.insights.topDistractions[0]?.label, 'YouTube - Música');

    // Wipe resets all focus assistant & guardian data
    await jsonReq(baseUrl, 'POST', '/api/memory/wipe', {});
    const afterWipe = await jsonReq<{
      insights: { totalCompletedBlocks: number; totalDistractions: number };
      parkingLot: unknown[];
    }>(baseUrl, 'GET', '/api/focus/assistant');
    assert.equal(afterWipe.data.insights.totalCompletedBlocks, 0);
    assert.equal(afterWipe.data.insights.totalDistractions, 0);
    assert.equal(afterWipe.data.parkingLot.length, 0);

    // 15-table SQLite invariant check
    const tables = app.db.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>;
    assert.deepEqual(
      tables.map((t) => t.name),
      [...EXPECTED_TABLES]
    );
  });
});
