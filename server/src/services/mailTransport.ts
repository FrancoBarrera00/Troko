import crypto from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';

export interface ImapSmtpConfig {
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
  host?: string;
  user: string;
  pass: string;
  imapTls?: boolean;
  smtpTls?: boolean;
  rejectUnauthorized?: boolean;
}

export interface FetchedEmailMessage {
  id: string;
  messageId: string | null;
  fromName: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  body: string;
  unread: boolean;
  receivedAt: string;
}

export interface SendMailInput {
  toEmail: string;
  toName?: string;
  subject: string;
  body: string;
}

export interface VerifyConnectionResult {
  ok: boolean;
  imapOk: boolean;
  smtpOk: boolean;
  details: string;
}

const SOCKET_TIMEOUT_MS = 10_000;

type AnySocket = net.Socket | tls.TLSSocket;

function resolveImapHost(config: ImapSmtpConfig): string {
  return (config.imapHost?.trim() || config.host?.trim() || '');
}

function resolveSmtpHost(config: ImapSmtpConfig): string {
  return (config.smtpHost?.trim() || config.host?.trim() || '');
}

function resolveImapPort(config: ImapSmtpConfig): number {
  const port = Number(config.imapPort);
  return Number.isFinite(port) && port > 0 ? port : 993;
}

function resolveSmtpPort(config: ImapSmtpConfig): number {
  const port = Number(config.smtpPort);
  return Number.isFinite(port) && port > 0 ? port : 465;
}

function shouldUseImapTls(config: ImapSmtpConfig, port: number): boolean {
  if (typeof config.imapTls === 'boolean') return config.imapTls;
  return port === 993;
}

function shouldUseSmtpTls(config: ImapSmtpConfig, port: number): boolean {
  if (typeof config.smtpTls === 'boolean') return config.smtpTls;
  return port === 465;
}

function connectSocket(
  host: string,
  port: number,
  useTls: boolean,
  rejectUnauthorized = true
): Promise<AnySocket> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const onTimeout = () => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error(`Timeout conectando a ${host}:${port} (${SOCKET_TIMEOUT_MS}ms)`));
    };

    const socket: AnySocket = useTls
      ? tls.connect({
          host,
          port,
          servername: host,
          rejectUnauthorized,
        })
      : net.connect({ host, port });

    socket.setTimeout(SOCKET_TIMEOUT_MS, onTimeout);

    const onError = (err: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(err);
    };

    const readyEvent = useTls ? 'secureConnect' : 'connect';
    socket.once('error', onError);
    socket.once(readyEvent, () => {
      if (settled) return;
      settled = true;
      socket.off('error', onError);
      resolve(socket);
    });
  });
}

function upgradeToTls(
  plainSocket: net.Socket,
  host: string,
  rejectUnauthorized = true
): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const tlsSocket = tls.connect({
      socket: plainSocket,
      servername: host,
      rejectUnauthorized,
    });

    const onTimeout = () => {
      if (settled) return;
      settled = true;
      tlsSocket.destroy();
      reject(new Error(`Timeout en STARTTLS con ${host}`));
    };

    tlsSocket.setTimeout(SOCKET_TIMEOUT_MS, onTimeout);

    const onError = (err: Error) => {
      if (settled) return;
      settled = true;
      tlsSocket.destroy();
      reject(err);
    };

    tlsSocket.once('error', onError);
    tlsSocket.once('secureConnect', () => {
      if (settled) return;
      settled = true;
      tlsSocket.off('error', onError);
      resolve(tlsSocket);
    });
  });
}

function decodeRfc2047(input: string): string {
  return input.replace(
    /=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi,
    (_full, _charset: string, encoding: string, text: string) => {
      try {
        if (encoding.toUpperCase() === 'B') {
          return Buffer.from(text, 'base64').toString('utf8');
        }
        const qp = text
          .replace(/_/g, ' ')
          .replace(/=([0-9A-Fa-f]{2})/g, (_m, hex: string) =>
            String.fromCharCode(parseInt(hex, 16))
          );
        return Buffer.from(qp, 'latin1').toString('utf8');
      } catch {
        return text;
      }
    }
  );
}

function parseAddress(rawFrom: string): { name: string; email: string } {
  const decoded = decodeRfc2047(rawFrom).trim();
  const angleMatch = /^(.*?)\s*<([^>]+)>$/.exec(decoded);
  if (angleMatch) {
    const rawName = (angleMatch[1] ?? '').trim().replace(/^"|"$/g, '');
    const email = (angleMatch[2] ?? '').trim();
    return {
      name: rawName || email.split('@')[0] || email,
      email,
    };
  }
  const emailOnly = decoded.replace(/^<|>$/g, '').trim();
  return {
    name: emailOnly.split('@')[0] || emailOnly || 'Desconocido',
    email: emailOnly || 'desconocido@local',
  };
}

function parseHeadersBlock(rawHeaders: string): Record<string, string> {
  const unfolded = rawHeaders.replace(/\r?\n[ \t]+/g, ' ');
  const headers: Record<string, string> = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    headers[key] = decodeRfc2047(val);
  }
  return headers;
}

function cleanBodyText(rawBody: string): string {
  let text = rawBody.replace(/\r\n/g, '\n').trim();
  // Strip simple HTML tags if body looks like HTML
  if (/<html|<body|<div|<p>/i.test(text)) {
    text = text
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  return text;
}

function escapeImapString(val: string): string {
  return `"${val.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

class ImapClient {
  private socket: AnySocket;
  private buffer: Buffer = Buffer.alloc(0);
  private tagCounter = 0;
  private closed = false;
  private waiters: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
  }> = [];

  constructor(socket: AnySocket) {
    this.socket = socket;
    socket.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.notifyWaiters();
    });
    socket.on('error', (err: Error) => {
      this.closed = true;
      this.rejectAll(err);
    });
    socket.on('close', () => {
      this.closed = true;
      this.rejectAll(new Error('Conexión IMAP cerrada inesperadamente'));
    });
    socket.setTimeout(SOCKET_TIMEOUT_MS, () => {
      this.closed = true;
      socket.destroy();
      this.rejectAll(new Error('Timeout esperando respuesta IMAP'));
    });
  }

  private notifyWaiters(): void {
    const current = this.waiters.splice(0);
    for (const w of current) {
      w.resolve();
    }
  }

  private rejectAll(err: Error): void {
    const current = this.waiters.splice(0);
    for (const w of current) {
      w.reject(err);
    }
  }

  private waitForData(): Promise<void> {
    if (this.closed) {
      return Promise.reject(new Error('Conexión IMAP cerrada'));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.indexOf(entry);
        if (idx >= 0) this.waiters.splice(idx, 1);
        this.socket.destroy();
        reject(new Error(`Timeout esperando respuesta IMAP (${SOCKET_TIMEOUT_MS}ms)`));
      }, SOCKET_TIMEOUT_MS);

      const entry = {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          reject(err);
        },
      };
      this.waiters.push(entry);
    });
  }

  private async readLine(): Promise<string> {
    while (true) {
      const lfIdx = this.buffer.indexOf(0x0a); // '\n'
      if (lfIdx !== -1) {
        const lineBuf = this.buffer.subarray(0, lfIdx + 1);
        this.buffer = this.buffer.subarray(lfIdx + 1);
        return lineBuf.toString('utf8').replace(/\r?\n$/, '');
      }
      await this.waitForData();
    }
  }

  private async readExactBytes(count: number): Promise<Buffer> {
    while (this.buffer.length < count) {
      await this.waitForData();
    }
    const slice = this.buffer.subarray(0, count);
    this.buffer = this.buffer.subarray(count);
    return slice;
  }

  async readGreeting(): Promise<string> {
    const line = await this.readLine();
    if (!line.startsWith('* OK') && !line.startsWith('* PREAUTH')) {
      throw new Error(`Saludo IMAP inesperado: ${line}`);
    }
    return line;
  }

  async command(cmd: string): Promise<{
    statusLine: string;
    untagged: Array<{ header: string; literals: string[] }>;
  }> {
    this.tagCounter += 1;
    const tag = `A${String(this.tagCounter).padStart(3, '0')}`;
    const payload = `${tag} ${cmd}\r\n`;
    await new Promise<void>((resolve, reject) => {
      this.socket.write(payload, 'utf8', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const untagged: Array<{ header: string; literals: string[] }> = [];

    while (true) {
      let line = await this.readLine();
      if (line.startsWith(`${tag} `)) {
        const rest = line.slice(tag.length + 1);
        if (!rest.toUpperCase().startsWith('OK')) {
          throw new Error(`Error IMAP (${cmd.split(' ')[0]}): ${line}`);
        }
        return { statusLine: line, untagged };
      }

      const literals: string[] = [];
      let fullHeader = line;
      while (true) {
        const litMatch = /\{(\d+)\}$/.exec(line);
        if (!litMatch) break;
        const size = Number(litMatch[1]);
        const litBuf = await this.readExactBytes(size);
        literals.push(litBuf.toString('utf8'));
        line = await this.readLine();
        fullHeader += '\n' + line;
      }

      untagged.push({ header: fullHeader, literals });
    }
  }

  destroy(): void {
    this.closed = true;
    this.socket.destroy();
  }
}

function parseFetchSections(item: {
  header: string;
  literals: string[];
}): {
  flags: string;
  headerFields: string;
  bodyText: string;
  rfc822: string;
} {
  let flags = '';
  const flagsMatch = /FLAGS\s*\(([^)]*)\)/i.exec(item.header);
  if (flagsMatch) {
    flags = flagsMatch[1] ?? '';
  }

  let headerFields = '';
  let bodyText = '';
  let rfc822 = '';

  const lines = item.header.split('\n');
  let litIdx = 0;
  for (const line of lines) {
    if (!/\{\d+\}$/.test(line)) continue;
    const lit = item.literals[litIdx] ?? '';
    litIdx += 1;
    if (/BODY\[HEADER\.FIELDS[^\]]*\]/i.test(line)) {
      headerFields = lit;
    } else if (/BODY\[TEXT\]/i.test(line)) {
      bodyText = lit;
    } else if (/RFC822/i.test(line)) {
      rfc822 = lit;
    } else if (!headerFields) {
      headerFields = lit;
    } else if (!bodyText) {
      bodyText = lit;
    }
  }

  return { flags, headerFields, bodyText, rfc822 };
}

export async function fetchImapInbox(
  config: ImapSmtpConfig,
  limit = 15
): Promise<FetchedEmailMessage[]> {
  const host = resolveImapHost(config);
  if (!host || !config.user || !config.pass) {
    throw new Error('Configuración IMAP incompleta (imapHost, user, pass requeridos)');
  }
  const port = resolveImapPort(config);
  const useTls = shouldUseImapTls(config, port);
  const socket = await connectSocket(host, port, useTls, config.rejectUnauthorized ?? true);
  const client = new ImapClient(socket);

  try {
    await client.readGreeting();
    await client.command(
      `LOGIN ${escapeImapString(config.user)} ${escapeImapString(config.pass)}`
    );
    await client.command('SELECT INBOX');
    const searchRes = await client.command('SEARCH ALL');

    const seqNums: number[] = [];
    for (const u of searchRes.untagged) {
      const m = /^\*\s+SEARCH\s*(.*)$/i.exec(u.header);
      if (m && m[1]) {
        for (const tok of m[1].trim().split(/\s+/)) {
          const num = Number(tok);
          if (Number.isInteger(num) && num > 0) seqNums.push(num);
        }
      }
    }

    if (seqNums.length === 0) {
      await client.command('LOGOUT').catch(() => undefined);
      return [];
    }

    const latestSeqs = seqNums.slice(-limit).reverse();
    const seqSet = latestSeqs.join(',');
    const fetchRes = await client.command(
      `FETCH ${seqSet} (FLAGS BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID)] BODY.PEEK[TEXT])`
    );

    const messages: FetchedEmailMessage[] = [];
    for (const u of fetchRes.untagged) {
      if (!/^\*\s+\d+\s+FETCH\b/i.test(u.header)) continue;
      const parsed = parseFetchSections(u);

      let rawHeaders = parsed.headerFields;
      let rawBody = parsed.bodyText;
      if (!rawHeaders && parsed.rfc822) {
        const splitIdx = parsed.rfc822.search(/\r?\n\r?\n/);
        if (splitIdx >= 0) {
          rawHeaders = parsed.rfc822.slice(0, splitIdx);
          rawBody = parsed.rfc822.slice(splitIdx).replace(/^\r?\n\r?\n/, '');
        } else {
          rawHeaders = parsed.rfc822;
        }
      }

      const headers = parseHeadersBlock(rawHeaders);
      const { name: fromName, email: fromEmail } = parseAddress(
        headers['from'] ?? 'Desconocido <desconocido@local>'
      );
      const subject = headers['subject']?.trim() || '(Sin asunto)';
      const messageId = headers['message-id']?.trim() || null;
      const parsedDate = headers['date'] ? new Date(headers['date']) : new Date();
      const receivedAt = Number.isNaN(parsedDate.getTime())
        ? new Date().toISOString()
        : parsedDate.toISOString();

      const body = cleanBodyText(rawBody) || '(Mensaje sin texto)';
      const snippet = body.replace(/\s+/g, ' ').slice(0, 160);
      const unread = !/\\Seen/i.test(parsed.flags);

      const idSource = messageId ?? `${fromEmail}|${subject}|${receivedAt}`;
      const id = `imap-${crypto.createHash('sha256').update(idSource).digest('hex').slice(0, 16)}`;

      messages.push({
        id,
        messageId,
        fromName,
        fromEmail,
        subject,
        snippet,
        body,
        unread,
        receivedAt,
      });
    }

    await client.command('LOGOUT').catch(() => undefined);
    return messages;
  } finally {
    client.destroy();
  }
}

class SmtpClient {
  private socket: AnySocket;
  private buffer = '';
  private closed = false;
  private waiters: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
  }> = [];

  constructor(socket: AnySocket) {
    this.socket = socket;
    this.attachSocket(socket);
  }

  private attachSocket(socket: AnySocket): void {
    socket.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf8');
      this.notifyWaiters();
    });
    socket.on('error', (err: Error) => {
      this.closed = true;
      this.rejectAll(err);
    });
    socket.on('close', () => {
      this.closed = true;
      this.rejectAll(new Error('Conexión SMTP cerrada inesperadamente'));
    });
    socket.setTimeout(SOCKET_TIMEOUT_MS, () => {
      this.closed = true;
      socket.destroy();
      this.rejectAll(new Error(`Timeout esperando respuesta SMTP (${SOCKET_TIMEOUT_MS}ms)`));
    });
  }

  replaceSocket(nextSocket: AnySocket): void {
    this.socket.removeAllListeners('data');
    this.socket.removeAllListeners('error');
    this.socket.removeAllListeners('close');
    this.socket.removeAllListeners('timeout');
    this.socket = nextSocket;
    this.buffer = '';
    this.attachSocket(nextSocket);
  }

  private notifyWaiters(): void {
    const current = this.waiters.splice(0);
    for (const w of current) w.resolve();
  }

  private rejectAll(err: Error): void {
    const current = this.waiters.splice(0);
    for (const w of current) w.reject(err);
  }

  private waitForData(): Promise<void> {
    if (this.closed) {
      return Promise.reject(new Error('Conexión SMTP cerrada'));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.indexOf(entry);
        if (idx >= 0) this.waiters.splice(idx, 1);
        this.socket.destroy();
        reject(new Error(`Timeout esperando respuesta SMTP (${SOCKET_TIMEOUT_MS}ms)`));
      }, SOCKET_TIMEOUT_MS);

      const entry = {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          reject(err);
        },
      };
      this.waiters.push(entry);
    });
  }

  async readResponse(): Promise<{ code: number; lines: string[]; text: string }> {
    const lines: string[] = [];
    while (true) {
      const lfIdx = this.buffer.indexOf('\n');
      if (lfIdx === -1) {
        await this.waitForData();
        continue;
      }
      const line = this.buffer.slice(0, lfIdx + 1).replace(/\r?\n$/, '');
      this.buffer = this.buffer.slice(lfIdx + 1);
      lines.push(line);

      const match = /^(\d{3})([ -])/.exec(line);
      if (!match) {
        throw new Error(`Respuesta SMTP inválida: ${line}`);
      }
      if (match[2] === ' ') {
        const code = Number(match[1]);
        const text = lines.join('\n');
        if (code >= 400) {
          throw new Error(`Error SMTP ${code}: ${text}`);
        }
        return { code, lines, text };
      }
    }
  }

  async writeRaw(data: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.socket.write(data, 'utf8', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async command(cmd: string): Promise<{ code: number; lines: string[]; text: string }> {
    await this.writeRaw(`${cmd}\r\n`);
    return this.readResponse();
  }

  destroy(): void {
    this.closed = true;
    this.socket.destroy();
  }
}

async function authenticateSmtp(
  client: SmtpClient,
  ehloLines: string[],
  user: string,
  pass: string
): Promise<void> {
  const authLine = ehloLines.find((l) => /AUTH\b/i.test(l)) ?? '';
  const supportsPlain = /\bPLAIN\b/i.test(authLine);
  const supportsLogin = /\bLOGIN\b/i.test(authLine);

  if (supportsPlain && !supportsLogin) {
    const token = Buffer.from(`\0${user}\0${pass}`, 'utf8').toString('base64');
    await client.command(`AUTH PLAIN ${token}`);
    return;
  }

  // Default to AUTH LOGIN
  const authRes = await client.command('AUTH LOGIN');
  if (authRes.code !== 334) {
    throw new Error(`SMTP AUTH LOGIN inesperado (${authRes.code}): ${authRes.text}`);
  }
  const userRes = await client.command(Buffer.from(user, 'utf8').toString('base64'));
  if (userRes.code !== 334) {
    throw new Error(`SMTP AUTH usuario inesperado (${userRes.code}): ${userRes.text}`);
  }
  const passRes = await client.command(Buffer.from(pass, 'utf8').toString('base64'));
  if (passRes.code !== 235) {
    throw new Error(`SMTP AUTH contraseña rechazada (${passRes.code}): ${passRes.text}`);
  }
}

function assertCleanEnvelopeAddress(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || /[\r\n<>\s\x00-\x1f\x7f]/.test(trimmed)) {
    throw new Error(`Dirección ${label} inválida: contiene caracteres no permitidos`);
  }
  return trimmed;
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n\x00-\x1f\x7f]+/g, ' ').trim();
}

export async function sendSmtpMail(
  config: ImapSmtpConfig,
  mail: SendMailInput
): Promise<{ messageId: string }> {
  const host = resolveSmtpHost(config);
  if (!host || !config.user || !config.pass) {
    throw new Error('Configuración SMTP incompleta (smtpHost, user, pass requeridos)');
  }
  const cleanUser = assertCleanEnvelopeAddress(config.user, 'remitente');
  const cleanToEmail = assertCleanEnvelopeAddress(mail.toEmail, 'destinatario');
  const safeSubject = sanitizeHeaderValue(mail.subject);
  const safeToName = mail.toName
    ? sanitizeHeaderValue(mail.toName).replace(/"/g, '')
    : '';

  const port = resolveSmtpPort(config);
  let useTls = shouldUseSmtpTls(config, port);
  let socket = await connectSocket(host, port, useTls, config.rejectUnauthorized ?? true);
  const client = new SmtpClient(socket);

  try {
    await client.readResponse(); // 220 greeting
    let ehlo = await client.command('EHLO localhost');

    if (
      !useTls &&
      config.smtpTls !== false &&
      ehlo.lines.some((l) => /\bSTARTTLS\b/i.test(l))
    ) {
      await client.command('STARTTLS');
      const tlsSocket = await upgradeToTls(
        socket as net.Socket,
        host,
        config.rejectUnauthorized ?? true
      );
      socket = tlsSocket;
      useTls = true;
      client.replaceSocket(tlsSocket);
      ehlo = await client.command('EHLO localhost');
    }

    await authenticateSmtp(client, ehlo.lines, config.user, config.pass);

    await client.command(`MAIL FROM:<${cleanUser}>`);
    await client.command(`RCPT TO:<${cleanToEmail}>`);
    const dataPrompt = await client.command('DATA');
    if (dataPrompt.code !== 354) {
      throw new Error(`SMTP DATA inesperado (${dataPrompt.code}): ${dataPrompt.text}`);
    }

    const messageId = `<${crypto.randomUUID()}@${host}>`;
    const toHeader = safeToName
      ? `"${safeToName}" <${cleanToEmail}>`
      : cleanToEmail;

    const normalizedBody = mail.body
      .replace(/\r?\n/g, '\r\n')
      .split('\r\n')
      .map((line) => (line.startsWith('.') ? `.${line}` : line))
      .join('\r\n');

    const payload = [
      `Message-ID: ${messageId}`,
      `Date: ${new Date().toUTCString()}`,
      `From: ${cleanUser}`,
      `To: ${toHeader}`,
      `Subject: ${safeSubject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      normalizedBody,
      '.',
      '',
    ].join('\r\n');

    await client.writeRaw(payload);
    await client.readResponse(); // 250 queued

    await client.command('QUIT').catch(() => undefined);
    return { messageId };
  } finally {
    client.destroy();
  }
}

export async function verifyImapSmtpConnection(
  config: ImapSmtpConfig
): Promise<VerifyConnectionResult> {
  let imapOk = false;
  let smtpOk = false;
  const messages: string[] = [];

  // Test IMAP
  const imapHost = resolveImapHost(config);
  const imapPort = resolveImapPort(config);
  try {
    if (!imapHost || !config.user || !config.pass) {
      throw new Error('Faltan imapHost, user o pass');
    }
    const useTls = shouldUseImapTls(config, imapPort);
    const socket = await connectSocket(
      imapHost,
      imapPort,
      useTls,
      config.rejectUnauthorized ?? true
    );
    const client = new ImapClient(socket);
    try {
      await client.readGreeting();
      await client.command(
        `LOGIN ${escapeImapString(config.user)} ${escapeImapString(config.pass)}`
      );
      await client.command('NOOP');
      await client.command('LOGOUT').catch(() => undefined);
      imapOk = true;
      messages.push(`IMAP OK (${imapHost}:${imapPort})`);
    } finally {
      client.destroy();
    }
  } catch (err) {
    messages.push(
      `IMAP error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Test SMTP
  const smtpHost = resolveSmtpHost(config);
  const smtpPort = resolveSmtpPort(config);
  try {
    if (!smtpHost || !config.user || !config.pass) {
      throw new Error('Faltan smtpHost, user o pass');
    }
    let useTls = shouldUseSmtpTls(config, smtpPort);
    let socket = await connectSocket(
      smtpHost,
      smtpPort,
      useTls,
      config.rejectUnauthorized ?? true
    );
    const client = new SmtpClient(socket);
    try {
      await client.readResponse();
      let ehlo = await client.command('EHLO localhost');
      if (
        !useTls &&
        config.smtpTls !== false &&
        ehlo.lines.some((l) => /\bSTARTTLS\b/i.test(l))
      ) {
        await client.command('STARTTLS');
        const tlsSocket = await upgradeToTls(
          socket as net.Socket,
          smtpHost,
          config.rejectUnauthorized ?? true
        );
        socket = tlsSocket;
        useTls = true;
        client.replaceSocket(tlsSocket);
        ehlo = await client.command('EHLO localhost');
      }
      await authenticateSmtp(client, ehlo.lines, config.user, config.pass);
      await client.command('QUIT').catch(() => undefined);
      smtpOk = true;
      messages.push(`SMTP OK (${smtpHost}:${smtpPort})`);
    } finally {
      client.destroy();
    }
  } catch (err) {
    messages.push(
      `SMTP error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return {
    ok: imapOk && smtpOk,
    imapOk,
    smtpOk,
    details: messages.join(' · '),
  };
}
