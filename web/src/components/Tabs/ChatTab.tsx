import { Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { apiClient, type ChatMessageItem } from '../../api/client.ts';

export interface ChatTabProps {
  messages: ChatMessageItem[];
  onSendCommand: (text: string, inputMode?: 'text' | 'voice') => Promise<void>;
  onRefreshAll: () => Promise<void>;
}

const TOOL_LABELS: Record<string, string> = {
  create_task: 'Tarea anotada',
  start_focus: 'Sesión de enfoque iniciada',
  create_timer: 'Temporizador iniciado',
  email_draft: 'Borrador de correo creado',
  desktop_preview: 'Vista previa de escritorio',
  launch_app: 'Aplicación abierta',
  app_blocked: 'Acción bloqueada por seguridad',
  sleep: 'Modo descanso activado',
  weather_query: 'Clima consultado',
  web_search: 'Búsqueda web',
  telegram_send: 'Mensaje de Telegram',
};

export function ChatTab({ messages, onSendCommand, onRefreshAll }: ChatTabProps) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setInput('');
    try {
      await onSendCommand(trimmed, 'text');
    } finally {
      setSending(false);
    }
  };

  const handleClear = async () => {
    await apiClient.clearChat();
    await onRefreshAll();
  };

  return (
    <section
      className="view"
      data-testid="view-chat"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '10px' }}
    >
      <header className="vhead">
        <div>
          <span className="eyebrow">Memoria local persistente</span>
          <h2>Chat con Troko</h2>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            className="btn-ghost"
            data-testid="chat-clear-btn"
            onClick={() => void handleClear()}
          >
            <Trash2 size={13} />
            <span>Limpiar</span>
          </button>
        )}
      </header>

      <div
        data-testid="chat-messages"
        style={{
          flex: 1,
          minHeight: '190px',
          maxHeight: '250px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          paddingRight: '4px',
        }}
      >
        {messages.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '18px' }}>
            <p style={{ margin: 0, fontWeight: 600 }}>
              ¡Hola! Soy Troko, tu compañero en la Dynamic Island.
            </p>
            <p className="sub" style={{ marginTop: '4px' }}>
              Pídeme anotar una tarea, iniciar enfoque, redactar un correo o simplemente conversar.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            const toolType =
              msg.toolAction && typeof msg.toolAction['type'] === 'string'
                ? msg.toolAction['type']
                : null;
            return (
              <div
                key={msg.id}
                data-testid={isUser ? 'chat-msg-user' : 'chat-msg-assistant'}
                data-role={msg.role}
                data-emotion={msg.emotion ?? ''}
                data-tool={toolType ?? ''}
                style={{
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '86%',
                  background: isUser ? 'rgba(182, 242, 58, 0.14)' : '#1B1B1F',
                  border: isUser
                    ? '1px solid rgba(182, 242, 58, 0.35)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '14px',
                  padding: '9px 12px',
                  fontSize: '13px',
                  lineHeight: 1.45,
                }}
              >
                <div>{msg.content}</div>
                {toolType && (
                  <div
                    data-testid="chat-tool-badge"
                    style={{
                      marginTop: '6px',
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      fontSize: '11px',
                      fontWeight: 600,
                      background:
                        toolType === 'app_blocked'
                          ? 'rgba(255, 90, 95, 0.18)'
                          : 'rgba(182, 242, 58, 0.16)',
                      color: toolType === 'app_blocked' ? '#FF5A5F' : '#B6F23A',
                    }}
                  >
                    {TOOL_LABELS[toolType] ?? toolType}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        data-testid="chat-form"
        style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe o habla con Troko..."
          aria-label="Escribe o habla con Troko"
          data-testid="chat-input"
          className="input"
          style={{ flex: 1 }}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          data-testid="chat-send-btn"
          className="btn-lime"
        >
          <Send size={14} />
          <span>Enviar</span>
        </button>
      </form>
    </section>
  );
}
