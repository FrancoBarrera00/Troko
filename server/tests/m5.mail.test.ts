import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../src/app.ts';
import { sendSmtpMail } from '../src/services/mailTransport.ts';

interface MockImapMessage {
  seq: number;
  from: string;
  subject: string;
  date: string;
  messageId: string;
  body: string;
  seen?: boolean;
}

function createMockImapServer(messages: MockImapMessage[]) {
  let loginCount = 0;
  let noopCount = 0;
  let fetchCount = 0;

  const server = net.createServer((socket) => {
    socket.write('* OK Mock IMAP4rev1 ready\r\n');
    let buf = '';
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      while (true) {
        const idx = buf.indexOf('\n');
        if (idx === -1) break;
        const line = buf.slice(0, idx + 1).replace(/\r?\n$/, '');
        buf = buf.slice(idx + 1);
        if (!line) continue;

        const spaceIdx = line.indexOf(' ');
        const tag = spaceIdx > 0 ? line.slice(0, spaceIdx) : 'A001';
        const rest = spaceIdx > 0 ? line.slice(spaceIdx + 1) : line;
        const upper = rest.toUpperCase();

        if (upper.startsWith('LOGIN ')) {
          loginCount += 1;
          socket.write(`${tag} OK LOGIN completed\r\n`);
        } else if (upper.startsWith('NOOP')) {
          noopCount += 1;
          socket.write(`${tag} OK NOOP completed\r\n`);
        } else if (upper.startsWith('SELECT ')) {
          socket.write(`* ${messages.length} EXISTS\r\n`);
          socket.write(`${tag} OK [READ-ONLY] SELECT completed\r\n`);
        } else if (upper.startsWith('SEARCH ')) {
          const seqs = messages.map((m) => m.seq).join(' ');
          socket.write(`* SEARCH${seqs ? ` ${seqs}` : ''}\r\n`);
          socket.write(`${tag} OK SEARCH completed\r\n`);
        } else if (upper.startsWith('FETCH ')) {
          fetchCount += 1;
          for (const m of messages) {
            const hdr =
              `From: ${m.from}\r\n` +
              `Subject: ${m.subject}\r\n` +
              `Date: ${m.date}\r\n` +
              `Message-ID: ${m.messageId}\r\n\r\n`;
            const flags = m.seen ? '\\Seen' : '';
            socket.write(
              `* ${m.seq} FETCH (FLAGS (${flags}) BODY[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID)] {${Buffer.byteLength(hdr, 'utf8')}}\r\n${hdr}` +
                ` BODY[TEXT] {${Buffer.byteLength(m.body, 'utf8')}}\r\n${m.body})\r\n`
            );
          }
          socket.write(`${tag} OK FETCH completed\r\n`);
        } else if (upper.startsWith('LOGOUT')) {
          socket.write('* BYE Mock IMAP logging out\r\n');
          socket.write(`${tag} OK LOGOUT completed\r\n`);
          socket.end();
        } else {
          socket.write(`${tag} BAD Unknown command\r\n`);
        }
      }
    });
  });

  return {
    server,
    getStats: () => ({ loginCount, noopCount, fetchCount }),
  };
}

function createMockSmtpServer(options: { failOnData?: boolean } = {}) {
  const receivedMails: Array<{
    mailFrom: string;
    rcptTo: string[];
    data: string;
  }> = [];
  let connectionCount = 0;

  const server = net.createServer((socket) => {
    connectionCount += 1;
    socket.write('220 mock.smtp.local ESMTP ready\r\n');

    let buf = '';
    let inData = false;
    let authStage: 'none' | 'user' | 'pass' = 'none';
    let currentMail = { mailFrom: '', rcptTo: [] as string[], data: '' };

    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      while (true) {
        if (inData) {
          const endIdx = buf.indexOf('\r\n.\r\n');
          if (endIdx === -1) break;
          currentMail.data = buf.slice(0, endIdx);
          buf = buf.slice(endIdx + 5);
          inData = false;

          if (options.failOnData) {
            socket.write('550 5.7.1 Message rejected by mock SMTP\r\n');
          } else {
            receivedMails.push({ ...currentMail, rcptTo: [...currentMail.rcptTo] });
            socket.write('250 2.0.0 Ok: queued\r\n');
          }
          continue;
        }

        const idx = buf.indexOf('\n');
        if (idx === -1) break;
        const line = buf.slice(0, idx + 1).replace(/\r?\n$/, '');
        buf = buf.slice(idx + 1);

        if (authStage === 'user') {
          authStage = 'pass';
          socket.write('334 UGFzc3dvcmQ6\r\n');
          continue;
        }
        if (authStage === 'pass') {
          authStage = 'none';
          socket.write('235 2.7.0 Authentication successful\r\n');
          continue;
        }

        const upper = line.toUpperCase();
        if (upper.startsWith('EHLO ') || upper.startsWith('HELO ')) {
          socket.write('250-mock.smtp.local\r\n250 AUTH LOGIN PLAIN\r\n');
        } else if (upper === 'AUTH LOGIN') {
          authStage = 'user';
          socket.write('334 VXNlcm5hbWU6\r\n');
        } else if (upper.startsWith('AUTH PLAIN ')) {
          socket.write('235 2.7.0 Authentication successful\r\n');
        } else if (upper.startsWith('MAIL FROM:')) {
          currentMail = {
            mailFrom: line.slice('MAIL FROM:'.length).trim(),
            rcptTo: [],
            data: '',
          };
          socket.write('250 2.1.0 Ok\r\n');
        } else if (upper.startsWith('RCPT TO:')) {
          currentMail.rcptTo.push(line.slice('RCPT TO:'.length).trim());
          socket.write('250 2.1.5 Ok\r\n');
        } else if (upper === 'DATA') {
          inData = true;
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (upper === 'QUIT') {
          socket.write('221 2.0.0 Bye\r\n');
          socket.end();
        } else {
          socket.write('500 5.5.1 Command unrecognized\r\n');
        }
      }
    });
  });

  return {
    server,
    getReceivedMails: () => receivedMails,
    getConnectionCount: () => connectionCount,
  };
}

async function listenNetServer(server: net.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (typeof addr === 'object' && addr !== null) {
        resolve(addr.port);
      } else {
        reject(new Error('No address'));
      }
    });
  });
}

async function closeNetServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

async function withTestApp(
  fn: (ctx: {
    baseUrl: string;
    app: ReturnType<typeof createApp>;
  }) => Promise<void>
) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'troko-m5-mail-'));
  const dbPath = path.join(tmpDir, 'troko.db');
  const app = createApp({ dbPath, staticDir: null, heartbeatMs: 0 });
  const { port } = await app.listen(0, '127.0.0.1');
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await fn({ baseUrl, app });
  } finally {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test('R3-M3: Sandbox mode syncInbox and sendDraft work locally without network calls', async () => {
  await withTestApp(async ({ baseUrl }) => {
    const syncRes = await fetch(`${baseUrl}/api/mail/sync`, { method: 'POST' });
    assert.equal(syncRes.status, 200);
    const syncData = (await syncRes.json()) as {
      ok: boolean;
      messages: Array<{ id: string }>;
    };
    assert.equal(syncData.ok, true);
    assert.ok(syncData.messages.length >= 3);

    const draftRes = await fetch(`${baseUrl}/api/mail/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceMessageId: syncData.messages[0]?.id ?? null,
        toName: 'Ana López',
        toEmail: 'ana@equipo.local',
        subject: 'Re: Sandbox',
        body: 'Confirmado en sandbox',
      }),
    });
    assert.equal(draftRes.status, 201);
    const created = (await draftRes.json()) as { id: string; status: string };
    assert.equal(created.status, 'pending_confirmation');

    const sendRes = await fetch(`${baseUrl}/api/mail/drafts/${created.id}/send`, {
      method: 'POST',
    });
    assert.equal(sendRes.status, 200);
    const sent = (await sendRes.json()) as {
      ok: boolean;
      mode: string;
      status: string;
    };
    assert.equal(sent.ok, true);
    assert.equal(sent.mode, 'sandbox');
    assert.equal(sent.status, 'sent');
  });
});

test('R3-M3: Confirm-before-send invariant, real IMAP sync, real SMTP send, and integration test', async () => {
  const imapMock = createMockImapServer([
    {
      seq: 1,
      from: '"Lucía Real" <lucia@real.test>',
      subject: 'Contrato firmado',
      date: 'Tue, 18 Nov 2026 09:30:00 +0000',
      messageId: '<msg-real-1@real.test>',
      body: 'Hola, te envío el contrato firmado para revisar.',
      seen: false,
    },
  ]);
  const smtpMock = createMockSmtpServer();

  const imapPort = await listenNetServer(imapMock.server);
  const smtpPort = await listenNetServer(smtpMock.server);

  try {
    await withTestApp(async ({ baseUrl }) => {
      // 1. Test integration endpoint before enabling
      const testRes = await fetch(`${baseUrl}/api/integrations/imap_smtp/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            imapHost: '127.0.0.1',
            imapPort,
            smtpHost: '127.0.0.1',
            smtpPort,
            user: 'yo@real.test',
            pass: 'secret123',
            imapTls: false,
            smtpTls: false,
          },
        }),
      });
      assert.equal(testRes.status, 200);
      const testJson = (await testRes.json()) as {
        ok: boolean;
        imapOk: boolean;
        smtpOk: boolean;
      };
      assert.equal(testJson.ok, true);
      assert.equal(testJson.imapOk, true);
      assert.equal(testJson.smtpOk, true);
      assert.ok(imapMock.getStats().loginCount >= 1);
      assert.ok(imapMock.getStats().noopCount >= 1);

      // 2. Enable imap_smtp integration
      const patchRes = await fetch(`${baseUrl}/api/integrations/imap_smtp`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          config: {
            imapHost: '127.0.0.1',
            imapPort,
            smtpHost: '127.0.0.1',
            smtpPort,
            user: 'yo@real.test',
            pass: 'secret123',
            imapTls: false,
            smtpTls: false,
          },
        }),
      });
      assert.equal(patchRes.status, 200);

      // 3. Sync inbox via IMAP
      const syncRes = await fetch(`${baseUrl}/api/mail/sync`, { method: 'POST' });
      assert.equal(syncRes.status, 200);
      const syncData = (await syncRes.json()) as {
        ok: boolean;
        messages: Array<{
          fromName: string;
          fromEmail: string;
          subject: string;
          body: string;
        }>;
      };
      assert.equal(syncData.ok, true);
      const realMsg = syncData.messages.find((m) => m.fromEmail === 'lucia@real.test');
      assert.ok(realMsg, 'Expected IMAP message to be persisted in SQLite');
      assert.equal(realMsg.fromName, 'Lucía Real');
      assert.equal(realMsg.subject, 'Contrato firmado');

      // 4. Confirm-before-send invariant: createDraft & updateDraft NEVER trigger SMTP
      const smtpCountBeforeDraft = smtpMock.getConnectionCount();
      const draftRes = await fetch(`${baseUrl}/api/mail/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toName: 'Lucía Real',
          toEmail: 'lucia@real.test',
          subject: 'Re: Contrato firmado',
          body: 'Borrador inicial',
        }),
      });
      assert.equal(draftRes.status, 201);
      const created = (await draftRes.json()) as { id: string; status: string };
      assert.equal(created.status, 'pending_confirmation');

      const updateRes = await fetch(`${baseUrl}/api/mail/drafts/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'Recibido, muchas gracias.' }),
      });
      assert.equal(updateRes.status, 200);
      const updated = (await updateRes.json()) as { status: string };
      assert.equal(updated.status, 'pending_confirmation');
      assert.equal(
        smtpMock.getConnectionCount(),
        smtpCountBeforeDraft,
        'createDraft and updateDraft must NEVER connect to SMTP'
      );

      // 5. Explicit sendDraft triggers SMTP and marks draft sent
      const sendRes = await fetch(`${baseUrl}/api/mail/drafts/${created.id}/send`, {
        method: 'POST',
      });
      assert.equal(sendRes.status, 200);
      const sent = (await sendRes.json()) as {
        ok: boolean;
        mode: string;
        status: string;
      };
      assert.equal(sent.ok, true);
      assert.equal(sent.mode, 'smtp');
      assert.equal(sent.status, 'sent');

      const received = smtpMock.getReceivedMails();
      assert.equal(received.length, 1);
      assert.equal(received[0]?.mailFrom, '<yo@real.test>');
      assert.deepEqual(received[0]?.rcptTo, ['<lucia@real.test>']);
      assert.ok(received[0]?.data.includes('Recibido, muchas gracias.'));
    });
  } finally {
    await closeNetServer(imapMock.server);
    await closeNetServer(smtpMock.server);
  }
});

test('R3-M3: SMTP failure returns 502 and leaves draft pending_confirmation in SQLite', async () => {
  const imapMock = createMockImapServer([]);
  const smtpMock = createMockSmtpServer({ failOnData: true });

  const imapPort = await listenNetServer(imapMock.server);
  const smtpPort = await listenNetServer(smtpMock.server);

  try {
    await withTestApp(async ({ baseUrl }) => {
      await fetch(`${baseUrl}/api/integrations/imap_smtp`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          config: {
            imapHost: '127.0.0.1',
            imapPort,
            smtpHost: '127.0.0.1',
            smtpPort,
            user: 'yo@real.test',
            pass: 'secret123',
            imapTls: false,
            smtpTls: false,
          },
        }),
      });

      const draftRes = await fetch(`${baseUrl}/api/mail/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toName: 'Lucía Real',
          toEmail: 'lucia@real.test',
          subject: 'Re: Falla SMTP',
          body: 'Este correo fallará en DATA',
        }),
      });
      const created = (await draftRes.json()) as { id: string };

      const sendRes = await fetch(`${baseUrl}/api/mail/drafts/${created.id}/send`, {
        method: 'POST',
      });
      assert.equal(sendRes.status, 502);
      const errBody = (await sendRes.json()) as { ok: boolean; error: string };
      assert.equal(errBody.ok, false);
      assert.match(errBody.error, /550|SMTP/i);

      const inboxRes = await fetch(`${baseUrl}/api/mail/inbox`);
      const inbox = (await inboxRes.json()) as {
        drafts: Array<{ id: string; status: string; sentAt: string | null }>;
      };
      const persisted = inbox.drafts.find((d) => d.id === created.id);
      assert.ok(persisted);
      assert.equal(persisted.status, 'pending_confirmation');
      assert.equal(persisted.sentAt, null);
    });
  } finally {
    await closeNetServer(imapMock.server);
    await closeNetServer(smtpMock.server);
  }
});

test('R3-M3: sendSmtpMail rejects CRLF/angle-bracket envelope injection and strips CRLF from headers', async () => {
  const smtpMock = createMockSmtpServer();
  const smtpPort = await listenNetServer(smtpMock.server);

  try {
    // 1. toEmail with CRLF + second RCPT TO must reject before opening any SMTP connection
    await assert.rejects(
      () =>
        sendSmtpMail(
          {
            smtpHost: '127.0.0.1',
            smtpPort,
            user: 'yo@real.test',
            pass: 'secret123',
            smtpTls: false,
          },
          {
            toEmail: 'a@b.com>\r\nRCPT TO:<evil@b.com',
            toName: 'Victim',
            subject: 'Test',
            body: 'Body',
          }
        ),
      /inválida|permitidos/i
    );
    assert.equal(smtpMock.getConnectionCount(), 0);

    // 2. config.user with CRLF must also reject before opening any SMTP connection
    await assert.rejects(
      () =>
        sendSmtpMail(
          {
            smtpHost: '127.0.0.1',
            smtpPort,
            user: 'yo@real.test>\r\nRCPT TO:<evil@b.com',
            pass: 'secret123',
            smtpTls: false,
          },
          {
            toEmail: 'a@b.com',
            subject: 'Test',
            body: 'Body',
          }
        ),
      /inválida|permitidos/i
    );
    assert.equal(smtpMock.getConnectionCount(), 0);

    // 3. subject and toName with \r\nBcc: must not emit an injected Bcc header line on the wire
    await sendSmtpMail(
      {
        smtpHost: '127.0.0.1',
        smtpPort,
        user: 'yo@real.test',
        pass: 'secret123',
        smtpTls: false,
      },
      {
        toEmail: 'lucia@real.test',
        toName: 'Lucia\r\nBcc: attacker@evil.test',
        subject: 'Hola\r\nBcc: attacker@evil.test\r\nX-Injected: yes',
        body: 'Mensaje limpio',
      }
    );

    const mails = smtpMock.getReceivedMails();
    assert.equal(mails.length, 1);
    const wireData = mails[0]?.data ?? '';
    const headerSection = wireData.split('\r\n\r\n')[0] ?? '';
    const headerLines = headerSection.split('\r\n');
    assert.equal(
      headerLines.some((line) => /^(Bcc|X-Injected):/i.test(line)),
      false,
      `Injected header found in wire headers: ${headerSection}`
    );
  } finally {
    await closeNetServer(smtpMock.server);
  }
});
