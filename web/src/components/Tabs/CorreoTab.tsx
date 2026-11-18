import { Edit3, Mail, RefreshCw, Reply, Send, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  EmailDraft,
  EmailMessage,
  SummarySnapshot,
} from '../../../../shared/types.ts';
import { apiClient } from '../../api/client.ts';

export interface CorreoTabProps {
  summary: SummarySnapshot | null;
  messages: EmailMessage[];
  drafts: EmailDraft[];
  onRefreshAll: () => Promise<void>;
}

export function CorreoTab({
  messages,
  drafts,
  onRefreshAll,
}: CorreoTabProps) {
  const [replyTarget, setReplyTarget] = useState<EmailMessage | null>(null);
  const [newBody, setNewBody] = useState('');
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [mailError, setMailError] = useState<string | null>(null);
  const [edits, setEdits] = useState<
    Record<string, { subject: string; body: string }>
  >({});

  useEffect(() => {
    void apiClient.getInbox().then(() => onRefreshAll());
  }, []);

  useEffect(() => {
    setEdits((prev) => {
      const next: Record<string, { subject: string; body: string }> = {};
      for (const d of drafts) {
        next[d.id] = prev[d.id] ?? { subject: d.subject, body: d.body };
      }
      return next;
    });
  }, [drafts]);

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newBody.trim();
    if (!trimmed) return;
    const target = replyTarget ?? messages[0] ?? null;
    await apiClient.createEmailDraft({
      sourceMessageId: target?.id ?? null,
      toName: target?.fromName ?? 'Ana López',
      toEmail: target?.fromEmail ?? 'ana@equipo.local',
      subject: target ? `Re: ${target.subject}` : 'Respuesta rápida',
      body: trimmed,
    });
    setNewBody('');
    setReplyTarget(null);
    await onRefreshAll();
  };

  const handleSaveDraft = async (draft: EmailDraft) => {
    const edit = edits[draft.id];
    if (!edit) return;
    await apiClient.updateEmailDraft(draft.id, {
      subject: edit.subject,
      body: edit.body,
    });
    setEditingDraftId(null);
    await onRefreshAll();
  };

  const handleSync = async () => {
    setSyncing(true);
    setMailError(null);
    try {
      await apiClient.syncInbox();
      await onRefreshAll();
    } catch (err) {
      setMailError(
        err instanceof Error ? err.message : 'Error al sincronizar el correo'
      );
    } finally {
      setSyncing(false);
    }
  };

  const handleSendDraft = async (draft: EmailDraft) => {
    setMailError(null);
    try {
      const edit = edits[draft.id];
      if (edit && (edit.subject !== draft.subject || edit.body !== draft.body)) {
        await apiClient.updateEmailDraft(draft.id, {
          subject: edit.subject,
          body: edit.body,
        });
      }
      await apiClient.sendEmailDraft(draft.id);
      setEditingDraftId(null);
      await onRefreshAll();
    } catch (err) {
      setMailError(
        err instanceof Error ? err.message : 'Error al enviar el borrador'
      );
    }
  };

  const handleDiscardDraft = async (id: string) => {
    setMailError(null);
    await apiClient.discardEmailDraft(id);
    setEditingDraftId(null);
    await onRefreshAll();
  };

  const unreadCount = messages.filter((m) => m.unread).length;

  return (
    <section
      className="view"
      data-testid="view-correo"
      style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
    >
      <header className="vhead">
        <div>
          <span className="eyebrow">Confirmación explícita obligatoria</span>
          <h2>Bandeja de Correo y Borradores</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            data-testid="sync-inbox-btn"
            className="btn-ghost"
            disabled={syncing}
            style={{ padding: '4px 10px', fontSize: '11px' }}
            onClick={() => void handleSync()}
          >
            <RefreshCw size={12} />
            <span>{syncing ? 'Sincronizando...' : 'Sincronizar'}</span>
          </button>
          <span className="sub mono" data-testid="mail-unread-badge">
            No leídos: {unreadCount}
          </span>
        </div>
      </header>

      {mailError && (
        <div
          data-testid="mail-error-banner"
          style={{
            background: 'rgba(255, 90, 95, 0.14)',
            color: '#FF5A5F',
            padding: '8px 12px',
            borderRadius: '10px',
            fontSize: '12px',
          }}
        >
          {mailError}
        </div>
      )}

      {/* Inbox Messages List */}
      <div
        data-testid="inbox-list"
        style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
      >
        {messages.map((msg) => (
          <article
            key={msg.id}
            className="card"
            data-testid="mail-message-item"
            data-message-id={msg.id}
            data-unread={String(msg.unread)}
            onClick={() => setReplyTarget(msg)}
            style={{
              cursor: 'pointer',
              border:
                replyTarget?.id === msg.id
                  ? '1px solid rgba(182, 242, 58, 0.45)'
                  : undefined,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Mail
                  size={14}
                  color={msg.unread ? '#B6F23A' : '#8E8E93'}
                />
                <strong style={{ fontSize: '13px' }}>{msg.fromName}</strong>
                <span className="sub" style={{ fontSize: '11px' }}>
                  &lt;{msg.fromEmail}&gt;
                </span>
              </div>
              <button
                type="button"
                data-testid="reply-email-btn"
                className="btn-ghost"
                style={{ padding: '4px 8px', fontSize: '11px' }}
                onClick={(e) => {
                  e.stopPropagation();
                  setReplyTarget(msg);
                }}
              >
                <Reply size={12} />
                <span>Seleccionar</span>
              </button>
            </div>
            <div style={{ fontWeight: 600, fontSize: '13px', marginTop: '4px' }}>
              {msg.subject}
            </div>
            <p className="sub" style={{ margin: '4px 0 0', fontSize: '12px' }}>
              {msg.snippet}
            </p>
          </article>
        ))}
      </div>

      {/* Quick Draft Composer (hidden while editing an existing draft so the draft textarea is the last input) */}
      {!editingDraftId && (
        <form
          onSubmit={handleCreateDraft}
          data-testid="create-draft-form"
          className="card"
          style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
        >
          <input
            type="text"
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder={
              replyTarget
                ? `Responder a ${replyTarget.fromName}...`
                : 'Responder o escribe tu respuesta en borrador...'
            }
            aria-label="Responder o escribir borrador"
            data-testid="draft-body-input"
            className="input"
            style={{ flex: 1 }}
          />
          <button
            type="submit"
            disabled={!newBody.trim()}
            data-testid="create-draft-btn"
            className="btn-lime"
          >
            Crear borrador
          </button>
        </form>
      )}

      {/* Drafts Section */}
      {drafts.length > 0 && (
        <div
          data-testid="drafts-list"
          style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          {drafts.map((draft) => {
            const edit = edits[draft.id] ?? {
              subject: draft.subject,
              body: draft.body,
            };
            const isPending = draft.status === 'pending_confirmation';

            return (
              <article
                key={draft.id}
                className="card"
                data-testid="mail-draft-item"
                data-draft-id={draft.id}
                data-status={draft.status}
                style={{
                  border: isPending
                    ? '1px solid rgba(182, 242, 58, 0.4)'
                    : '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px',
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: '13px' }}>
                    Para: {draft.toName} ({draft.toEmail})
                  </span>
                  <span
                    className="mono"
                    data-testid="draft-status-badge"
                    style={{
                      fontSize: '11px',
                      color:
                        draft.status === 'sent'
                          ? '#2ECC71'
                          : draft.status === 'discarded'
                          ? '#FF5A5F'
                          : '#F5A623',
                    }}
                  >
                    {draft.status === 'sent'
                      ? 'Enviado'
                      : draft.status === 'discarded'
                      ? 'Descartado'
                      : 'Pendiente de confirmación'}
                  </span>
                </div>

                <div style={{ fontWeight: 600, fontSize: '12px' }}>
                  {edit.subject}
                </div>
                <p style={{ margin: '4px 0 8px', fontSize: '12px', color: '#F2EBD9' }}>
                  {edit.body}
                </p>

                {isPending && (
                  <>
                    <textarea
                      value={edit.body}
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [draft.id]: { ...edit, body: e.target.value },
                        }))
                      }
                      aria-label="Cuerpo del borrador"
                      data-testid="draft-body-edit"
                      className="input"
                      rows={2}
                      style={{ width: '100%', marginBottom: '8px', resize: 'vertical' }}
                    />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      <button
                        type="button"
                        data-testid="send-draft-btn"
                        className="btn-lime"
                        onClick={() => void handleSendDraft(draft)}
                      >
                        <Send size={13} />
                        <span>Enviar</span>
                      </button>
                      <button
                        type="button"
                        data-testid="edit-draft-btn"
                        className="btn-ghost"
                        onClick={() => setEditingDraftId(draft.id)}
                      >
                        <Edit3 size={13} />
                        <span>Editar</span>
                      </button>
                      <button
                        type="button"
                        data-testid="save-draft-btn"
                        className="btn-ghost"
                        onClick={() => void handleSaveDraft(draft)}
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        data-testid="discard-draft-btn"
                        className="btn-ghost"
                        onClick={() => void handleDiscardDraft(draft.id)}
                      >
                        <Trash2 size={13} />
                        <span>Descartar</span>
                      </button>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
