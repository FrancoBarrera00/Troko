import { Crosshair, Download, Key, Plug, Shield, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  AIProviderType,
  AppSettings,
  IntegrationRecord,
  OSPermissionStatus,
  SettingsPatch,
} from '../../../../shared/types.ts';
import { apiClient } from '../../api/client.ts';

export interface AjustesTabProps {
  settings: AppSettings | null;
  integrations: IntegrationRecord[];
  saving: boolean;
  savedAt: number | null;
  error: string | null;
  onUpdateSettings: (patch: SettingsPatch & Record<string, unknown>) => Promise<void>;
  onRefreshAll: () => Promise<void>;
}

const INTEGRATION_LABELS: Record<string, string> = {
  telegram: 'Telegram Bot (Puente opcional)',
  weather: 'Clima Local (Weather)',
  tavily: 'Búsqueda Web (Tavily API)',
  imap_smtp: 'Correo IMAP / SMTP',
};

export function AjustesTab({
  settings,
  integrations,
  saving,
  savedAt,
  error,
  onUpdateSettings,
  onRefreshAll,
}: AjustesTabProps) {
  const [aiProvider, setAiProvider] = useState<AIProviderType>(
    settings?.aiProvider ?? 'local_fallback'
  );
  const [aiEndpoint, setAiEndpoint] = useState(
    settings?.aiEndpoint ?? 'http://127.0.0.1:11434'
  );
  const [aiModel, setAiModel] = useState(settings?.aiModel ?? 'llama3.2:3b');
  const [aiApiKey, setAiApiKey] = useState(settings?.aiApiKey ?? '');
  const [desktopDir, setDesktopDir] = useState(settings?.desktopTargetDir ?? '');
  const [focusMinutes, setFocusMinutes] = useState(settings?.focusMinutes ?? 25);
  const [breakMinutes, setBreakMinutes] = useState(settings?.breakMinutes ?? 5);
  const [privacyStatus, setPrivacyStatus] = useState<string | null>(null);

  const [tgBotToken, setTgBotToken] = useState('');
  const [tgChatId, setTgChatId] = useState('');
  const [weatherCity, setWeatherCity] = useState('');
  const [tavilyKey, setTavilyKey] = useState('');

  useEffect(() => {
    void apiClient.listIntegrations().then(() => onRefreshAll());
  }, []);

  useEffect(() => {
    if (!settings) return;
    setAiProvider(settings.aiProvider);
    setAiEndpoint(settings.aiEndpoint);
    setAiModel(settings.aiModel);
    setAiApiKey(settings.aiApiKey);
    setDesktopDir(settings.desktopTargetDir);
    setFocusMinutes(settings.focusMinutes);
    setBreakMinutes(settings.breakMinutes);
  }, [settings]);

  useEffect(() => {
    const tg = integrations.find((i) => i.type === 'telegram');
    if (tg?.config) {
      if (typeof tg.config['botToken'] === 'string') setTgBotToken(tg.config['botToken']);
      if (typeof tg.config['chatId'] === 'string') setTgChatId(tg.config['chatId']);
    }
    const w = integrations.find((i) => i.type === 'weather');
    if (w?.config && typeof w.config['city'] === 'string') {
      setWeatherCity(w.config['city']);
    }
    const tv = integrations.find((i) => i.type === 'tavily');
    if (tv?.config && typeof tv.config['apiKey'] === 'string') {
      setTavilyKey(tv.config['apiKey']);
    }
  }, [integrations]);

  const handleSaveAi = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateSettings({
      aiProvider,
      aiEndpoint,
      aiModel,
      aiApiKey,
      desktopTargetDir: desktopDir,
    });
    setPrivacyStatus('Configuración de IA guardada.');
  };

  const handleSaveFocus = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateSettings({
      focusMinutes: Math.max(1, Number(focusMinutes) || 25),
      breakMinutes: Math.max(1, Number(breakMinutes) || 5),
    });
    setPrivacyStatus('Ajustes del enfoque guardados.');
  };

  const getDraftConfigForType = (item: IntegrationRecord): Record<string, unknown> => {
    if (item.type === 'telegram') {
      return {
        ...item.config,
        botToken: tgBotToken || (item.config['botToken'] ?? ''),
        chatId: tgChatId || (item.config['chatId'] ?? ''),
      };
    }
    if (item.type === 'weather') {
      return {
        ...item.config,
        city: weatherCity || (item.config['city'] ?? ''),
      };
    }
    if (item.type === 'tavily') {
      return {
        ...item.config,
        apiKey: tavilyKey || (item.config['apiKey'] ?? ''),
      };
    }
    return item.config;
  };

  const handleToggleIntegration = async (item: IntegrationRecord) => {
    await apiClient.patchIntegration(item.type, {
      enabled: !item.enabled,
      config: getDraftConfigForType(item),
    });
    await onRefreshAll();
  };

  const handleSaveIntegration = async (item: IntegrationRecord) => {
    await apiClient.patchIntegration(item.type, {
      enabled: item.enabled,
      config: getDraftConfigForType(item),
    });
    await onRefreshAll();
  };

  const handleExportMemory = async () => {
    const data = await apiClient.exportMemory();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `troko-memory-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setPrivacyStatus('Memoria exportada en formato JSON.');
  };

  const handleWipeMemory = async () => {
    await apiClient.wipeMemory();
    setPrivacyStatus('Toda la memoria local ha sido borrada.');
    await onRefreshAll();
  };

  const perms = settings?.permissions ?? {
    microphone: 'prompt',
    speechRecognition: 'prompt',
    desktopFolder: 'prompt',
    mailAutomation: 'prompt',
  };
  const soundEnabled = settings?.soundEnabled ?? true;

  return (
    <article
      className="view"
      data-testid="view-ajustes"
      style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
    >
      <header className="vhead">
        <div>
          <span className="eyebrow">100 % Local-First · BYOK</span>
          <h2>Ajustes y Privacidad</h2>
        </div>
        <span className="sub mono">
          {saving ? 'Guardando...' : savedAt ? 'Guardado' : 'SQLite WAL'}
        </span>
      </header>

      {(error || privacyStatus) && (
        <div
          data-testid="ajustes-status-banner"
          style={{
            background: error
              ? 'rgba(255, 90, 95, 0.14)'
              : 'rgba(182, 242, 58, 0.14)',
            color: error ? '#FF5A5F' : '#B6F23A',
            padding: '8px 12px',
            borderRadius: '10px',
            fontSize: '12px',
          }}
        >
          {error ?? privacyStatus}
        </div>
      )}

      {/* AI Provider & BYOK Section */}
      <form
        onSubmit={handleSaveAi}
        className="card"
        data-testid="settings-section-ai"
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 600,
            marginBottom: '8px',
          }}
        >
          <Key size={14} color="#B6F23A" />
          <span>Proveedor de IA (Local o BYOK OpenAI-compatible)</span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '8px',
            marginBottom: '8px',
          }}
        >
          <label style={{ fontSize: '11px', color: '#8E8E93' }}>
            Proveedor
            <select
              name="provider"
              value={aiProvider}
              onChange={(e) => setAiProvider(e.target.value as AIProviderType)}
              data-testid="ai-provider-select"
              className="input"
              style={{ width: '100%', marginTop: '3px' }}
            >
              <option value="local_fallback">Motor Local Integrado (Offline)</option>
              <option value="ollama">Ollama (Local)</option>
              <option value="llama_cpp">llama.cpp Server</option>
              <option value="openai_compatible">OpenAI-Compatible (BYOK)</option>
              <option value="openai">OpenAI API</option>
            </select>
          </label>

          <label style={{ fontSize: '11px', color: '#8E8E93' }}>
            Modelo
            <input
              type="text"
              name="model"
              placeholder="llama3.2:3b"
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              data-testid="ai-model-input"
              className="input mono"
              style={{ width: '100%', marginTop: '3px' }}
            />
          </label>

          <label style={{ fontSize: '11px', color: '#8E8E93' }}>
            Endpoint URL
            <input
              type="text"
              name="endpoint"
              placeholder="http://127.0.0.1:11434"
              value={aiEndpoint}
              onChange={(e) => setAiEndpoint(e.target.value)}
              data-testid="ai-endpoint-input"
              className="input mono"
              style={{ width: '100%', marginTop: '3px' }}
            />
          </label>

          <label style={{ fontSize: '11px', color: '#8E8E93' }}>
            API Key (BYOK opcional)
            <input
              type="password"
              name="apiKey"
              value={aiApiKey}
              onChange={(e) => setAiApiKey(e.target.value)}
              placeholder="sk-..."
              data-testid="ai-apikey-input"
              className="input mono"
              style={{ width: '100%', marginTop: '3px' }}
            />
          </label>
        </div>

        <button
          type="submit"
          data-testid="save-ai-settings-btn"
          className="btn-lime"
        >
          Guardar
        </button>
      </form>

      {/* Focus Settings Section */}
      <form
        onSubmit={handleSaveFocus}
        className="card"
        data-testid="settings-section-focus"
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 600,
            marginBottom: '8px',
          }}
        >
          <Crosshair size={14} color="#B6F23A" />
          <span>Ajustes del enfoque</span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '8px',
            marginBottom: '8px',
          }}
        >
          <label style={{ fontSize: '11px', color: '#8E8E93' }}>
            Minutos de enfoque
            <input
              type="number"
              min={1}
              max={180}
              value={focusMinutes}
              onChange={(e) => setFocusMinutes(Number(e.target.value))}
              aria-label="Minutos de enfoque"
              className="input mono"
              style={{ width: '100%', marginTop: '3px' }}
            />
          </label>

          <label style={{ fontSize: '11px', color: '#8E8E93' }}>
            Minutos de descanso
            <input
              type="number"
              min={1}
              max={60}
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(Number(e.target.value))}
              aria-label="Minutos de descanso"
              className="input mono"
              style={{ width: '100%', marginTop: '3px' }}
            />
          </label>
        </div>

        <button type="submit" className="btn-lime">
          Guardar
        </button>
      </form>

      {/* Optional External Integrations */}
      <article className="card" data-testid="integrations-section">
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 600,
            marginBottom: '8px',
          }}
        >
          <Plug size={14} color="#8B5CF6" />
          <span>Puentes externos opcionales (Desactivados por defecto)</span>
        </header>

        <article style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {integrations.map((int) => (
            <div
              key={int.id}
              data-testid={`integration-card-${int.type}`}
              data-enabled={String(int.enabled)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                padding: '8px 10px',
                borderRadius: '10px',
                background: '#151518',
                fontSize: '12px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <strong>{INTEGRATION_LABELS[int.type] ?? int.type}</strong>
                  <span className="sub" style={{ marginLeft: '8px' }}>
                    {int.enabled ? 'Activo' : 'Desactivado'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={int.enabled}
                    aria-label={`Activar ${int.type}`}
                    data-testid={`toggle-integration-${int.type}`}
                    className="switch"
                    onClick={() => void handleToggleIntegration(int)}
                  >
                    <span className="switch__thumb" />
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ padding: '3px 8px', fontSize: '11px' }}
                    onClick={() => void handleSaveIntegration(int)}
                  >
                    Guardar
                  </button>
                </div>
              </div>

              {int.type === 'telegram' && (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    placeholder="Bot Token (ej. 123456:ABC)"
                    value={tgBotToken}
                    onChange={(e) => setTgBotToken(e.target.value)}
                    className="input mono"
                    style={{ flex: 1, fontSize: '11px' }}
                  />
                  <input
                    type="text"
                    placeholder="Chat ID (ej. 987654321)"
                    value={tgChatId}
                    onChange={(e) => setTgChatId(e.target.value)}
                    className="input mono"
                    style={{ flex: 1, fontSize: '11px' }}
                  />
                </div>
              )}

              {int.type === 'weather' && (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    placeholder="Ciudad (ej. Madrid)"
                    value={weatherCity}
                    onChange={(e) => setWeatherCity(e.target.value)}
                    className="input"
                    style={{ flex: 1, fontSize: '11px' }}
                  />
                </div>
              )}

              {int.type === 'tavily' && (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="password"
                    placeholder="Tavily API Key (tvly-...)"
                    value={tavilyKey}
                    onChange={(e) => setTavilyKey(e.target.value)}
                    className="input mono"
                    style={{ flex: 1, fontSize: '11px' }}
                  />
                </div>
              )}
            </div>
          ))}
        </article>
      </article>

      {/* OS Permissions & Local Privacy */}
      <article className="card" data-testid="permissions-section">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
            <Shield size={14} color="#58B2FF" />
            <span>Permisos del sistema y Memoria Local</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
            <span>Sonido y efectos</span>
            <button
              type="button"
              role="switch"
              aria-checked={soundEnabled}
              aria-label="Sonido y efectos"
              data-testid="sound-toggle"
              className="switch"
              onClick={() =>
                void onUpdateSettings({ soundEnabled: !soundEnabled })
              }
            >
              <span className="switch__thumb" />
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '6px',
            marginBottom: '10px',
            fontSize: '11px',
          }}
        >
          {(
            [
              ['microphone', 'Micrófono'],
              ['speechRecognition', 'Reconocimiento de voz'],
              ['desktopFolder', 'Carpeta Escritorio'],
              ['mailAutomation', 'Automatización Correo'],
            ] as const
          ).map(([key, label]) => (
            <div
              key={key}
              data-testid={`perm-row-${key}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#151518',
                padding: '5px 8px',
                borderRadius: '8px',
              }}
            >
              <span>{label}</span>
              <select
                value={perms[key]}
                aria-label={`Permiso ${label}`}
                data-testid={`perm-select-${key}`}
                onChange={(e) =>
                  void onUpdateSettings({
                    permissions: {
                      ...perms,
                      [key]: e.target.value as OSPermissionStatus,
                    },
                  })
                }
                className="input mono"
                style={{ padding: '2px 6px', fontSize: '11px' }}
              >
                <option value="prompt">Preguntar</option>
                <option value="granted">Permitido</option>
                <option value="denied">Denegado</option>
              </select>
            </div>
          ))}
        </div>

        <div
          data-testid="privacy-memory-section"
          style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}
        >
          <button
            type="button"
            data-testid="settings-export-btn"
            className="btn-ghost"
            onClick={() => void handleExportMemory()}
          >
            <Download size={13} />
            <span>Exportar memoria JSON</span>
          </button>

          <button
            type="button"
            data-testid="settings-wipe-btn"
            className="btn-ghost"
            style={{ color: '#FF5A5F', borderColor: 'rgba(255, 90, 95, 0.35)' }}
            onClick={() => void handleWipeMemory()}
          >
            <Trash2 size={13} />
            <span>Borrar memoria</span>
          </button>
        </div>
      </article>
    </article>
  );
}
