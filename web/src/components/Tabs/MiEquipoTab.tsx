import {
  Activity,
  Copy,
  FolderSync,
  Laptop,
  Pin,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { SummarySnapshot } from '../../../../shared/types.ts';
import { apiClient, type DesktopScanResponse } from '../../api/client.ts';

type SystemStatsData = Awaited<ReturnType<typeof apiClient.getSystemStats>>;
type QuickNoteItem = Awaited<ReturnType<typeof apiClient.listNotes>>[number];

function formatBytesGb(bytes: number): string {
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatUptimeShort(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export interface MiEquipoTabProps {
  summary: SummarySnapshot | null;
  desktopScan: DesktopScanResponse | null;
  launchedApps: Array<{ app: string; launchedAt: string }>;
  onRefreshAll: () => Promise<void>;
  onOpenAppWindow?: (app: string) => void;
}

const WHITELISTED_APPS = [
  'Notas',
  'Safari',
  'Calendario',
  'Calculadora',
  'Música',
  'Correo',
  'Finder',
] as const;

export function MiEquipoTab({
  desktopScan,
  launchedApps,
  onRefreshAll,
  onOpenAppWindow,
}: MiEquipoTabProps) {
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [systemStats, setSystemStats] = useState<SystemStatsData | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [quickNotes, setQuickNotes] = useState<QuickNoteItem[]>([]);
  const [newNoteText, setNewNoteText] = useState('');

  const refreshSystemAndNotes = useCallback(async () => {
    setLoadingStats(true);
    try {
      const [statsRes, notesRes] = await Promise.allSettled([
        apiClient.getSystemStats(),
        apiClient.listNotes(),
      ]);
      if (statsRes.status === 'fulfilled') setSystemStats(statsRes.value);
      if (notesRes.status === 'fulfilled') setQuickNotes(notesRes.value);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    void apiClient.scanDesktop().then(() => onRefreshAll());
    void refreshSystemAndNotes();
  }, [refreshSystemAndNotes]);

  const handlePreview = async () => {
    const scan = await apiClient.previewDesktopTidy();
    setPreviewOpen(true);
    setStatusMsg(
      `Vista previa lista: ${scan.totalFiles} archivos sueltos detectados para ordenar.`
    );
    await onRefreshAll();
  };

  const handleCancel = async () => {
    setPreviewOpen(false);
    setShowDetails(false);
    setStatusMsg(null);
    await apiClient
      .setIslandState({
        state: 'idle',
        mood: 'contento',
        statusText: 'Reposo',
        peekCard: null,
      })
      .catch(() => {});
    await onRefreshAll();
  };

  const handleApply = async () => {
    const res = await apiClient.applyDesktopTidy();
    setPreviewOpen(false);
    setShowDetails(false);
    setStatusMsg(
      `¡Escritorio ordenado! Se movieron ${res.movedCount} archivos por categoría (0 eliminados).`
    );
    await onRefreshAll();
  };

  const handleUndo = async () => {
    const res = await apiClient.undoDesktopTidy();
    setPreviewOpen(false);
    setShowDetails(false);
    setStatusMsg(
      `Orden deshecho: se restauraron ${res.restoredCount} archivos a su ruta original.`
    );
    await onRefreshAll();
  };

  const handleSeed = async () => {
    const scan = await apiClient.seedDesktopSample();
    setStatusMsg(`Se generaron ${scan.totalFiles} archivos de prueba en el sandbox.`);
    await onRefreshAll();
  };

  const handleLaunchApp = async (app: string) => {
    await apiClient.launchApp(app);
    onOpenAppWindow?.(app);
    setStatusMsg(`Aplicación «${app}» abierta correctamente.`);
    await onRefreshAll();
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = newNoteText.trim();
    if (!text) return;
    await apiClient.createNote(text, false);
    setNewNoteText('');
    setStatusMsg('Apunte rápido guardado localmente.');
    await refreshSystemAndNotes();
  };

  const handleTogglePin = async (note: QuickNoteItem) => {
    await apiClient.updateNote(note.id, { pinned: !note.pinned });
    await refreshSystemAndNotes();
  };

  const handleDeleteNote = async (id: string) => {
    await apiClient.deleteNote(id);
    setStatusMsg('Apunte eliminado.');
    await refreshSystemAndNotes();
  };

  const handleCopyNote = async (content: string) => {
    try {
      await navigator.clipboard?.writeText(content);
      setStatusMsg('Texto copiado al portapapeles.');
    } catch {
      setStatusMsg('No se pudo copiar automáticamente al portapapeles.');
    }
  };

  const totalFiles = desktopScan?.totalFiles ?? 0;
  const byCategory = desktopScan?.byCategory ?? {};
  const files = desktopScan?.files ?? [];

  return (
    <section
      className="view"
      data-testid="view-mi_mac"
      style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
    >
      <header className="vhead">
        <div>
          <span className="eyebrow">Herramientas del sistema seguras</span>
          <h2>Mi Mac / Mi Equipo</h2>
        </div>
        <span className="sub mono" data-testid="desktop-files-count">
          {totalFiles} archivos sueltos
        </span>
      </header>

      {statusMsg && (
        <div
          data-testid="mi-equipo-status"
          style={{
            background: 'rgba(182, 242, 58, 0.14)',
            border: '1px solid rgba(182, 242, 58, 0.35)',
            borderRadius: '12px',
            padding: '8px 12px',
            fontSize: '12px',
            color: '#B6F23A',
          }}
        >
          {statusMsg}
        </div>
      )}

      {/* Desktop Organizer Section */}
      <div className="card" data-testid="desktop-organizer-section">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
            <FolderSync size={15} color="#B6F23A" />
            <span>Organizador de Escritorio (Cero borrados)</span>
          </div>
          <span className="sub mono" style={{ fontSize: '11px' }}>
            {desktopScan?.targetDir ?? 'data/desktop-sandbox'}
          </span>
        </div>

        <div
          data-testid="desktop-categories-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: '6px',
            marginBottom: '10px',
          }}
        >
          {[
            'Capturas',
            'Imágenes',
            'Documentos',
            'Hojas de cálculo',
            'Audio',
            'Videos',
            'Comprimidos',
            'Otros',
          ].map((cat) => {
            const count = byCategory[cat] ?? 0;
            return (
              <div
                key={cat}
                data-testid={`desktop-cat-${cat}`}
                style={{
                  background: '#151518',
                  borderRadius: '8px',
                  padding: '6px 8px',
                  fontSize: '11px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  border:
                    count > 0
                      ? '1px solid rgba(182, 242, 58, 0.35)'
                      : '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <span>{cat}</span>
                <strong className="mono">{count}</strong>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <button
            type="button"
            data-testid="desktop-preview-btn"
            className="btn-lime"
            onClick={() => void handlePreview()}
          >
            <Sparkles size={13} />
            <span>Ordenar escritorio</span>
          </button>

          {previewOpen && (
            <>
              <button
                type="button"
                data-testid="desktop-apply-btn"
                className="btn-lime"
                onClick={() => void handleApply()}
              >
                <FolderSync size={13} />
                <span>Ordenar ahora</span>
              </button>

              <button
                type="button"
                data-testid="desktop-detail-btn"
                className="btn-ghost"
                onClick={() => setShowDetails((v) => !v)}
              >
                <span>Ver detalle</span>
              </button>

              <button
                type="button"
                data-testid="desktop-cancel-btn"
                className="btn-ghost"
                onClick={() => void handleCancel()}
              >
                <X size={13} />
                <span>Cancelar</span>
              </button>
            </>
          )}

          <button
            type="button"
            data-testid="desktop-undo-btn"
            className="btn-ghost"
            onClick={() => void handleUndo()}
          >
            <RotateCcw size={13} />
            <span>Deshacer</span>
          </button>

          <button
            type="button"
            data-testid="desktop-seed-btn"
            className="btn-ghost"
            onClick={() => void handleSeed()}
          >
            Generar archivos de prueba
          </button>
        </div>

        {previewOpen && showDetails && (
          <div
            data-testid="desktop-tidy-details"
            style={{
              marginTop: '10px',
              background: '#151518',
              borderRadius: '10px',
              padding: '8px 10px',
              fontSize: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            {files.length === 0 ? (
              <span className="sub">Sin archivos pendientes</span>
            ) : (
              files.map((f) => (
                <div
                  key={f.fileName}
                  style={{ display: 'flex', justifyContent: 'space-between' }}
                >
                  <span className="mono">{f.fileName}</span>
                  <span style={{ color: '#B6F23A' }}>→ {f.category}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Whitelisted App Launcher Section */}
      <div className="card" data-testid="app-launcher-section">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '8px',
            fontWeight: 600,
          }}
        >
          <Laptop size={15} color="#58B2FF" />
          <span>Lanzador de aplicaciones autorizadas (Lista blanca)</span>
        </div>

        <div
          data-testid="app-launcher-grid"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          {WHITELISTED_APPS.map((app) => (
            <button
              key={app}
              type="button"
              data-testid={`launch-app-${app}`}
              aria-label={`Abrir ${app}`}
              className="btn-ghost"
              onClick={() => void handleLaunchApp(app)}
            >
              <Play size={12} />
              <span>{app}</span>
            </button>
          ))}
        </div>

        {launchedApps.length > 0 && (
          <div
            data-testid="launched-apps-list"
            className="sub"
            style={{ marginTop: '8px', fontSize: '11px' }}
          >
            Recientes: {launchedApps.map((l) => l.app).join(', ')}
          </div>
        )}
      </div>

      {/* System Telemetry Monitor */}
      <div className="card" data-testid="system-stats-section">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
            <Activity size={15} color="#B6F23A" />
            <span>Monitor del Sistema</span>
          </div>
          <button
            type="button"
            data-testid="system-stats-refresh-btn"
            className="btn-ghost"
            disabled={loadingStats}
            style={{ padding: '3px 8px', fontSize: '11px' }}
            onClick={() => void refreshSystemAndNotes()}
          >
            <RefreshCw size={11} />
            <span>{loadingStats ? 'Leyendo...' : 'Actualizar'}</span>
          </button>
        </div>

        {systemStats ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: '6px',
              }}
            >
              <div
                style={{
                  background: '#151518',
                  borderRadius: '8px',
                  padding: '6px 8px',
                }}
              >
                <div className="sub" style={{ fontSize: '10px' }}>
                  Sistema
                </div>
                <strong className="mono" style={{ fontSize: '11px' }}>
                  {systemStats.platform} · {systemStats.arch}
                </strong>
              </div>

              <div
                style={{
                  background: '#151518',
                  borderRadius: '8px',
                  padding: '6px 8px',
                }}
              >
                <div className="sub" style={{ fontSize: '10px' }}>
                  CPU ({systemStats.cpuCores} núcleos)
                </div>
                <strong
                  className="mono"
                  style={{
                    fontSize: '11px',
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={systemStats.cpuModel}
                >
                  {systemStats.cpuModel}
                </strong>
              </div>

              <div
                style={{
                  background: '#151518',
                  borderRadius: '8px',
                  padding: '6px 8px',
                }}
              >
                <div className="sub" style={{ fontSize: '10px' }}>
                  Actividad
                </div>
                <strong className="mono" style={{ fontSize: '11px' }}>
                  {formatUptimeShort(systemStats.uptimeSec)} · carga {systemStats.loadAvg1m}
                </strong>
              </div>
            </div>

            <div
              style={{
                background: '#151518',
                borderRadius: '8px',
                padding: '7px 9px',
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span>Memoria RAM en uso</span>
                <span className="mono" data-testid="system-stats-ram">
                  {systemStats.memUsedPct}% · libre {formatBytesGb(systemStats.memFreeBytes)} /{' '}
                  {formatBytesGb(systemStats.memTotalBytes)}
                </span>
              </div>
              <div
                style={{
                  height: '6px',
                  borderRadius: '999px',
                  background: 'rgba(255,255,255,0.08)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, Math.max(4, systemStats.memUsedPct))}%`,
                    height: '100%',
                    background:
                      systemStats.memUsedPct > 85
                        ? '#FF5A5F'
                        : systemStats.memUsedPct > 65
                        ? '#FFB84D'
                        : '#B6F23A',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="sub" style={{ fontSize: '12px' }}>
            Cargando métricas locales del equipo...
          </div>
        )}
      </div>

      {/* Quick Scratchpad Notes */}
      <div className="card" data-testid="quick-notes-section">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
            <StickyNote size={15} color="#FFB84D" />
            <span>Bloc rápido (Apuntes locales)</span>
          </div>
          <span className="sub mono" style={{ fontSize: '11px' }}>
            {quickNotes.length} guardados
          </span>
        </div>

        <form
          onSubmit={(e) => void handleAddNote(e)}
          style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}
        >
          <input
            type="text"
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            placeholder="Nueva nota rápida..."
            aria-label="Nueva nota rápida"
            data-testid="quick-note-input"
            className="input"
            style={{ flex: 1, fontSize: '12px' }}
          />
          <button
            type="submit"
            data-testid="quick-note-add-btn"
            className="btn-lime"
            style={{ padding: '6px 12px', fontSize: '12px' }}
          >
            Guardar nota
          </button>
        </form>

        {quickNotes.length === 0 ? (
          <div className="sub" style={{ fontSize: '12px' }}>
            Sin apuntes todavía. También puedes decir «Nota rápida: comprar café» en el chat.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {quickNotes.map((note) => (
              <div
                key={note.id}
                data-testid={`quick-note-item-${note.id}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px',
                  background: '#151518',
                  borderRadius: '8px',
                  padding: '6px 8px',
                  border: note.pinned
                    ? '1px solid rgba(255, 184, 77, 0.45)'
                    : '1px solid rgba(255,255,255,0.05)',
                  fontSize: '12px',
                }}
              >
                <span style={{ flex: 1, wordBreak: 'break-word' }}>{note.content}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    type="button"
                    className="btn-ghost"
                    aria-label={note.pinned ? 'Soltar apunte' : 'Fijar apunte'}
                    style={{
                      padding: '3px 6px',
                      fontSize: '11px',
                      color: note.pinned ? '#FFB84D' : undefined,
                    }}
                    onClick={() => void handleTogglePin(note)}
                  >
                    <Pin size={11} />
                    <span>{note.pinned ? 'Soltar' : 'Fijar'}</span>
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    aria-label="Copiar apunte"
                    style={{ padding: '3px 6px', fontSize: '11px' }}
                    onClick={() => void handleCopyNote(note.content)}
                  >
                    <Copy size={11} />
                    <span>Copiar</span>
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    aria-label="Quitar apunte"
                    style={{ padding: '3px 6px', fontSize: '11px', color: '#FF5A5F' }}
                    onClick={() => void handleDeleteNote(note.id)}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
