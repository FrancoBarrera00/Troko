import { FolderSync, Laptop, Play, RotateCcw, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SummarySnapshot } from '../../../../shared/types.ts';
import { apiClient, type DesktopScanResponse } from '../../api/client.ts';

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

  useEffect(() => {
    void apiClient.scanDesktop().then(() => onRefreshAll());
  }, []);

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
    </section>
  );
}
