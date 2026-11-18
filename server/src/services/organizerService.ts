import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { TrokoDatabase } from '../db/database.ts';
import type { EventBus } from '../eventBus.ts';
import type { SettingsService } from './settingsService.ts';

export const DESKTOP_CATEGORIES = [
  'Capturas',
  'Imágenes',
  'Documentos',
  'Hojas de cálculo',
  'Audio',
  'Videos',
  'Comprimidos',
  'Otros',
] as const;

export type DesktopCategory = (typeof DESKTOP_CATEGORIES)[number];

export interface DesktopFileItem {
  fileName: string;
  category: DesktopCategory;
  sizeBytes: number;
  sourcePath: string;
  destPath: string;
}

export interface DesktopScanResult {
  ok: true;
  batchId: string;
  targetDir: string;
  desktopDir: string;
  totalFiles: number;
  fileCount: number;
  files: DesktopFileItem[];
  items: DesktopFileItem[];
  byCategory: Record<DesktopCategory, number>;
  categories: Record<DesktopCategory, number>;
  lastBatchId: string | null;
}

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.heic', '.bmp']);
const DOC_EXTS = new Set(['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf', '.pages', '.odt']);
const SHEET_EXTS = new Set(['.csv', '.xls', '.xlsx', '.ods', '.numbers', '.tsv']);
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi']);
const ARCHIVE_EXTS = new Set(['.zip', '.tar', '.gz', '.tgz', '.rar', '.7z', '.bz2']);

export function classifyDesktopFile(fileName: string): DesktopCategory {
  const lower = fileName.toLowerCase();
  const ext = path.extname(lower);

  const isScreenshotName =
    lower.startsWith('captura') ||
    lower.startsWith('screenshot') ||
    lower.startsWith('screen shot') ||
    lower.startsWith('screen_shot');

  if (isScreenshotName && (IMAGE_EXTS.has(ext) || ext === '')) {
    return 'Capturas';
  }
  if (IMAGE_EXTS.has(ext)) {
    return 'Imágenes';
  }
  if (DOC_EXTS.has(ext)) {
    return 'Documentos';
  }
  if (SHEET_EXTS.has(ext)) {
    return 'Hojas de cálculo';
  }
  if (AUDIO_EXTS.has(ext)) {
    return 'Audio';
  }
  if (VIDEO_EXTS.has(ext)) {
    return 'Videos';
  }
  if (ARCHIVE_EXTS.has(ext)) {
    return 'Comprimidos';
  }
  return 'Otros';
}

function resolveCollisionSafeDest(destDir: string, fileName: string): string {
  const candidate = path.join(destDir, fileName);
  if (!fs.existsSync(candidate)) {
    return candidate;
  }
  const ext = path.extname(fileName);
  const base = fileName.slice(0, fileName.length - ext.length);
  let counter = 1;
  while (true) {
    const nextCandidate = path.join(destDir, `${base} (${counter})${ext}`);
    if (!fs.existsSync(nextCandidate)) {
      return nextCandidate;
    }
    counter += 1;
  }
}

export class OrganizerService {
  private readonly db: TrokoDatabase;
  private readonly eventBus: EventBus;
  private readonly settingsService: SettingsService;
  private readonly explicitDesktopDir?: string;

  constructor(
    db: TrokoDatabase,
    eventBus: EventBus,
    settingsService: SettingsService,
    explicitDesktopDir?: string
  ) {
    this.db = db;
    this.eventBus = eventBus;
    this.settingsService = settingsService;
    this.explicitDesktopDir = explicitDesktopDir;
  }

  resolveTargetDir(): string {
    const settings = this.settingsService.getSettings();
    if (settings.desktopTargetDir && settings.desktopTargetDir.trim().length > 0) {
      const resolved = path.resolve(settings.desktopTargetDir.trim());
      fs.mkdirSync(resolved, { recursive: true });
      return resolved;
    }
    if (this.explicitDesktopDir && this.explicitDesktopDir.trim().length > 0) {
      const resolved = path.resolve(this.explicitDesktopDir.trim());
      fs.mkdirSync(resolved, { recursive: true });
      return resolved;
    }
    const envDir =
      process.env['TROKO_E2E_DESKTOP_DIR'] ||
      process.env['TROKO_DESKTOP_DIR'] ||
      process.env['DESKTOP_SANDBOX_DIR'] ||
      process.env['DESKTOP_DIR'];
    if (envDir && envDir.trim().length > 0) {
      const resolved = path.resolve(envDir.trim());
      fs.mkdirSync(resolved, { recursive: true });
      return resolved;
    }
    const cwd = process.cwd();
    const defaultDir =
      path.basename(cwd) === 'server'
        ? path.resolve(cwd, '../data/desktop-sandbox')
        : path.resolve(cwd, 'data/desktop-sandbox');
    fs.mkdirSync(defaultDir, { recursive: true });
    return defaultDir;
  }

  getLastAppliedBatchId(): string | null {
    const row = this.db.db
      .prepare(
        "SELECT id FROM desktop_tidy_batches WHERE status = 'applied' ORDER BY created_at DESC LIMIT 1"
      )
      .get() as Record<string, unknown> | undefined;
    return row?.['id'] ? String(row['id']) : null;
  }

  scanDesktop(): DesktopScanResult {
    const targetDir = this.resolveTargetDir();
    const byCategory: Record<DesktopCategory, number> = {
      Capturas: 0,
      Imágenes: 0,
      Documentos: 0,
      'Hojas de cálculo': 0,
      Audio: 0,
      Videos: 0,
      Comprimidos: 0,
      Otros: 0,
    };

    const files: DesktopFileItem[] = [];
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(targetDir, { withFileTypes: true });
    } catch {
      entries = [];
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (entry.name.startsWith('.')) continue;

      const sourcePath = path.join(targetDir, entry.name);
      let sizeBytes = 0;
      try {
        sizeBytes = fs.statSync(sourcePath).size;
      } catch {
        sizeBytes = 0;
      }

      const category = classifyDesktopFile(entry.name);
      byCategory[category] = (byCategory[category] ?? 0) + 1;
      const destPath = path.join(targetDir, category, entry.name);

      files.push({
        fileName: entry.name,
        category,
        sizeBytes,
        sourcePath,
        destPath,
      });
    }

    const lastBatchId = this.getLastAppliedBatchId();
    return {
      ok: true,
      batchId: lastBatchId ?? `preview-${crypto.randomUUID()}`,
      targetDir,
      desktopDir: targetDir,
      totalFiles: files.length,
      fileCount: files.length,
      files,
      items: files,
      byCategory,
      categories: byCategory,
      lastBatchId,
    };
  }

  getLooseDesktopFilesCount(): number {
    return this.scanDesktop().totalFiles;
  }

  previewTidy(): DesktopScanResult {
    const scan = this.scanDesktop();
    const previewBatchId = `preview-${crypto.randomUUID()}`;

    this.eventBus.setIslandState({
      state: 'attentive',
      mood: 'contento',
      statusText: 'Atento',
      peekCard: {
        kind: 'desktop_tidy',
        batchId: previewBatchId,
        totalFiles: scan.totalFiles,
        categories: scan.byCategory,
        items: scan.files.map((f) => ({
          fileName: f.fileName,
          category: f.category,
        })),
      },
    });

    return {
      ...scan,
      batchId: previewBatchId,
    };
  }

  applyTidy(): {
    ok: true;
    batchId: string;
    movedCount: number;
    fileCount: number;
    targetDir: string;
    moves: Array<{
      id: string;
      fileName: string;
      category: DesktopCategory;
      sourcePath: string;
      destPath: string;
    }>;
  } {
    const scan = this.scanDesktop();
    const batchId = `batch-${crypto.randomUUID()}`;
    const nowIso = new Date().toISOString();

    const moves: Array<{
      id: string;
      fileName: string;
      category: DesktopCategory;
      sourcePath: string;
      destPath: string;
    }> = [];

    for (const file of scan.files) {
      if (!fs.existsSync(file.sourcePath)) continue;
      const categoryDir = path.join(scan.targetDir, file.category);
      fs.mkdirSync(categoryDir, { recursive: true });
      const actualDestPath = resolveCollisionSafeDest(categoryDir, file.fileName);
      fs.renameSync(file.sourcePath, actualDestPath);
      moves.push({
        id: `move-${crypto.randomUUID()}`,
        fileName: file.fileName,
        category: file.category,
        sourcePath: file.sourcePath,
        destPath: actualDestPath,
      });
    }

    this.db.db
      .prepare(
        `INSERT INTO desktop_tidy_batches (id, target_dir, status, file_count, created_at, undone_at)
         VALUES (?, ?, 'applied', ?, ?, NULL)`
      )
      .run(batchId, scan.targetDir, moves.length, nowIso);

    const insertMove = this.db.db.prepare(
      `INSERT INTO desktop_tidy_moves (id, batch_id, file_name, category, source_path, dest_path)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const m of moves) {
      insertMove.run(m.id, batchId, m.fileName, m.category, m.sourcePath, m.destPath);
    }

    this.eventBus.setIslandState({
      state: 'success',
      mood: 'festejo',
      statusText: 'Listo',
      badgeWord: 'Ordenado',
      peekCard: null,
    });
    this.eventBus.publish('desktop.changed', {
      batchId,
      movedCount: moves.length,
    });
    this.eventBus.publish('data.updated', { scope: 'desktop' });

    return {
      ok: true,
      batchId,
      movedCount: moves.length,
      fileCount: moves.length,
      targetDir: scan.targetDir,
      moves,
    };
  }

  undoTidy(requestedBatchId?: string): {
    ok: true;
    batchId: string | null;
    restoredCount: number;
  } {
    const batchRow = (
      requestedBatchId
        ? this.db.db
            .prepare("SELECT * FROM desktop_tidy_batches WHERE id = ? AND status = 'applied'")
            .get(requestedBatchId)
        : this.db.db
            .prepare(
              "SELECT * FROM desktop_tidy_batches WHERE status = 'applied' ORDER BY created_at DESC LIMIT 1"
            )
            .get()
    ) as Record<string, unknown> | undefined;

    if (!batchRow) {
      return { ok: true, batchId: null, restoredCount: 0 };
    }

    const batchId = String(batchRow['id']);
    const moveRows = this.db.db
      .prepare('SELECT * FROM desktop_tidy_moves WHERE batch_id = ?')
      .all(batchId) as Array<Record<string, unknown>>;

    let restoredCount = 0;

    for (const row of moveRows) {
      const sourcePath = String(row['source_path']);
      const destPath = String(row['dest_path']);

      if (fs.existsSync(destPath)) {
        fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
        fs.renameSync(destPath, sourcePath);
        restoredCount += 1;
      }
    }

    const nowIso = new Date().toISOString();
    this.db.db
      .prepare("UPDATE desktop_tidy_batches SET status = 'undone', undone_at = ? WHERE id = ?")
      .run(nowIso, batchId);

    this.eventBus.setIslandState({
      state: 'idle',
      mood: 'contento',
      statusText: 'Reposo',
      peekCard: null,
    });
    this.eventBus.publish('desktop.changed', {
      batchId,
      restoredCount,
    });
    this.eventBus.publish('data.updated', { scope: 'desktop' });

    return {
      ok: true,
      batchId,
      restoredCount,
    };
  }

  seedSampleFiles(): DesktopScanResult {
    const targetDir = this.resolveTargetDir();
    const samples: Array<{ name: string; content: string }> = [
      { name: 'Captura de pantalla 2026-04-19.png', content: 'PNG_SAMPLE_SCREENSHOT' },
      { name: 'Foto_equipo.jpg', content: 'JPG_SAMPLE_IMAGE' },
      { name: 'Presupuesto_Q3.pdf', content: 'PDF_SAMPLE_DOC' },
      { name: 'Ventas_2026.csv', content: 'mes,ventas\nenero,1200\n' },
      { name: 'Nota_voz.mp3', content: 'MP3_SAMPLE_AUDIO' },
      { name: 'Demo_Troko.mp4', content: 'MP4_SAMPLE_VIDEO' },
      { name: 'Respaldo_proyecto.zip', content: 'ZIP_SAMPLE_ARCHIVE' },
      { name: 'Notas_reunion.txt', content: 'Apuntes de la reunión semanal' },
    ];
    for (const s of samples) {
      const filePath = path.join(targetDir, s.name);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, s.content, 'utf8');
      }
    }
    this.eventBus.publish('desktop.changed', { seeded: true });
    this.eventBus.publish('data.updated', { scope: 'desktop' });
    return this.scanDesktop();
  }
}
