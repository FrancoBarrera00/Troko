import crypto from 'node:crypto';
import type {
  EmailDraft,
  EmailDraftStatus,
  EmailMessage,
  IntegrationRecord,
} from '../../../shared/types.ts';
import { HttpError } from '../app.ts';
import type { TrokoDatabase } from '../db/database.ts';
import type { EventBus } from '../eventBus.ts';
import {
  fetchImapInbox,
  sendSmtpMail,
  type ImapSmtpConfig,
} from './mailTransport.ts';

export interface EmailMessageCompat extends EmailMessage {
  senderName: string;
  senderEmail: string;
}

export interface EmailDraftCompat extends EmailDraft {
  recipientName: string;
  recipientEmail: string;
}

export class MailerService {
  private readonly db: TrokoDatabase;
  private readonly eventBus: EventBus;
  private readonly getImapSmtpIntegration?: () => IntegrationRecord | null;

  constructor(
    db: TrokoDatabase,
    eventBus: EventBus,
    getImapSmtpIntegration?: () => IntegrationRecord | null
  ) {
    this.db = db;
    this.eventBus = eventBus;
    this.getImapSmtpIntegration = getImapSmtpIntegration;
  }

  private resolveImapSmtpConfig(): {
    enabled: boolean;
    config: ImapSmtpConfig | null;
  } {
    const integration = this.getImapSmtpIntegration?.() ?? null;
    if (!integration || integration.enabled !== true) {
      return { enabled: false, config: null };
    }
    const raw = integration.config ?? {};
    const str = (key: string): string =>
      typeof raw[key] === 'string' ? raw[key].trim() : '';
    const num = (key: string, fallback: number): number => {
      const val = Number(raw[key]);
      return Number.isFinite(val) && val > 0 ? val : fallback;
    };
    const boolOpt = (key: string): boolean | undefined =>
      typeof raw[key] === 'boolean' ? raw[key] : undefined;

    const host = str('host');
    const imapHost = str('imapHost') || host;
    const smtpHost = str('smtpHost') || host;
    const user = str('user');
    const pass = str('pass');

    return {
      enabled: true,
      config: {
        host: host || undefined,
        imapHost,
        imapPort: num('imapPort', 993),
        smtpHost,
        smtpPort: num('smtpPort', 465),
        user,
        pass,
        imapTls: boolOpt('imapTls'),
        smtpTls: boolOpt('smtpTls'),
        rejectUnauthorized: boolOpt('rejectUnauthorized'),
      },
    };
  }

  isRealMailEnabled(): boolean {
    const { enabled, config } = this.resolveImapSmtpConfig();
    if (!enabled || !config) return false;
    return Boolean(
      (config.imapHost || config.smtpHost || config.host) &&
        config.user &&
        config.pass
    );
  }

  ensureSeeded(): void {
    const row = this.db.db
      .prepare('SELECT COUNT(*) AS cnt FROM email_messages')
      .get() as Record<string, unknown> | undefined;
    const count = Number(row?.['cnt'] ?? 0);
    if (count > 0) return;

    const now = Date.now();
    const stmt = this.db.db.prepare(
      `INSERT INTO email_messages (id, from_name, from_email, subject, snippet, body, unread, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    stmt.run(
      'mail-ana-1',
      'Ana López',
      'ana@equipo.local',
      'Revisión de entrega Q2',
      'Hola, ¿podemos confirmar que recibiste el informe y que la reunión sigue mañana a las 10:00?',
      'Hola equipo,\n\n¿Podemos confirmar que recibiste el informe trimestral y que nuestra reunión de seguimiento sigue mañana a las 10:00?\n\nSaludos,\nAna López',
      1,
      new Date(now - 15 * 60_000).toISOString()
    );
    stmt.run(
      'mail-carlos-2',
      'Carlos Ruiz',
      'carlos@estudio.local',
      'Prototipo de interfaz Dynamic Island',
      'Adjunto las últimas curvas de animación para las 12 emociones de Troko.',
      'Hola,\n\nAdjunto las últimas curvas de animación para las 12 emociones de Troko y los SVG vectoriales.\n\nUn abrazo,\nCarlos',
      1,
      new Date(now - 90 * 60_000).toISOString()
    );
    stmt.run(
      'mail-sofia-3',
      'Sofía Méndez',
      'sofia@nube.local',
      'Resumen semanal de hábitos',
      'Esta semana completaste tu meta de hidratación 5 días seguidos.',
      '¡Buen trabajo! Esta semana completaste tu meta de hidratación 5 días seguidos.',
      0,
      new Date(now - 360 * 60_000).toISOString()
    );
  }

  private mapMessageRow(row: Record<string, unknown>): EmailMessageCompat {
    const fromName = String(row['from_name']);
    const fromEmail = String(row['from_email']);
    return {
      id: String(row['id']),
      fromName,
      fromEmail,
      senderName: fromName,
      senderEmail: fromEmail,
      subject: String(row['subject']),
      snippet: String(row['snippet']),
      body: String(row['body']),
      unread: Number(row['unread']) === 1,
      receivedAt: String(row['received_at']),
    };
  }

  private mapDraftRow(row: Record<string, unknown>): EmailDraftCompat {
    const toName = String(row['to_name']);
    const toEmail = String(row['to_email']);
    return {
      id: String(row['id']),
      sourceMessageId:
        row['source_message_id'] != null ? String(row['source_message_id']) : null,
      toName,
      toEmail,
      recipientName: toName,
      recipientEmail: toEmail,
      subject: String(row['subject']),
      body: String(row['body']),
      status: String(row['status']) as EmailDraftStatus,
      createdAt: String(row['created_at']),
      sentAt: row['sent_at'] != null ? String(row['sent_at']) : null,
    };
  }

  getInbox(): {
    ok: true;
    messages: EmailMessageCompat[];
    drafts: EmailDraftCompat[];
    unreadCount: number;
  } {
    this.ensureSeeded();
    const msgRows = this.db.db
      .prepare('SELECT * FROM email_messages ORDER BY received_at DESC')
      .all() as Array<Record<string, unknown>>;
    const draftRows = this.db.db
      .prepare('SELECT * FROM email_drafts ORDER BY created_at DESC')
      .all() as Array<Record<string, unknown>>;

    const messages = msgRows.map((r) => this.mapMessageRow(r));
    const drafts = draftRows.map((r) => this.mapDraftRow(r));
    const unreadCount = messages.filter((m) => m.unread).length;

    return {
      ok: true,
      messages,
      drafts,
      unreadCount,
    };
  }

  async syncInbox(): Promise<{
    ok: true;
    messages: EmailMessageCompat[];
    drafts: EmailDraftCompat[];
    unreadCount: number;
  }> {
    const { enabled, config } = this.resolveImapSmtpConfig();
    if (!enabled || !config) {
      return this.getInbox();
    }

    const imapHost = config.imapHost?.trim() || config.host?.trim() || '';
    if (!imapHost || !config.user || !config.pass) {
      throw new HttpError(
        400,
        'Configuración IMAP incompleta (imapHost, user y pass requeridos)'
      );
    }

    let fetched;
    try {
      fetched = await fetchImapInbox(config, 15);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HttpError(502, `Error al sincronizar IMAP: ${msg}`);
    }

    const existsStmt = this.db.db.prepare(
      'SELECT id FROM email_messages WHERE id = ?'
    );
    const updateStmt = this.db.db.prepare(
      `UPDATE email_messages
       SET from_name = ?, from_email = ?, subject = ?, snippet = ?, body = ?, received_at = ?
       WHERE id = ?`
    );
    const insertStmt = this.db.db.prepare(
      `INSERT INTO email_messages (id, from_name, from_email, subject, snippet, body, unread, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const msg of fetched) {
      const existing = existsStmt.get(msg.id) as Record<string, unknown> | undefined;
      if (existing) {
        updateStmt.run(
          msg.fromName,
          msg.fromEmail,
          msg.subject,
          msg.snippet,
          msg.body,
          msg.receivedAt,
          msg.id
        );
      } else {
        insertStmt.run(
          msg.id,
          msg.fromName,
          msg.fromEmail,
          msg.subject,
          msg.snippet,
          msg.body,
          msg.unread ? 1 : 0,
          msg.receivedAt
        );
      }
    }

    const inbox = this.getInbox();
    this.eventBus.publish('mail.unread', { unreadCount: inbox.unreadCount });
    this.eventBus.publish('data.updated', { scope: 'mail' });
    return inbox;
  }

  findMessageBySenderHint(hint: string): EmailMessageCompat | null {
    this.ensureSeeded();
    const lower = hint.trim().toLowerCase();
    const messages = this.getInbox().messages;
    return (
      messages.find(
        (m) =>
          m.fromName.toLowerCase().includes(lower) ||
          m.fromEmail.toLowerCase().includes(lower)
      ) ??
      messages[0] ??
      null
    );
  }

  getDraftOrThrow(id: string): EmailDraftCompat {
    const row = this.db.db.prepare('SELECT * FROM email_drafts WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      throw new HttpError(404, 'Borrador no encontrado');
    }
    return this.mapDraftRow(row);
  }

  createDraft(input: {
    sourceMessageId: string | null;
    toName: string;
    toEmail: string;
    subject: string;
    body: string;
  }): EmailDraftCompat {
    this.ensureSeeded();
    let sourceMsg: EmailMessageCompat | null = null;
    if (input.sourceMessageId) {
      const row = this.db.db
        .prepare('SELECT * FROM email_messages WHERE id = ?')
        .get(input.sourceMessageId) as Record<string, unknown> | undefined;
      if (row) {
        sourceMsg = this.mapMessageRow(row);
      }
    }

    const toName = input.toName.trim() || sourceMsg?.fromName || 'Ana López';
    const toEmail = input.toEmail.trim() || sourceMsg?.fromEmail || 'ana@equipo.local';
    const subject =
      input.subject.trim() ||
      (sourceMsg ? `Re: ${sourceMsg.subject}` : 'Respuesta rápida');

    const id = `drf-${crypto.randomUUID()}`;
    const nowIso = new Date().toISOString();

    this.db.db
      .prepare(
        `INSERT INTO email_drafts (
           id, source_message_id, to_name, to_email, subject, body,
           status, created_at, sent_at
         ) VALUES (?, ?, ?, ?, ?, ?, 'pending_confirmation', ?, NULL)`
      )
      .run(
        id,
        input.sourceMessageId,
        toName,
        toEmail,
        subject,
        input.body,
        nowIso
      );

    const draft = this.getDraftOrThrow(id);

    this.eventBus.setIslandState({
      state: 'attentive',
      mood: 'escucha',
      statusText: 'Atento',
      peekCard: {
        kind: 'email_draft',
        draftId: draft.id,
        toName: draft.toName,
        toEmail: draft.toEmail,
        subject: draft.subject,
        body: draft.body,
      },
    });
    this.eventBus.publish('data.updated', { scope: 'mail', draftId: id });

    return draft;
  }

  updateDraft(
    id: string,
    patch: {
      subject?: string;
      body?: string;
      toName?: string;
      toEmail?: string;
    }
  ): EmailDraftCompat {
    const existing = this.getDraftOrThrow(id);
    const nextSubject =
      typeof patch.subject === 'string' && patch.subject.trim().length > 0
        ? patch.subject.trim()
        : existing.subject;
    const nextBody =
      typeof patch.body === 'string' && patch.body.trim().length > 0
        ? patch.body.trim()
        : existing.body;
    const nextToName =
      typeof patch.toName === 'string' && patch.toName.trim().length > 0
        ? patch.toName.trim()
        : existing.toName;
    const nextToEmail =
      typeof patch.toEmail === 'string' && patch.toEmail.trim().length > 0
        ? patch.toEmail.trim()
        : existing.toEmail;

    this.db.db
      .prepare(
        `UPDATE email_drafts
         SET subject = ?, body = ?, to_name = ?, to_email = ?
         WHERE id = ?`
      )
      .run(nextSubject, nextBody, nextToName, nextToEmail, id);

    const updated = this.getDraftOrThrow(id);
    const currentIsland = this.eventBus.getIslandState();
    if (
      currentIsland.peekCard?.kind === 'email_draft' &&
      currentIsland.peekCard.draftId === id
    ) {
      this.eventBus.setIslandState({
        ...currentIsland,
        peekCard: {
          kind: 'email_draft',
          draftId: updated.id,
          toName: updated.toName,
          toEmail: updated.toEmail,
          subject: updated.subject,
          body: updated.body,
        },
      });
    }
    this.eventBus.publish('data.updated', { scope: 'mail', draftId: id });
    return updated;
  }

  async sendDraft(id: string): Promise<EmailDraftCompat> {
    const existing = this.getDraftOrThrow(id);
    const { enabled, config } = this.resolveImapSmtpConfig();

    if (enabled && config) {
      const smtpHost = config.smtpHost?.trim() || config.host?.trim() || '';
      if (!smtpHost || !config.user || !config.pass) {
        throw new HttpError(
          400,
          'Configuración SMTP incompleta (smtpHost, user y pass requeridos)'
        );
      }
      try {
        await sendSmtpMail(config, {
          toEmail: existing.toEmail,
          toName: existing.toName,
          subject: existing.subject,
          body: existing.body,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new HttpError(502, `Error al enviar correo SMTP: ${msg}`);
      }
    }

    const nowIso = new Date().toISOString();

    this.db.db
      .prepare("UPDATE email_drafts SET status = 'sent', sent_at = ? WHERE id = ?")
      .run(nowIso, id);

    if (existing.sourceMessageId) {
      this.db.db
        .prepare('UPDATE email_messages SET unread = 0 WHERE id = ?')
        .run(existing.sourceMessageId);
    }

    const updated = this.getDraftOrThrow(id);
    this.eventBus.setIslandState({
      state: 'success',
      mood: 'contento',
      statusText: 'Listo',
      badgeWord: 'Enviado',
      peekCard: null,
    });
    this.eventBus.publish('data.updated', { scope: 'mail', draftId: id });
    return updated;
  }

  discardDraft(id: string): EmailDraftCompat {
    this.getDraftOrThrow(id);
    this.db.db
      .prepare("UPDATE email_drafts SET status = 'discarded' WHERE id = ?")
      .run(id);

    const updated = this.getDraftOrThrow(id);
    this.eventBus.setIslandState({
      state: 'idle',
      mood: 'contento',
      statusText: 'Reposo',
      peekCard: null,
    });
    this.eventBus.publish('data.updated', { scope: 'mail', draftId: id });
    return updated;
  }
}
