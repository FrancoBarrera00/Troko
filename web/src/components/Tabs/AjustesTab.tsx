import { Crosshair, Download, Key, Monitor, Plug, Shield, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  AIProviderType,
  AiConnectionTestResult,
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
  const [detectingOllama, setDetectingOllama] = useState(false);
  const [detectedModels, setDetectedModels] = useState<string[]>([]);
  const [detectedEndpoint, setDetectedEndpoint] = useState<string | null>(null);
  const [detectMessage, setDetectMessage] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] =
    useState<AiConnectionTestResult | null>(null);

  const [tgBotToken, setTgBotToken] = useState('');
  const [tgChatId, setTgChatId] = useState('');
  const [weatherCity, setWeatherCity] = useState('');
  const [tavilyKey, setTavilyKey] = useState('');
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState('993');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('465');
  const [mailUser, setMailUser] = useState('');
  const [mailPass, setMailPass] = useState('');
  const [testingImapSmtp, setTestingImapSmtp] = useState(false);
  const [imapSmtpTestResult, setImapSmtpTestResult] = useState<{
    ok: boolean;
    details: string;
  } | null>(null);
  const [realDesktopDir, setRealDesktopDir] = useState('');
  const [desktopHotkey, setDesktopHotkey] = useState(
    window.trokoElectron?.hotkey ?? 'Alt+Space'
  );
  const [openAtLogin, setOpenAtLogin] = useState(false);

  useEffect(() => {
    void apiClient.listIntegrations().then(() => onRefreshAll());
    void apiClient
      .getSystemStats()
      .then((stats) => {
        if (stats.realDesktopDir) setRealDesktopDir(stats.realDesktopDir);
      })
      .catch(() => {});
    void window.trokoElectron
      ?.getDesktopInfo?.()
      .then((info) => {
        setDesktopHotkey(info.hotkey);
        setOpenAtLogin(info.openAtLogin);
      })
      .catch(() => {});
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
    const mail = integrations.find((i) => i.type === 'imap_smtp');
    if (mail?.config) {
      const legacyHost =
        typeof mail.config['host'] === 'string' ? mail.config['host'] : '';
      if (typeof mail.config['imapHost'] === 'string') {
        setImapHost(mail.config['imapHost']);
      } else if (legacyHost) {
        setImapHost(legacyHost);
      }
      if (mail.config['imapPort'] !== undefined) {
        setImapPort(String(mail.config['imapPort']));
      }
      if (typeof mail.config['smtpHost'] === 'string') {
        setSmtpHost(mail.config['smtpHost']);
      } else if (legacyHost) {
        setSmtpHost(legacyHost);
      }
      if (mail.config['smtpPort'] !== undefined) {
        setSmtpPort(String(mail.config['smtpPort']));
      }
      if (typeof mail.config['user'] === 'string') setMailUser(mail.config['user']);
      if (typeof mail.config['pass'] === 'string') setMailPass(mail.config['pass']);
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

  const handleDetectOllama = async () => {
    setDetectingOllama(true);
    setDetectMessage(null);
    try {
      const targetEndpoint =
        aiProvider === 'ollama' && aiEndpoint.trim().startsWith('http')
          ? aiEndpoint.trim()
          : undefined;
      const res = await apiClient.detectOllama(targetEndpoint);
      if (res.ollamaDetected) {
        setDetectedModels(res.models);
        setDetectedEndpoint(res.endpoint);
        if (res.models.length > 0) {
          setDetectMessage(
            `Ollama detectado en ${res.endpoint} (${res.models.length} modelos).`
          );
          if (!aiModel.trim() && res.models[0]) {
            setAiModel(res.models[0]);
          }
        } else {
          setDetectMessage(
            `Ollama detectado en ${res.endpoint}, pero no tiene modelos descargados.`
          );
        }
      } else {
        setDetectedModels([]);
        setDetectedEndpoint(null);
        setDetectMessage(
          `No se detectó Ollama en ${res.endpoint}${res.error ? ` (${res.error})` : ''}.`
        );
      }
    } catch (err) {
      setDetectedModels([]);
      setDetectedEndpoint(null);
      setDetectMessage(
        err instanceof Error ? err.message : 'Error al detectar Ollama.'
      );
    } finally {
      setDetectingOllama(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionResult(null);
    try {
      const res = await apiClient.testAiConnection({
        aiProvider,
        aiEndpoint,
        aiModel,
        aiApiKey,
      });
      setConnectionResult(res);
    } catch (err) {
      setConnectionResult({
        ok: false,
        provider: aiProvider,
        endpoint: aiEndpoint,
        model: aiModel,
        latencyMs: 0,
        error: err instanceof Error ? err.message : 'Error al probar conexión',
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSaveFocus = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateSettings({
      focusMinutes: Math.max(1, Number(focusMinutes) || 25),
      breakMinutes: Math.max(1, Number(breakMinutes) || 5),
    });
    setPrivacyStatus('Ajustes del enfoque guardados.');
  };

  const handleSaveDesktopDir = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = desktopDir.trim();
    await onUpdateSettings({ desktopTargetDir: cleaned });
    setPrivacyStatus(
      cleaned
        ? `Carpeta de Escritorio actualizada: ${cleaned}`
        : 'Carpeta de Escritorio restablecida al Sandbox seguro.'
    );
    await onRefreshAll();
  };

  const handleUseRealDesktop = async () => {
    const stats = await apiClient.getSystemStats();
    const target = stats.realDesktopDir || realDesktopDir;
    if (!target) return;
    setRealDesktopDir(target);
    setDesktopDir(target);
    await onUpdateSettings({ desktopTargetDir: target });
    setPrivacyStatus(`Usando Escritorio real: ${target}`);
    await onRefreshAll();
  };

  const handleUseSandboxDesktop = async () => {
    setDesktopDir('');
    await onUpdateSettings({ desktopTargetDir: '' });
    setPrivacyStatus('Usando Sandbox seguro para organizar archivos.');
    await onRefreshAll();
  };

  const handleToggleAutoLaunch = async () => {
    if (!window.trokoElectron?.setAutoLaunch) return;
    const next = await window.trokoElectron.setAutoLaunch(!openAtLogin);
    setOpenAtLogin(next);
    setPrivacyStatus(
      next
        ? 'Troko se iniciará automáticamente con el sistema.'
        : 'Inicio automático con el sistema desactivado.'
    );
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
    if (item.type === 'imap_smtp') {
      return {
        ...item.config,
        imapHost: imapHost.trim(),
        imapPort: Number(imapPort) || 993,
        smtpHost: smtpHost.trim(),
        smtpPort: Number(smtpPort) || 465,
        user: mailUser.trim(),
        pass: mailPass,
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

  const handleTestImapSmtp = async (item: IntegrationRecord) => {
    setTestingImapSmtp(true);
    setImapSmtpTestResult(null);
    try {
      const res = await apiClient.testIntegration(
        'imap_smtp',
        getDraftConfigForType(item)
      );
      setImapSmtpTestResult({ ok: res.ok, details: res.details });
    } catch (err) {
      setImapSmtpTestResult({
        ok: false,
        details: err instanceof Error ? err.message : 'Error al probar IMAP/SMTP',
      });
    } finally {
      setTestingImapSmtp(false);
    }
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
              list="ollama-models-list"
              placeholder="llama3.2:3b"
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              data-testid="ai-model-input"
              className="input mono"
              style={{ width: '100%', marginTop: '3px' }}
            />
            <datalist id="ollama-models-list">
              {detectedModels.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
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

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="submit"
            data-testid="save-ai-settings-btn"
            className="btn-lime"
          >
            Guardar
          </button>

          <button
            type="button"
            data-testid="detect-ollama-btn"
            className="btn-ghost"
            disabled={detectingOllama}
            onClick={() => void handleDetectOllama()}
          >
            {detectingOllama ? 'Detectando...' : 'Detectar Ollama'}
          </button>

          <button
            type="button"
            data-testid="test-ai-connection-btn"
            className="btn-ghost"
            disabled={testingConnection}
            onClick={() => void handleTestConnection()}
          >
            {testingConnection ? 'Probando...' : 'Probar conexión'}
          </button>
        </div>

        {detectMessage && (
          <div
            data-testid="ollama-detect-status"
            style={{
              marginTop: '8px',
              fontSize: '11px',
              color: detectedModels.length > 0 ? '#B6F23A' : '#B3B0A6',
            }}
          >
            {detectMessage}
          </div>
        )}

        {detectedModels.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              marginTop: '6px',
            }}
          >
            {detectedModels.map((modelName) => (
              <button
                key={modelName}
                type="button"
                data-testid={`ollama-model-chip-${modelName}`}
                className="btn-ghost mono"
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  borderColor:
                    aiModel === modelName
                      ? '#B6F23A'
                      : 'rgba(242, 235, 217, 0.16)',
                  color: aiModel === modelName ? '#B6F23A' : '#F2EBD9',
                }}
                onClick={() => {
                  setAiProvider('ollama');
                  setAiModel(modelName);
                  setAiEndpoint(detectedEndpoint || 'http://127.0.0.1:11434');
                }}
              >
                {modelName}
              </button>
            ))}
          </div>
        )}

        {connectionResult && (
          <div
            data-testid="ai-connection-status"
            style={{
              marginTop: '8px',
              padding: '6px 10px',
              borderRadius: '8px',
              fontSize: '11px',
              background: connectionResult.ok
                ? 'rgba(182, 242, 58, 0.12)'
                : 'rgba(255, 90, 95, 0.12)',
              color: connectionResult.ok ? '#B6F23A' : '#FF5A5F',
            }}
          >
            {connectionResult.ok
              ? `Conectado (${connectionResult.latencyMs} ms)${
                  connectionResult.replyPreview
                    ? ` · ${connectionResult.replyPreview}`
                    : ''
                }`
              : `Error (${connectionResult.latencyMs} ms): ${
                  connectionResult.error ?? 'No se pudo conectar'
                }`}
          </div>
        )}
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

      {/* Desktop Folder & Companion Integration */}
      <article className="card" data-testid="settings-section-desktop">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
            <Monitor size={14} color="#58B2FF" />
            <span>Escritorio y Modo Compañero</span>
          </div>
          <span className="sub mono" style={{ fontSize: '11px' }}>
            Atajo: {desktopHotkey}
          </span>
        </div>

        <form
          onSubmit={(e) => void handleSaveDesktopDir(e)}
          style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          <label style={{ fontSize: '11px', color: '#8E8E93' }}>
            Carpeta objetivo para Organizar Escritorio (vacío = Sandbox seguro)
            <input
              type="text"
              value={desktopDir}
              onChange={(e) => setDesktopDir(e.target.value)}
              placeholder={realDesktopDir || 'data/desktop-sandbox'}
              aria-label="Carpeta del escritorio"
              data-testid="desktop-target-dir-input"
              className="input mono"
              style={{ width: '100%', marginTop: '3px', fontSize: '11px' }}
            />
          </label>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <button
              type="submit"
              data-testid="save-desktop-dir-btn"
              className="btn-lime"
              style={{ fontSize: '11px', padding: '5px 10px' }}
            >
              Guardar ruta
            </button>

            <button
              type="button"
              data-testid="use-real-desktop-btn"
              className="btn-ghost"
              style={{ fontSize: '11px', padding: '5px 10px' }}
              onClick={() => void handleUseRealDesktop()}
            >
              Usar mi Escritorio real
            </button>

            <button
              type="button"
              data-testid="use-sandbox-desktop-btn"
              className="btn-ghost"
              style={{ fontSize: '11px', padding: '5px 10px' }}
              onClick={() => void handleUseSandboxDesktop()}
            >
              Usar Sandbox
            </button>
          </div>
        </form>

        {window.trokoElectron?.isElectron && (
          <div
            style={{
              marginTop: '10px',
              paddingTop: '10px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px',
              fontSize: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Iniciar con Windows / Sistema</span>
              <button
                type="button"
                role="switch"
                aria-checked={openAtLogin}
                aria-label="Iniciar con Windows / Sistema"
                data-testid="electron-autolaunch-toggle"
                className="switch"
                onClick={() => void handleToggleAutoLaunch()}
              >
                <span className="switch__thumb" />
              </button>
            </div>

            <button
              type="button"
              data-testid="electron-hide-tray-btn"
              className="btn-ghost"
              style={{ fontSize: '11px', padding: '4px 10px' }}
              onClick={() => window.trokoElectron?.hideWindow()}
            >
              Ocultar en bandeja
            </button>
          </div>
        )}
      </article>

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

              {int.type === 'imap_smtp' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 2fr 1fr',
                      gap: '6px',
                    }}
                  >
                    <input
                      type="text"
                      placeholder="IMAP Host (ej. imap.gmail.com)"
                      aria-label="IMAP Host"
                      data-testid="imap-host-input"
                      value={imapHost}
                      onChange={(e) => setImapHost(e.target.value)}
                      className="input mono"
                      style={{ fontSize: '11px' }}
                    />
                    <input
                      type="number"
                      placeholder="993"
                      aria-label="IMAP Port"
                      data-testid="imap-port-input"
                      value={imapPort}
                      onChange={(e) => setImapPort(e.target.value)}
                      className="input mono"
                      style={{ fontSize: '11px' }}
                    />
                    <input
                      type="text"
                      placeholder="SMTP Host (ej. smtp.gmail.com)"
                      aria-label="SMTP Host"
                      data-testid="smtp-host-input"
                      value={smtpHost}
                      onChange={(e) => setSmtpHost(e.target.value)}
                      className="input mono"
                      style={{ fontSize: '11px' }}
                    />
                    <input
                      type="number"
                      placeholder="465"
                      aria-label="SMTP Port"
                      data-testid="smtp-port-input"
                      value={smtpPort}
                      onChange={(e) => setSmtpPort(e.target.value)}
                      className="input mono"
                      style={{ fontSize: '11px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="Usuario / Correo"
                      aria-label="Usuario IMAP/SMTP"
                      data-testid="imap-user-input"
                      value={mailUser}
                      onChange={(e) => setMailUser(e.target.value)}
                      className="input mono"
                      style={{ flex: 1, fontSize: '11px' }}
                    />
                    <input
                      type="password"
                      placeholder="Contraseña o App Password"
                      aria-label="Contraseña IMAP/SMTP"
                      data-testid="imap-pass-input"
                      value={mailPass}
                      onChange={(e) => setMailPass(e.target.value)}
                      className="input mono"
                      style={{ flex: 1, fontSize: '11px' }}
                    />
                    <button
                      type="button"
                      data-testid="test-integration-imap_smtp"
                      className="btn-ghost"
                      disabled={testingImapSmtp}
                      style={{ padding: '4px 10px', fontSize: '11px' }}
                      onClick={() => void handleTestImapSmtp(int)}
                    >
                      {testingImapSmtp ? 'Probando...' : 'Probar'}
                    </button>
                  </div>
                  {imapSmtpTestResult && (
                    <div
                      data-testid="imap-smtp-test-status"
                      style={{
                        fontSize: '11px',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: imapSmtpTestResult.ok
                          ? 'rgba(182, 242, 58, 0.12)'
                          : 'rgba(255, 90, 95, 0.12)',
                        color: imapSmtpTestResult.ok ? '#B6F23A' : '#FF5A5F',
                      }}
                    >
                      {imapSmtpTestResult.details}
                    </div>
                  )}
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
