import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { TROKO_DESKTOP_IPC_CHANNELS, TROKO_IPC_CHANNELS } from '../../electron/main.ts';
import { createApp, type TrokoApp } from '../src/app.ts';

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

function buildMinimalTwoPagePdf(page1Text: string, page2Text: string): string {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const stream1 = `BT /F1 12 Tf 50 750 Td (${esc(page1Text)}) Tj ET`;
  const stream2 = `BT /F1 12 Tf 50 750 Td (${esc(page2Text)}) Tj ET`;

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 7 0 R >> >> >>\nendobj\n',
    '4 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream1, 'utf8')} >>\nstream\n${stream1}\nendstream\nendobj\n`,
    `6 0 obj\n<< /Length ${Buffer.byteLength(stream2, 'utf8')} >>\nstream\n${stream2}\nendstream\nendobj\n`,
    '7 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(out, 'utf8'));
    out += obj;
  }
  const xrefPos = Buffer.byteLength(out, 'utf8');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    out += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(out, 'utf8').toString('base64');
}

describe('M7 Round 5: Study PDF Decoder, Real Focus Guardian & XP Progression', () => {
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

  it('extracts a real multi-page PDF without losing content and generates study blocks with quiz & Feynman', async () => {
    const p1 =
      'Capitulo 1 La Celula. La mitocondria es la central energetica que produce ATP mediante respiracion celular.';
    const p2 =
      'Capitulo 2 Genetica Molecular. El ADN contiene las instrucciones hereditarias y se replica antes de la mitosis.';
    const pdfBase64 = buildMinimalTwoPagePdf(p1, p2);

    const decRes = await jsonReq<{
      ok: boolean;
      doc: {
        id: string;
        sourceType: string;
        totalPages: number;
        blocks: Array<{
          id: string;
          title: string;
          pageRange: string;
          fullText: string;
          keyPoints: string[];
          quizQuestions: Array<{
            id: string;
            options: string[];
            correctIndex: number;
          }>;
        }>;
      };
    }>(baseUrl, 'POST', '/api/study/decode', {
      title: 'Biologia Basica',
      fileName: 'biologia.pdf',
      pdfBase64,
    });

    assert.equal(decRes.status, 201);
    assert.equal(decRes.data.ok, true);
    assert.equal(decRes.data.doc.sourceType, 'pdf');
    assert.equal(decRes.data.doc.totalPages, 2);
    assert.ok(decRes.data.doc.blocks.length >= 1);

    const combinedText = decRes.data.doc.blocks.map((b) => b.fullText).join('\n');
    assert.match(combinedText, /mitocondria/i);
    assert.match(combinedText, /ADN contiene/i);

    const firstBlock = decRes.data.doc.blocks[0]!;
    assert.ok(firstBlock.keyPoints.length >= 1);
    assert.ok(firstBlock.quizQuestions.length >= 1);
    const q = firstBlock.quizQuestions[0]!;

    // Answer quiz correctly -> +25 XP
    const qRes = await jsonReq<{
      ok: boolean;
      correct: boolean;
      xpEarned: number;
      progression: { xp: number };
    }>(baseUrl, 'POST', `/api/study/docs/${decRes.data.doc.id}/blocks/${firstBlock.id}/quiz`, {
      questionId: q.id,
      selectedIndex: q.correctIndex,
    });
    assert.equal(qRes.status, 200);
    assert.equal(qRes.data.correct, true);
    assert.equal(qRes.data.xpEarned, 25);

    // Master block -> +35 XP
    const mRes = await jsonReq<{
      ok: boolean;
      xpEarned: number;
      progression: { xp: number };
    }>(baseUrl, 'POST', `/api/study/docs/${decRes.data.doc.id}/blocks/${firstBlock.id}/master`, {
      mastered: true,
    });
    assert.equal(mRes.status, 200);
    assert.equal(mRes.data.xpEarned, 35);

    // Feynman check -> +30 XP when matching key concepts
    const fRes = await jsonReq<{
      ok: boolean;
      scorePct: number;
      xpEarned: number;
      progression: { xp: number };
    }>(baseUrl, 'POST', `/api/study/docs/${decRes.data.doc.id}/blocks/${firstBlock.id}/feynman`, {
      explanation:
        'La celula utiliza la mitocondria para producir energia ATP y el ADN guarda las instrucciones hereditarias de la mitosis.',
    });
    assert.equal(fRes.status, 200);
    assert.ok(fRes.data.scorePct >= 50);
    assert.equal(fRes.data.xpEarned, 30);
    assert.equal(fRes.data.progression.xp, 90);
  });

  it('awards focus XP, levels up, unlocks accessories cleanly, and enforces equip rules', async () => {
    // 90 XP from studying a block + 80 XP from a clean focus block => 170 XP (Level 2)
    await jsonReq(baseUrl, 'POST', '/api/study/decode', {
      title: 'Historia',
      text: '# Revolucion Industrial\n\nLa maquina de vapor transformo el transporte, la industria textil y las ciudades europeas.',
    });

    const docsRes = await jsonReq<{
      docs: Array<{
        id: string;
        blocks: Array<{ id: string; quizQuestions: Array<{ id: string; correctIndex: number }> }>;
      }>;
    }>(baseUrl, 'GET', '/api/study/docs');

    const doc = docsRes.data.docs[0]!;
    const blk = doc.blocks[0]!;
    await jsonReq(baseUrl, 'POST', `/api/study/docs/${doc.id}/blocks/${blk.id}/master`, {
      mastered: true,
    });

    await jsonReq(baseUrl, 'POST', '/api/focus/start', { label: 'Repasar Historia' });
    await jsonReq(baseUrl, 'POST', '/api/focus/finish', {});

    const prog = await jsonReq<{
      progression: {
        xp: number;
        level: number;
        focusStreakBlocks: number;
        unlockedAccessories: string[];
        equippedAccessory: string;
      };
    }>(baseUrl, 'GET', '/api/progression');

    assert.equal(prog.data.progression.xp, 115); // 35 + 80
    assert.equal(prog.data.progression.level, 2);
    assert.equal(prog.data.progression.focusStreakBlocks, 1);
    assert.ok(prog.data.progression.unlockedAccessories.includes('glasses'));

    const equipOk = await jsonReq<{
      ok: boolean;
      progression: { equippedAccessory: string };
    }>(baseUrl, 'POST', '/api/progression/equip', { accessory: 'glasses' });
    assert.equal(equipOk.status, 200);
    assert.equal(equipOk.data.progression.equippedAccessory, 'glasses');

    const equipLocked = await jsonReq<{ ok: boolean }>(
      baseUrl,
      'POST',
      '/api/progression/equip',
      { accessory: 'headphones' }
    );
    assert.equal(equipLocked.status, 403);
  });

  it('monitors active window distractions via Focus Guardian (blacklist, whitelist, grace period) and resets on wipe', async () => {
    await jsonReq(baseUrl, 'POST', '/api/focus/start', { label: 'Estudiar SQL' });
    await jsonReq(baseUrl, 'PATCH', '/api/guardian', {
      enabled: true,
      mode: 'blacklist',
      graceSec: 10,
      distractionKeywords: ['youtube', 'twitch'],
    });

    // Allowed window -> no distraction
    const cleanCheck = await jsonReq<{
      distracting: boolean;
      triggered: boolean;
    }>(baseUrl, 'POST', '/api/guardian/check', {
      windowTitle: 'Visual Studio Code - apuntes.md',
    });
    assert.equal(cleanCheck.data.distracting, false);
    assert.equal(cleanCheck.data.triggered, false);

    // Distraction inside grace period (< 10s) -> warning only, not triggered yet
    const withinGrace = await jsonReq<{
      distracting: boolean;
      triggered: boolean;
    }>(baseUrl, 'POST', '/api/guardian/check', {
      windowTitle: 'YouTube - Música para estudiar',
      elapsedHiddenSec: 3,
    });
    assert.equal(withinGrace.data.distracting, true);
    assert.equal(withinGrace.data.triggered, false);

    // Elapsed >= graceSec -> triggers alert and breaks streak
    await jsonReq(baseUrl, 'PATCH', '/api/guardian', { graceSec: 3 });
    const triggered = await jsonReq<{
      distracting: boolean;
      triggered: boolean;
      message?: string;
      runtime: { sessionDistractions: number };
    }>(baseUrl, 'POST', '/api/guardian/check', {
      windowTitle: 'YouTube - Música para estudiar',
      elapsedHiddenSec: 15,
    });
    assert.equal(triggered.data.distracting, true);
    assert.equal(triggered.data.triggered, true);
    assert.ok(triggered.data.runtime.sessionDistractions >= 1);
    assert.match(triggered.data.message ?? '', /Guardián de Enfoque/);

    // Whitelist mode check
    await jsonReq(baseUrl, 'PATCH', '/api/guardian', {
      mode: 'whitelist',
      allowedKeywords: ['pdf', 'vscode'],
    });
    const whiteOk = await jsonReq<{ distracting: boolean }>(
      baseUrl,
      'POST',
      '/api/guardian/check',
      { windowTitle: 'Resumen_Biologia.pdf' }
    );
    assert.equal(whiteOk.data.distracting, false);

    // Wipe cleans Round 5 stores
    await jsonReq(baseUrl, 'POST', '/api/memory/wipe', {});
    const afterWipeProg = await jsonReq<{ progression: { xp: number } }>(
      baseUrl,
      'GET',
      '/api/progression'
    );
    const afterWipeDocs = await jsonReq<{ docs: unknown[] }>(
      baseUrl,
      'GET',
      '/api/study/docs'
    );
    assert.equal(afterWipeProg.data.progression.xp, 0);
    assert.equal(afterWipeDocs.data.docs.length, 0);
  });

  it('preserves SQLite 15-table schema and Electron IPC contracts while exposing GET_ACTIVE_WINDOW', () => {
    const tables = app.db.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
      )
      .all() as Array<{ name: string }>;
    assert.equal(tables.length, 15);
    assert.deepEqual(TROKO_IPC_CHANNELS, {
      SET_INTERACTIVE: 'troko:set-interactive',
      HIDE: 'troko:hide',
      QUIT: 'troko:quit',
    });
    assert.equal(TROKO_DESKTOP_IPC_CHANNELS.GET_ACTIVE_WINDOW, 'troko:get-active-window');
  });
});
