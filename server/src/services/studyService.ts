import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { extractText, getDocumentProxy } from 'unpdf';
import type {
  DueStudyReview,
  StudyBlock,
  StudyDecodeProgress,
  StudyDocument,
  StudyQuizQuestion,
  StudyReviewQuality,
} from '../../../shared/types.ts';
import { HttpError } from '../app.ts';
import type { EventBus } from '../eventBus.ts';
import type { AiProviderService } from './aiProvider.ts';
import type { ProgressionService } from './progressionService.ts';
import type { SettingsService } from './settingsService.ts';

interface PageChunk {
  pageNumber: number;
  text: string;
}

const STOPWORDS_ES = new Set([
  'para', 'como', 'pero', 'sobre', 'entre', 'desde', 'hasta', 'donde', 'cuando',
  'porque', 'aunque', 'mientras', 'según', 'estos', 'estas', 'aquel', 'ellos',
  'ellas', 'también', 'puede', 'pueden', 'tiene', 'tienen', 'siendo', 'hacer',
  'forma', 'manera', 'parte', 'todos', 'todas', 'mucho', 'otros', 'otras',
  'cada', 'mediante', 'través', 'solo', 'mismo', 'misma', 'dentro', 'fuera',
  'entonces', 'luego', 'después', 'antes', 'sobre', 'será', 'están', 'este',
  'esta', 'unos', 'unas', 'unos', 'cual', 'quien', 'todo', 'toda', 'más',
]);

function resolveStorePath(dbPath?: string): string | null {
  if (!dbPath || dbPath === ':memory:') return null;
  return path.join(path.dirname(path.resolve(dbPath)), 'troko-study.json');
}

function normalizePageText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/-\n([a-záéíóúñ])/gi, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isHeadingLine(line: string): boolean {
  const s = line.trim();
  if (s.length < 3 || s.length > 95) return false;
  if (/^#{1,4}\s+\S/.test(s)) return true;
  if (/^(?:cap[ií]tulo|unidad|tema|secci[oó]n|m[oó]dulo|parte|art[ií]culo|lecci[oó]n)\s+[\dIVXivx]+/i.test(s)) {
    return true;
  }
  if (/^\d+(?:\.\d+)*[.)]\s+[A-ZÁÉÍÓÚÑ]/.test(s) && !/[.;]$/.test(s)) {
    return true;
  }
  if (/^[A-ZÁÉÍÓÚÑ0-9\s:,-]{5,70}$/.test(s) && /[A-ZÁÉÍÓÚÑ]{3,}/.test(s) && !/[.;!?]$/.test(s)) {
    return true;
  }
  return false;
}

function cleanHeading(line: string): string {
  return line.replace(/^#{1,4}\s+/, '').replace(/[:\s]+$/, '').trim();
}

function splitParagraphsClean(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) =>
      p
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join(' ')
    )
    .filter((p) => p.length > 0);
}

interface RawSection {
  title: string;
  paragraphs: string[];
  startPage: number;
  endPage: number;
}

function segmentPagesIntoSections(pages: PageChunk[], fallbackDocTitle: string): RawSection[] {
  const rawSections: RawSection[] = [];
  let current: RawSection = {
    title: `${fallbackDocTitle} · Introducción`,
    paragraphs: [],
    startPage: pages[0]?.pageNumber ?? 1,
    endPage: pages[0]?.pageNumber ?? 1,
  };

  for (const page of pages) {
    const lines = page.text.split('\n');
    let paraBuf: string[] = [];

    const flushPara = () => {
      if (paraBuf.length === 0) return;
      const joined = paraBuf.join(' ').replace(/\s+/g, ' ').trim();
      if (joined) {
        current.paragraphs.push(joined);
        current.endPage = page.pageNumber;
      }
      paraBuf = [];
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        flushPara();
        continue;
      }
      if (isHeadingLine(line)) {
        flushPara();
        if (current.paragraphs.length > 0) {
          rawSections.push(current);
          current = {
            title: cleanHeading(line),
            paragraphs: [],
            startPage: page.pageNumber,
            endPage: page.pageNumber,
          };
        } else {
          current.title = cleanHeading(line);
          current.startPage = page.pageNumber;
          current.endPage = page.pageNumber;
        }
        continue;
      }
      paraBuf.push(line);
    }
    flushPara();
  }

  if (current.paragraphs.length > 0) {
    rawSections.push(current);
  }

  // Merge tiny sections and split oversized ones (> 2200 chars) without losing a single paragraph
  const balanced: RawSection[] = [];
  for (const sec of rawSections) {
    const joinedLen = sec.paragraphs.join('\n\n').length;
    if (joinedLen <= 2300) {
      if (
        balanced.length > 0 &&
        joinedLen < 280 &&
        balanced[balanced.length - 1]!.paragraphs.join('\n\n').length < 1500
      ) {
        const prev = balanced[balanced.length - 1]!;
        prev.paragraphs.push(...sec.paragraphs);
        prev.endPage = sec.endPage;
      } else {
        balanced.push(sec);
      }
      continue;
    }

    // Split large section into sub-parts on paragraph boundaries
    let partIdx = 1;
    let chunkParas: string[] = [];
    let chunkLen = 0;
    for (const p of sec.paragraphs) {
      if (chunkLen + p.length > 1800 && chunkParas.length > 0) {
        balanced.push({
          title: `${sec.title} (Parte ${partIdx})`,
          paragraphs: chunkParas,
          startPage: sec.startPage,
          endPage: sec.endPage,
        });
        partIdx += 1;
        chunkParas = [p];
        chunkLen = p.length;
      } else {
        chunkParas.push(p);
        chunkLen += p.length;
      }
    }
    if (chunkParas.length > 0) {
      balanced.push({
        title: partIdx > 1 ? `${sec.title} (Parte ${partIdx})` : sec.title,
        paragraphs: chunkParas,
        startPage: sec.startPage,
        endPage: sec.endPage,
      });
    }
  }

  if (balanced.length === 0) {
    const allText = pages.map((p) => p.text).join('\n\n').trim();
    if (allText) {
      balanced.push({
        title: fallbackDocTitle,
        paragraphs: splitParagraphsClean(allText),
        startPage: 1,
        endPage: pages[pages.length - 1]?.pageNumber ?? 1,
      });
    }
  }

  return balanced;
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 24 && s.length <= 260);
}

function extractKeyPointsDeterministic(fullText: string, blockTitle: string): string[] {
  const sentences = splitSentences(fullText);
  if (sentences.length === 0) {
    const firstLine = fullText.split('\n').map((l) => l.trim()).find(Boolean) || blockTitle;
    return [firstLine.slice(0, 180)];
  }

  const scored = sentences.map((s, idx) => {
    let score = 0;
    if (/\b(?:es\s+(?:un|una|el|la)|son\s+|se\s+define|consiste\s+en|permite|significa|produce|causa|caracteriza)\b/i.test(s)) {
      score += 4;
    }
    if (s.includes(':')) score += 2;
    if (/\d+/.test(s)) score += 2;
    if (idx === 0) score += 2;
    if (s.length >= 50 && s.length <= 170) score += 1;
    return { s, idx, score };
  });

  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  const picked = scored.slice(0, Math.min(4, scored.length));
  picked.sort((a, b) => a.idx - b.idx);
  return picked.map((p) => p.s);
}

function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/[a-z0-9]{4,}/g);
  if (!words) return [];
  const freq = new Map<string, number>();
  for (const w of words) {
    if (STOPWORDS_ES.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 10)
    .map(([w]) => w);
}

function buildQuizDeterministic(
  blockTitle: string,
  keyPoints: string[],
  allDocSentences: string[]
): StudyQuizQuestion[] {
  const questions: StudyQuizQuestion[] = [];
  const candidates = keyPoints.slice(0, 2);

  candidates.forEach((fact, idx) => {
    // Try definition question ("X es / consiste en / permite ...") or cloze/comprehension
    const defMatch = /^([A-ZÁÉÍÓÚÑ][^.,;:]{3,50}?)\s+(?:es\s+(?:un|una|el|la)?|consiste\s+en|se\s+define\s+como|permite)\s+(.+)$/i.exec(
      fact
    );
    const shortFact = fact.length > 130 ? `${fact.slice(0, 127)}...` : fact;

    const distractors = allDocSentences
      .filter((s) => s !== fact && s.length > 25)
      .slice(0, 12);

    const pickDistractor = (offset: number, fallbackText: string): string => {
      const found = distractors[(idx * 2 + offset) % Math.max(1, distractors.length)];
      if (found) {
        return found.length > 130 ? `${found.slice(0, 127)}...` : found;
      }
      return fallbackText;
    };

    if (defMatch && defMatch[1] && defMatch[2]) {
      const subject = defMatch[1].trim();
      const predicate = defMatch[2].replace(/[.]+$/, '').trim();
      const correctAns = predicate.length > 125 ? `${predicate.slice(0, 122)}...` : predicate;
      const d1 = pickDistractor(0, 'Un proceso secundario sin relación directa con este bloque.');
      const d2 = pickDistractor(1, 'Una etapa posterior que ocurre únicamente fuera de este tema.');
      const rawOpts = [
        { text: correctAns, ok: true },
        { text: d1, ok: false },
        { text: d2, ok: false },
      ];
      // Rotate deterministic order so correct answer isn't always index 0
      const rot = idx % 3;
      const rotated = [...rawOpts.slice(rot), ...rawOpts.slice(0, rot)];
      const correctIndex = rotated.findIndex((o) => o.ok);
      questions.push({
        id: `q-${crypto.randomUUID().slice(0, 8)}`,
        question: `Según «${blockTitle}», ¿qué caracteriza a ${subject}?`,
        options: rotated.map((o) => o.text),
        correctIndex,
        explanation: fact,
      });
    } else {
      const d1 = pickDistractor(
        0,
        'En este bloque se descarta por completo la idea planteada y se propone lo opuesto.'
      );
      const d2 = pickDistractor(
        1,
        'El texto señala que este punto no aplica dentro del tema estudiado.'
      );
      const rawOpts = [
        { text: shortFact, ok: true },
        { text: d1, ok: false },
        { text: d2, ok: false },
      ];
      const rot = (idx + 1) % 3;
      const rotated = [...rawOpts.slice(rot), ...rawOpts.slice(0, rot)];
      const correctIndex = rotated.findIndex((o) => o.ok);
      questions.push({
        id: `q-${crypto.randomUUID().slice(0, 8)}`,
        question: `¿Cuál de las siguientes afirmaciones aparece en «${blockTitle}»?`,
        options: rotated.map((o) => o.text),
        correctIndex,
        explanation: fact,
      });
    }
  });

  return questions;
}

export class StudyService {
  private readonly filePath: string | null;
  private readonly eventBus: EventBus;
  private readonly settingsService: SettingsService;
  private readonly aiProvider: AiProviderService;
  private readonly progressionService?: ProgressionService;
  private docs: StudyDocument[] = [];
  private decodeStatus: StudyDecodeProgress = {
    active: false,
    stage: 'idle',
    message: '',
    currentBlock: 0,
    totalBlocks: 0,
    totalPages: 0,
  };

  constructor(
    dbPath: string | undefined,
    eventBus: EventBus,
    settingsService: SettingsService,
    aiProvider: AiProviderService,
    progressionService?: ProgressionService
  ) {
    this.filePath = resolveStorePath(dbPath);
    this.eventBus = eventBus;
    this.settingsService = settingsService;
    this.aiProvider = aiProvider;
    this.progressionService = progressionService;
    this.docs = this.loadDocs();
  }

  private loadDocs(): StudyDocument[] {
    if (!this.filePath || !fs.existsSync(this.filePath)) {
      return [];
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as unknown;
      return Array.isArray(parsed) ? (parsed as StudyDocument[]) : [];
    } catch {
      return [];
    }
  }

  private saveDocs(): void {
    if (!this.filePath) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.docs, null, 2), 'utf8');
    } catch {
      // Ignore write failures
    }
  }

  listDocuments(): StudyDocument[] {
    return this.docs;
  }

  getDocumentOrThrow(id: string): StudyDocument {
    const found = this.docs.find((d) => d.id === id);
    if (!found) {
      throw new HttpError(404, 'Documento de estudio no encontrado');
    }
    return found;
  }

  getDecodeStatus(): StudyDecodeProgress {
    return { ...this.decodeStatus };
  }

  private setDecodeProgress(next: StudyDecodeProgress): void {
    this.decodeStatus = next;
    this.eventBus.publish('data.updated', {
      scope: 'study',
      decodeProgress: next,
    });
  }

  private async tryAiEnrichBlock(
    title: string,
    fullText: string
  ): Promise<{
    title?: string;
    keyPoints?: string[];
    quizQuestions?: StudyQuizQuestion[];
  } | null> {
    const settings = this.settingsService.getSettings();
    if (settings.aiProvider === 'local_fallback') {
      return null;
    }

    const prompt = [
      `Analiza esta sección completa de estudio titulada "${title}" y responde SOLO JSON válido con esta estructura exacta:`,
      `{"title":"título claro y conciso","keyPoints":["idea clave 1","idea clave 2","idea clave 3"],"quiz":[{"question":"pregunta de comprensión","options":["opción A","opción B","opción C"],"correctIndex":0,"explanation":"por qué"}]}`,
      `Reglas: no omitas conceptos importantes en keyPoints (3 a 5 bullets en español) y crea 2 preguntas útiles.`,
      `Texto completo de la sección:\n${fullText.slice(0, 3200)}`,
    ].join('\n');

    try {
      const res = await this.aiProvider.generateReply(
        settings,
        [],
        prompt,
        {
          systemPrompt:
            'Eres un tutor de estudio en español. Responde estrictamente con un objeto JSON válido sin markdown.',
          timeoutMs: 12000,
        }
      );
      if (!res?.reply) return null;

      const trimmed = res.reply.trim();
      const jsonMatch = /\{[\s\S]*\}/.exec(trimmed);
      if (!jsonMatch) return null;
      const parsed = JSON.parse(jsonMatch[0]) as {
        title?: unknown;
        keyPoints?: unknown;
        quiz?: unknown;
      };

      const cleanKeyPoints = Array.isArray(parsed.keyPoints)
        ? parsed.keyPoints
            .map((k) => String(k).trim())
            .filter(Boolean)
            .slice(0, 5)
        : undefined;

      const cleanQuiz: StudyQuizQuestion[] = [];
      if (Array.isArray(parsed.quiz)) {
        for (const q of parsed.quiz.slice(0, 3)) {
          if (!q || typeof q !== 'object') continue;
          const obj = q as Record<string, unknown>;
          const qText = typeof obj['question'] === 'string' ? obj['question'].trim() : '';
          const opts = Array.isArray(obj['options'])
            ? obj['options'].map((o) => String(o).trim()).filter(Boolean)
            : [];
          const ci = Number(obj['correctIndex']);
          const exp =
            typeof obj['explanation'] === 'string' ? obj['explanation'].trim() : qText;
          if (qText && opts.length >= 2 && Number.isInteger(ci) && ci >= 0 && ci < opts.length) {
            cleanQuiz.push({
              id: `q-${crypto.randomUUID().slice(0, 8)}`,
              question: qText,
              options: opts.slice(0, 4),
              correctIndex: ci,
              explanation: exp,
            });
          }
        }
      }

      return {
        ...(typeof parsed.title === 'string' && parsed.title.trim()
          ? { title: parsed.title.trim() }
          : {}),
        ...(cleanKeyPoints && cleanKeyPoints.length > 0 ? { keyPoints: cleanKeyPoints } : {}),
        ...(cleanQuiz.length > 0 ? { quizQuestions: cleanQuiz } : {}),
      };
    } catch {
      return null;
    }
  }

  async decodeDocument(input: {
    title?: string;
    fileName?: string;
    pdfBase64?: string;
    text?: string;
  }): Promise<StudyDocument> {
    const fileName = input.fileName?.trim() || null;
    const baseTitle =
      input.title?.trim() ||
      (fileName ? fileName.replace(/\.(pdf|txt|md)$/i, '') : 'Material de estudio');

    let pages: PageChunk[] = [];
    let sourceType: 'pdf' | 'text' = 'text';

    if (typeof input.pdfBase64 === 'string' && input.pdfBase64.trim().length > 0) {
      sourceType = 'pdf';
      this.setDecodeProgress({
        active: true,
        stage: 'extracting',
        message: 'Extrayendo páginas y texto completo del PDF...',
        currentBlock: 0,
        totalBlocks: 0,
        totalPages: 0,
      });

      const cleanedB64 = input.pdfBase64.replace(/^data:[^;]+;base64,/, '').trim();
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(Buffer.from(cleanedB64, 'base64'));
      } catch {
        this.setDecodeProgress({
          active: false,
          stage: 'error',
          message: 'El archivo PDF recibido no es base64 válido.',
          currentBlock: 0,
          totalBlocks: 0,
          totalPages: 0,
        });
        throw new HttpError(400, 'Archivo PDF inválido.');
      }

      if (bytes.byteLength < 8) {
        throw new HttpError(400, 'El archivo PDF está vacío o corrupto.');
      }

      try {
        const pdf = await getDocumentProxy(bytes);
        const extracted = await extractText(pdf, { mergePages: false });
        const pageTexts = Array.isArray(extracted.text)
          ? extracted.text
          : [String(extracted.text ?? '')];
        pages = pageTexts
          .map((t, i) => ({
            pageNumber: i + 1,
            text: normalizePageText(String(t ?? '')),
          }))
          .filter((p) => p.text.length > 0);
      } catch (err) {
        this.setDecodeProgress({
          active: false,
          stage: 'error',
          message: 'No se pudo leer este PDF (puede estar protegido o ser solo imagen escaneada).',
          currentBlock: 0,
          totalBlocks: 0,
          totalPages: 0,
        });
        throw new HttpError(
          400,
          err instanceof Error
            ? `No se pudo descifrar el PDF: ${err.message}`
            : 'No se pudo descifrar el PDF.'
        );
      }
    } else if (typeof input.text === 'string' && input.text.trim().length > 0) {
      sourceType = 'text';
      pages = [{ pageNumber: 1, text: normalizePageText(input.text) }];
    } else {
      throw new HttpError(400, 'Debes enviar un PDF o pegar el texto a estudiar.');
    }

    if (pages.length === 0) {
      this.setDecodeProgress({
        active: false,
        stage: 'error',
        message: 'El documento no contiene texto seleccionable para descifrar.',
        currentBlock: 0,
        totalBlocks: 0,
        totalPages: 0,
      });
      throw new HttpError(
        400,
        'No se encontró texto seleccionable en el documento (si es un PDF escaneado como imagen, copia el texto y pégalo).'
      );
    }

    const totalPages = pages[pages.length - 1]?.pageNumber ?? pages.length;
    this.setDecodeProgress({
      active: true,
      stage: 'chunking',
      message: `Detectando capítulos y secciones completas (${totalPages} ${totalPages === 1 ? 'página' : 'páginas'})...`,
      currentBlock: 0,
      totalBlocks: 0,
      totalPages,
    });

    const rawSections = segmentPagesIntoSections(pages, baseTitle);
    const allDocText = pages.map((p) => p.text).join('\n\n');
    const allDocSentences = splitSentences(allDocText);
    const totalBlocks = rawSections.length;
    const blocks: StudyBlock[] = [];

    for (let i = 0; i < rawSections.length; i += 1) {
      const sec = rawSections[i]!;
      const fullText = sec.paragraphs.join('\n\n');
      this.setDecodeProgress({
        active: true,
        stage: 'enriching',
        message: `Descifrando bloque ${i + 1}/${totalBlocks}: ${sec.title}`,
        currentBlock: i + 1,
        totalBlocks,
        totalPages,
      });

      const detKeyPoints = extractKeyPointsDeterministic(fullText, sec.title);
      const detQuiz = buildQuizDeterministic(sec.title, detKeyPoints, allDocSentences);
      const aiEnriched = await this.tryAiEnrichBlock(sec.title, fullText);

      const finalTitle = aiEnriched?.title ?? sec.title;
      const finalKeyPoints = aiEnriched?.keyPoints ?? detKeyPoints;
      const finalQuiz = aiEnriched?.quizQuestions ?? detQuiz;
      const wordCount = fullText.split(/\s+/).filter(Boolean).length;
      const estimatedReadSec = Math.max(15, Math.round((wordCount / 180) * 60));
      const pageRange =
        sourceType === 'pdf'
          ? sec.startPage === sec.endPage
            ? `Pág. ${sec.startPage}`
            : `Págs. ${sec.startPage}–${sec.endPage}`
          : `Bloque ${i + 1}`;

      blocks.push({
        id: `blk-${crypto.randomUUID().slice(0, 8)}`,
        index: i,
        title: finalTitle,
        pageRange,
        fullText,
        keyPoints: finalKeyPoints,
        estimatedReadSec,
        quizQuestions: finalQuiz,
        mastered: false,
        masteredAt: null,
      });
    }

    const now = new Date().toISOString();
    const doc: StudyDocument = {
      id: `doc-${crypto.randomUUID().slice(0, 8)}`,
      title: baseTitle,
      sourceType,
      fileName,
      totalPages,
      totalChars: allDocText.length,
      blocks,
      createdAt: now,
      updatedAt: now,
    };

    this.docs = [doc, ...this.docs];
    this.saveDocs();

    this.setDecodeProgress({
      active: false,
      stage: 'done',
      message: `Listo: ${blocks.length} bloques completos listos para estudiar.`,
      currentBlock: blocks.length,
      totalBlocks: blocks.length,
      totalPages,
    });

    this.eventBus.setIslandState({
      state: 'success',
      mood: 'orgulloso',
      statusText: 'Listo',
      badgeWord: `${blocks.length} bloques`,
      peekCard: null,
    });
    this.eventBus.publish('data.updated', { scope: 'study', docId: doc.id });

    return doc;
  }

  masterBlock(docId: string, blockId: string, mastered = true): {
    doc: StudyDocument;
    block: StudyBlock;
    xpEarned: number;
  } {
    const doc = this.getDocumentOrThrow(docId);
    const block = doc.blocks.find((b) => b.id === blockId);
    if (!block) {
      throw new HttpError(404, 'Bloque de estudio no encontrado');
    }

    const wasMastered = block.mastered;
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    block.mastered = Boolean(mastered);
    block.masteredAt = block.mastered ? nowIso : null;
    if (block.mastered && !block.nextReviewAt) {
      block.reviewStage = 1;
      block.reviewCount = block.reviewCount ?? 0;
      block.lastReviewedAt = nowIso;
      block.nextReviewAt = new Date(nowMs + 24 * 60 * 60 * 1000).toISOString();
    } else if (!block.mastered) {
      block.reviewStage = 0;
      block.nextReviewAt = null;
    }
    doc.updatedAt = nowIso;
    this.saveDocs();

    let xpEarned = 0;
    if (block.mastered && !wasMastered && this.progressionService) {
      const award = this.progressionService.awardXp(
        35,
        `Bloque dominado: ${block.title}`,
        { studyBlockMastered: true }
      );
      xpEarned = award.xpAdded;
    } else {
      this.eventBus.publish('data.updated', { scope: 'study', docId: doc.id });
    }

    return { doc, block, xpEarned };
  }

  answerQuiz(
    docId: string,
    blockId: string,
    questionId: string,
    selectedIndex: number
  ): {
    correct: boolean;
    correctIndex: number;
    explanation: string;
    xpEarned: number;
    doc: StudyDocument;
  } {
    const doc = this.getDocumentOrThrow(docId);
    const block = doc.blocks.find((b) => b.id === blockId);
    if (!block) throw new HttpError(404, 'Bloque de estudio no encontrado');
    const q = block.quizQuestions.find((item) => item.id === questionId);
    if (!q) throw new HttpError(404, 'Pregunta no encontrada');

    const correct = Number(selectedIndex) === q.correctIndex;
    let xpEarned = 0;
    if (correct && !q.answeredCorrectly) {
      q.answeredCorrectly = true;
      doc.updatedAt = new Date().toISOString();
      this.saveDocs();
      if (this.progressionService) {
        const award = this.progressionService.awardXp(
          25,
          `Quiz acertado en «${block.title}»`,
          { quizCorrect: true }
        );
        xpEarned = award.xpAdded;
      }
    }

    this.eventBus.publish('data.updated', { scope: 'study', docId: doc.id });
    return {
      correct,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      xpEarned,
      doc,
    };
  }

  async evaluateFeynman(
    docId: string,
    blockId: string,
    explanationText: string
  ): Promise<{
    scorePct: number;
    feedback: string;
    matchedConcepts: string[];
    missingConcepts: string[];
    xpEarned: number;
  }> {
    const doc = this.getDocumentOrThrow(docId);
    const block = doc.blocks.find((b) => b.id === blockId);
    if (!block) throw new HttpError(404, 'Bloque de estudio no encontrado');

    const cleanedUser = explanationText.trim();
    if (cleanedUser.length < 8) {
      throw new HttpError(400, 'Escribe o dicta al menos una frase explicando la idea principal.');
    }

    const expectedConcepts = extractKeywords(
      `${block.title} ${block.keyPoints.join(' ')} ${block.fullText.slice(0, 1200)}`
    ).slice(0, 6);

    const normalizedUser = cleanedUser
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const matchedConcepts = expectedConcepts.filter((kw) => normalizedUser.includes(kw));
    const missingConcepts = expectedConcepts.filter((kw) => !normalizedUser.includes(kw));
    const scorePct =
      expectedConcepts.length > 0
        ? Math.min(100, Math.round((matchedConcepts.length / Math.min(4, expectedConcepts.length)) * 100))
        : 80;

    let feedback =
      scorePct >= 70
        ? `¡Muy bien explicado! Cubriste los conceptos clave (${matchedConcepts.slice(0, 4).join(', ')}).`
        : scorePct >= 40
        ? `Vas por buen camino. Tocaste: ${matchedConcepts.join(', ') || 'la idea general'}. Para fijarlo al 100 %, suma algo sobre: ${missingConcepts.slice(0, 3).join(', ')}.`
        : `Buen intento de arranque. Repasa las ideas clave de arriba, especialmente: ${missingConcepts.slice(0, 3).join(', ')}.`;

    const settings = this.settingsService.getSettings();
    if (settings.aiProvider !== 'local_fallback') {
      try {
        const aiRes = await this.aiProvider.generateReply(
          settings,
          [],
          `Bloque "${block.title}". Puntos clave: ${block.keyPoints.join(' | ')}. Explicación del estudiante: "${cleanedUser}". Evalúa en máximo 2 oraciones en español qué estuvo bien y qué faltó sin rodeos.`,
          {
            systemPrompt: 'Eres Troko, tutor conciso y motivador.',
            timeoutMs: 8000,
          }
        );
        if (aiRes?.reply?.trim()) {
          feedback = aiRes.reply.trim();
        }
      } catch {
        // Keep deterministic feedback
      }
    }

    let xpEarned = 0;
    if (scorePct >= 50 && this.progressionService) {
      const award = this.progressionService.awardXp(
        30,
        `Explicación Feynman: ${block.title}`,
        { quizCorrect: true }
      );
      xpEarned = award.xpAdded;
    }

    return {
      scorePct,
      feedback,
      matchedConcepts,
      missingConcepts: missingConcepts.slice(0, 4),
      xpEarned,
    };
  }

  listDueReviews(referenceIso?: string): DueStudyReview[] {
    const refMs = referenceIso ? Date.parse(referenceIso) : Date.now();
    const nowMs = Number.isFinite(refMs) ? refMs : Date.now();
    const due: DueStudyReview[] = [];

    for (const doc of this.docs) {
      for (const block of doc.blocks) {
        if (!block.nextReviewAt) continue;
        const dueMs = Date.parse(block.nextReviewAt);
        if (Number.isFinite(dueMs) && dueMs <= nowMs) {
          due.push({
            docId: doc.id,
            docTitle: doc.title,
            blockId: block.id,
            blockTitle: block.title,
            pageRange: block.pageRange,
            reviewStage: block.reviewStage ?? 1,
            nextReviewAt: block.nextReviewAt,
            questionCount: block.quizQuestions.length,
          });
        }
      }
    }

    return due.sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt));
  }

  recordReview(
    docId: string,
    blockId: string,
    quality: StudyReviewQuality
  ): {
    doc: StudyDocument;
    block: StudyBlock;
    intervalDays: number;
    xpEarned: number;
  } {
    const doc = this.getDocumentOrThrow(docId);
    const block = doc.blocks.find((b) => b.id === blockId);
    if (!block) {
      throw new HttpError(404, 'Bloque de estudio no encontrado');
    }

    const INTERVALS = [1, 3, 7, 14];
    const currentStage = Math.max(0, block.reviewStage ?? 0);
    let nextStage = currentStage;
    if (quality === 'again') {
      nextStage = 1;
    } else if (quality === 'good') {
      nextStage = Math.min(INTERVALS.length, currentStage + 1);
    } else {
      nextStage = Math.min(INTERVALS.length, currentStage + 2);
    }

    const intervalDays = INTERVALS[Math.max(0, nextStage - 1)] ?? 1;
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    block.reviewStage = nextStage;
    block.reviewCount = (block.reviewCount ?? 0) + 1;
    block.lastReviewedAt = nowIso;
    block.nextReviewAt = new Date(nowMs + intervalDays * 24 * 60 * 60 * 1000).toISOString();
    if (!block.mastered && quality !== 'again') {
      block.mastered = true;
      block.masteredAt = nowIso;
    }
    doc.updatedAt = nowIso;
    this.saveDocs();

    let xpEarned = 0;
    if (this.progressionService) {
      const xpAmount = quality === 'again' ? 10 : quality === 'easy' ? 25 : 20;
      const award = this.progressionService.awardXp(
        xpAmount,
        `Repaso espaciado: ${block.title}`,
        { quizCorrect: quality !== 'again' }
      );
      xpEarned = award.xpAdded;
    }

    this.eventBus.publish('data.updated', { scope: 'study', docId: doc.id });
    return { doc, block, intervalDays, xpEarned };
  }

  deleteDocument(id: string): void {
    const before = this.docs.length;
    this.docs = this.docs.filter((d) => d.id !== id);
    if (this.docs.length === before) {
      throw new HttpError(404, 'Documento de estudio no encontrado');
    }
    this.saveDocs();
    this.eventBus.publish('data.updated', { scope: 'study' });
  }

  wipe(): void {
    this.docs = [];
    this.saveDocs();
    this.decodeStatus = {
      active: false,
      stage: 'idle',
      message: '',
      currentBlock: 0,
      totalBlocks: 0,
      totalPages: 0,
    };
    this.eventBus.publish('data.updated', { scope: 'study' });
  }
}
