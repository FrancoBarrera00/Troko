import {
  Award,
  BookOpen,
  CheckCircle2,
  Crosshair,
  FileText,
  HelpCircle,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  DueStudyReview,
  StudyBlock,
  StudyDecodeProgress,
  StudyDocument,
  StudyReviewQuality,
} from '../../../../shared/types.ts';
import { apiClient } from '../../api/client.ts';

export interface StudyDecoderViewProps {
  studyDocs: StudyDocument[];
  decodeStatus: StudyDecodeProgress | null;
  dueStudyReviews?: DueStudyReview[];
  onRefreshAll: () => Promise<void>;
  onSwitchToFocus?: () => void;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result);
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
    reader.readAsDataURL(file);
  });
}

function formatSecShort(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.round(sec / 60);
  return `${m} min`;
}

export function StudyDecoderView({
  studyDocs,
  decodeStatus,
  dueStudyReviews = [],
  onRefreshAll,
  onSwitchToFocus,
}: StudyDecoderViewProps) {
  const [titleInput, setTitleInput] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showPasteBox, setShowPasteBox] = useState(true);
  const [decoding, setDecoding] = useState(false);
  const [liveProgress, setLiveProgress] = useState<StudyDecodeProgress | null>(decodeStatus);
  const [decodeError, setDecodeError] = useState<string | null>(null);

  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [quizFeedback, setQuizFeedback] = useState<
    Record<string, { selected: number; correct: boolean; explanation: string; xpEarned: number }>
  >({});
  const [feynmanText, setFeynmanText] = useState('');
  const [feynmanResult, setFeynmanResult] = useState<{
    scorePct: number;
    feedback: string;
    matchedConcepts: string[];
    missingConcepts: string[];
    xpEarned: number;
  } | null>(null);
  const [feynmanLoading, setFeynmanLoading] = useState(false);
  const [speakingBlockId, setSpeakingBlockId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (decodeStatus) {
      setLiveProgress(decodeStatus);
    }
  }, [decodeStatus]);

  useEffect(() => {
    if (studyDocs.length === 0) {
      setSelectedDocId(null);
      setSelectedBlockId(null);
      return;
    }
    const existing = studyDocs.find((d) => d.id === selectedDocId);
    const activeDoc = existing ?? studyDocs[0]!;
    if (activeDoc.id !== selectedDocId) {
      setSelectedDocId(activeDoc.id);
      setSelectedBlockId(activeDoc.blocks[0]?.id ?? null);
    } else if (!activeDoc.blocks.some((b) => b.id === selectedBlockId)) {
      setSelectedBlockId(activeDoc.blocks[0]?.id ?? null);
    }
  }, [studyDocs, selectedDocId, selectedBlockId]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const stopSpeech = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingBlockId(null);
  };

  const toggleSpeakBlock = (block: StudyBlock) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (speakingBlockId === block.id) {
      stopSpeech();
      return;
    }
    window.speechSynthesis.cancel();
    const script = `${block.title}. Puntos clave: ${block.keyPoints.join('. ')}. Texto completo: ${block.fullText}`;
    const utter = new SpeechSynthesisUtterance(script.slice(0, 4500));
    utter.lang = 'es-ES';
    utter.rate = 1.03;
    utter.onend = () => setSpeakingBlockId(null);
    utter.onerror = () => setSpeakingBlockId(null);
    setSpeakingBlockId(block.id);
    window.speechSynthesis.speak(utter);
  };

  const handleDecode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (decoding) return;
    if (!selectedFile && !pastedText.trim()) {
      setDecodeError('Sube un archivo PDF/TXT o pega un resumen para descifrarlo.');
      return;
    }

    setDecodeError(null);
    setDecoding(true);
    setLiveProgress({
      active: true,
      stage: 'extracting',
      message: selectedFile
        ? `Leyendo «${selectedFile.name}»...`
        : 'Segmentando texto en bloques completos...',
      currentBlock: 0,
      totalBlocks: 0,
      totalPages: 0,
    });

    const pollTimer = window.setInterval(() => {
      void apiClient
        .getStudyStatus()
        .then((res) => {
          if (res.decodeStatus) setLiveProgress(res.decodeStatus);
        })
        .catch(() => {});
    }, 350);

    try {
      let payload: {
        title?: string;
        fileName?: string;
        pdfBase64?: string;
        text?: string;
      } = {
        title: titleInput.trim() || undefined,
      };

      if (selectedFile) {
        const lower = selectedFile.name.toLowerCase();
        if (lower.endsWith('.pdf')) {
          const b64 = await readFileAsBase64(selectedFile);
          payload = {
            ...payload,
            fileName: selectedFile.name,
            pdfBase64: b64,
          };
        } else {
          const txt = await selectedFile.text();
          payload = {
            ...payload,
            fileName: selectedFile.name,
            text: txt,
          };
        }
      } else {
        payload.text = pastedText;
      }

      const res = await apiClient.decodeStudyDocument(payload);
      setLiveProgress(res.decodeStatus);
      setSelectedDocId(res.doc.id);
      setSelectedBlockId(res.doc.blocks[0]?.id ?? null);
      setSelectedFile(null);
      setPastedText('');
      setTitleInput('');
      setShowPasteBox(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await onRefreshAll();
    } catch (err) {
      setDecodeError(err instanceof Error ? err.message : 'No se pudo descifrar el material.');
    } finally {
      window.clearInterval(pollTimer);
      setDecoding(false);
    }
  };

  const activeDoc = studyDocs.find((d) => d.id === selectedDocId) ?? studyDocs[0] ?? null;
  const activeBlock =
    activeDoc?.blocks.find((b) => b.id === selectedBlockId) ?? activeDoc?.blocks[0] ?? null;

  const masteredCount = activeDoc ? activeDoc.blocks.filter((b) => b.mastered).length : 0;

  const handleToggleMaster = async () => {
    if (!activeDoc || !activeBlock) return;
    await apiClient.masterStudyBlock(activeDoc.id, activeBlock.id, !activeBlock.mastered);
    await onRefreshAll();
  };

  const handleFocusOnBlock = async () => {
    if (!activeBlock) return;
    await apiClient.startFocus({
      label: `Estudio: ${activeBlock.title}`.slice(0, 60),
    });
    await onRefreshAll();
    onSwitchToFocus?.();
  };

  const handleAnswerQuiz = async (questionId: string, optionIdx: number) => {
    if (!activeDoc || !activeBlock) return;
    const res = await apiClient.answerStudyQuiz(
      activeDoc.id,
      activeBlock.id,
      questionId,
      optionIdx
    );
    setQuizFeedback((prev) => ({
      ...prev,
      [questionId]: {
        selected: optionIdx,
        correct: res.correct,
        explanation: res.explanation,
        xpEarned: res.xpEarned,
      },
    }));
    await onRefreshAll();
  };

  const handleFeynmanCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDoc || !activeBlock || feynmanLoading) return;
    setFeynmanLoading(true);
    try {
      const res = await apiClient.evaluateStudyFeynman(
        activeDoc.id,
        activeBlock.id,
        feynmanText
      );
      setFeynmanResult(res);
      await onRefreshAll();
    } catch (err) {
      setFeynmanResult({
        scorePct: 0,
        feedback: err instanceof Error ? err.message : 'Escribe un poco más para evaluarlo.',
        matchedConcepts: [],
        missingConcepts: [],
        xpEarned: 0,
      });
    } finally {
      setFeynmanLoading(false);
    }
  };

  const progressPct =
    liveProgress && liveProgress.totalBlocks > 0
      ? Math.round((liveProgress.currentBlock / liveProgress.totalBlocks) * 100)
      : liveProgress?.stage === 'chunking'
      ? 25
      : liveProgress?.stage === 'extracting'
      ? 12
      : 0;

  const handleRecordReview = async (
    docId: string,
    blockId: string,
    quality: StudyReviewQuality
  ) => {
    await apiClient.recordStudyReview(docId, blockId, quality);
    await onRefreshAll();
  };

  return (
    <div
      data-testid="study-section"
      style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
    >
      {/* Spaced Repetition Due Reviews */}
      {dueStudyReviews.length > 0 && (
        <div
          className="card"
          data-testid="spaced-repetition-card"
          style={{
            display: 'grid',
            gap: '8px',
            border: '1px solid rgba(182, 242, 58, 0.32)',
            background: 'rgba(182, 242, 58, 0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '12.5px', color: 'var(--cream)' }}>
              Repasos espaciados de hoy ({dueStudyReviews.length})
            </strong>
            <span style={{ fontSize: '11px', color: 'var(--lime)' }}>+20 XP c/u</span>
          </div>
          {dueStudyReviews.slice(0, 4).map((rev) => (
            <div
              key={`${rev.docId}-${rev.blockId}`}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 9px',
                borderRadius: '10px',
                background: 'rgba(0,0,0,0.28)',
                border: '1px solid var(--line)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--cream)' }}>
                  {rev.blockTitle}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                  {rev.docTitle} · {rev.pageRange} · Etapa {rev.reviewStage}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ fontSize: '10.5px', padding: '4px 7px' }}
                  onClick={() => {
                    setSelectedDocId(rev.docId);
                    setSelectedBlockId(rev.blockId);
                  }}
                >
                  Abrir
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ fontSize: '10.5px', padding: '4px 7px', color: '#FF9EA1' }}
                  onClick={() => void handleRecordReview(rev.docId, rev.blockId, 'again')}
                >
                  Otra vez (1d)
                </button>
                <button
                  type="button"
                  className="btn-lime"
                  style={{ fontSize: '10.5px', padding: '4px 8px' }}
                  onClick={() => void handleRecordReview(rev.docId, rev.blockId, 'good')}
                >
                  Bien
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ fontSize: '10.5px', padding: '4px 7px', color: '#B6F23A' }}
                  onClick={() => void handleRecordReview(rev.docId, rev.blockId, 'easy')}
                >
                  Fácil (+25)
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload / Paste Decoder Card */}
      <form className="card" data-testid="study-uploader" onSubmit={(e) => void handleDecode(e)}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <BookOpen size={15} color="#B6F23A" />
            <strong style={{ fontSize: '13px', color: 'var(--cream)' }}>
              Descifrador de PDF y Resúmenes sin pérdida
            </strong>
          </div>
          {studyDocs.length > 0 && (
            <button
              type="button"
              className="btn-ghost"
              style={{ fontSize: '11px', padding: '3px 8px' }}
              onClick={() => setShowPasteBox((v) => !v)}
            >
              {showPasteBox ? 'Ocultar carga' : '+ Nuevo material'}
            </button>
          )}
        </div>

        {(showPasteBox || studyDocs.length === 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                className="input"
                data-testid="study-title-input"
                placeholder="Título opcional (ej. Resumen Biología Cap. 2)"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                style={{ flex: 1, minWidth: '180px' }}
              />
              <label
                className="btn-ghost"
                style={{ cursor: 'pointer', fontSize: '12px', padding: '7px 10px' }}
              >
                <Upload size={13} />
                <span>{selectedFile ? selectedFile.name : 'Subir .PDF / .TXT'}</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                  data-testid="study-file-input"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setSelectedFile(file);
                    if (file && !titleInput.trim()) {
                      setTitleInput(file.name.replace(/\.(pdf|txt|md)$/i, ''));
                    }
                  }}
                />
              </label>
            </div>

            {!selectedFile && (
              <textarea
                rows={4}
                className="input"
                data-testid="study-text-input"
                placeholder="O pega acá un resumen largo (ej. generado con Google / NotebookLM / tus apuntes). Troko lo divide en bloques ordenados conservando el 100 % del texto + mapa de ideas + audio + quiz."
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                style={{ resize: 'vertical', fontSize: '12px', lineHeight: 1.4 }}
              />
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <span className="sub" style={{ fontSize: '11px' }}>
                Cada bloque guarda todo su texto original, sin recortar información.
              </span>
              <button
                type="submit"
                className="btn-lime"
                data-testid="study-decode-btn"
                disabled={decoding || (!selectedFile && !pastedText.trim())}
              >
                {decoding ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
                <span>{decoding ? 'Descifrando...' : 'Descifrar en bloques'}</span>
              </button>
            </div>
          </div>
        )}

        {(decoding || (liveProgress && liveProgress.active)) && (
          <div
            data-testid="study-decode-progress"
            style={{
              marginTop: '8px',
              padding: '8px 10px',
              borderRadius: '10px',
              background: 'rgba(182, 242, 58, 0.08)',
              border: '1px solid rgba(182, 242, 58, 0.25)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '5px' }}>
              <span style={{ color: '#B6F23A', fontWeight: 600 }}>
                {liveProgress?.message || 'Procesando documento...'}
              </span>
              <span className="mono sub">{progressPct}%</span>
            </div>
            <div style={{ height: '5px', borderRadius: '999px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.max(8, progressPct)}%`,
                  height: '100%',
                  background: '#B6F23A',
                  transition: 'width 200ms ease',
                }}
              />
            </div>
          </div>
        )}

        {decodeError && (
          <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#FF5A5F' }}>{decodeError}</p>
        )}
      </form>

      {/* Decoded Document & Block Explorer */}
      {activeDoc && (
        <div
          data-testid="study-doc-viewer"
          style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
        >
          {/* Doc pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
            {studyDocs.map((doc) => {
              const isSelected = doc.id === activeDoc.id;
              const done = doc.blocks.filter((b) => b.mastered).length;
              return (
                <button
                  key={doc.id}
                  type="button"
                  className={isSelected ? 'btn-lime' : 'btn-ghost'}
                  style={{ fontSize: '11px', padding: '5px 9px' }}
                  onClick={() => {
                    setSelectedDocId(doc.id);
                    setSelectedBlockId(doc.blocks[0]?.id ?? null);
                    setFeynmanResult(null);
                  }}
                >
                  <FileText size={12} />
                  <span>{doc.title}</span>
                  <span className="mono" style={{ opacity: 0.85 }}>
                    ({done}/{doc.blocks.length})
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              className="btn-ghost"
              title="Eliminar este material"
              style={{ fontSize: '11px', padding: '5px 8px', marginLeft: 'auto' }}
              onClick={async () => {
                await apiClient.deleteStudyDoc(activeDoc.id);
                await onRefreshAll();
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>

          {/* Chapter / Block Outline Map */}
          <div className="card" style={{ padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span className="eyebrow">
                Mapa de bloques · {activeDoc.totalPages} {activeDoc.totalPages === 1 ? 'pág.' : 'págs.'} ·{' '}
                {masteredCount}/{activeDoc.blocks.length} dominados
              </span>
              <span className="sub mono" style={{ fontSize: '11px' }}>
                {activeDoc.totalChars.toLocaleString('es-ES')} caracteres intactos
              </span>
            </div>
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
              {activeDoc.blocks.map((blk, i) => {
                const isSel = blk.id === activeBlock?.id;
                return (
                  <button
                    key={blk.id}
                    type="button"
                    data-testid={`study-block-pill-${i}`}
                    onClick={() => {
                      setSelectedBlockId(blk.id);
                      setFeynmanResult(null);
                      setFeynmanText('');
                    }}
                    className={isSel ? 'btn-lime' : 'btn-ghost'}
                    style={{
                      fontSize: '11px',
                      padding: '5px 9px',
                      whiteSpace: 'nowrap',
                      borderColor: blk.mastered && !isSel ? 'rgba(182, 242, 58, 0.45)' : undefined,
                    }}
                  >
                    {blk.mastered && <CheckCircle2 size={12} />}
                    <span>
                      {i + 1}. {blk.title.slice(0, 26)}
                      {blk.title.length > 26 ? '…' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Block Deep Viewer */}
          {activeBlock && (
            <article
              className="card"
              data-testid="study-block-active"
              style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '10px',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <span className="eyebrow">
                    Bloque {activeBlock.index + 1}/{activeDoc.blocks.length} · {activeBlock.pageRange} · ~
                    {formatSecShort(activeBlock.estimatedReadSec)}
                  </span>
                  <h3 style={{ margin: '2px 0 0', fontSize: '15px', color: 'var(--cream)' }}>
                    {activeBlock.title}
                  </h3>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn-ghost"
                    data-testid="study-focus-block-btn"
                    style={{ fontSize: '11px', padding: '5px 8px' }}
                    onClick={() => void handleFocusOnBlock()}
                  >
                    <Crosshair size={12} />
                    <span>Enfocar este bloque</span>
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    data-testid="study-tts-btn"
                    style={{ fontSize: '11px', padding: '5px 8px' }}
                    onClick={() => toggleSpeakBlock(activeBlock)}
                  >
                    {speakingBlockId === activeBlock.id ? (
                      <>
                        <VolumeX size={12} />
                        <span>Detener audio</span>
                      </>
                    ) : (
                      <>
                        <Volume2 size={12} />
                        <span>Escuchar bloque</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className={activeBlock.mastered ? 'btn-lime' : 'btn-ghost'}
                    data-testid="study-master-btn"
                    style={{ fontSize: '11px', padding: '5px 9px' }}
                    onClick={() => void handleToggleMaster()}
                  >
                    <Award size={12} />
                    <span>
                      {activeBlock.mastered ? 'Dominado ✓' : 'Marcar dominado (+35 XP)'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Key Points Anchor */}
              {activeBlock.keyPoints.length > 0 && (
                <div
                  data-testid="study-keypoints"
                  style={{
                    padding: '9px 11px',
                    borderRadius: '10px',
                    background: 'rgba(139, 92, 246, 0.1)',
                    border: '1px solid rgba(139, 92, 246, 0.25)',
                  }}
                >
                  <div className="eyebrow" style={{ marginBottom: '5px', color: '#C4B5FD' }}>
                    Ideas clave del bloque (para ubicar tu mente rápido)
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '16px', display: 'grid', gap: '4px', fontSize: '12px' }}>
                    {activeBlock.keyPoints.map((kp, idx) => (
                      <li key={idx}>{kp}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Full Lossless Content */}
              <div
                data-testid="study-full-text"
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  maxHeight: '220px',
                  overflowY: 'auto',
                  display: 'grid',
                  gap: '8px',
                }}
              >
                <div className="eyebrow" style={{ color: '#B6F23A' }}>
                  Contenido completo (100 % sin recortar)
                </div>
                {activeBlock.fullText.split('\n\n').map((para, idx) => (
                  <p key={idx} style={{ margin: 0, fontSize: '12.5px', lineHeight: 1.5, color: '#F2EBD9' }}>
                    {para}
                  </p>
                ))}
              </div>

              {/* Active Recall Quiz */}
              {activeBlock.quizQuestions.length > 0 && (
                <div
                  data-testid="study-quiz-box"
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: 'rgba(88, 178, 255, 0.07)',
                    border: '1px solid rgba(88, 178, 255, 0.22)',
                    display: 'grid',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <HelpCircle size={14} color="#58B2FF" />
                    <span className="eyebrow" style={{ color: '#58B2FF' }}>
                      Active Recall · Quiz relámpago (+25 XP por acierto)
                    </span>
                  </div>
                  {activeBlock.quizQuestions.map((q, qIdx) => {
                    const fb = quizFeedback[q.id];
                    return (
                      <div key={q.id} style={{ display: 'grid', gap: '5px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600 }}>
                          {qIdx + 1}. {q.question}
                          {q.answeredCorrectly && ' ✓'}
                        </div>
                        <div style={{ display: 'grid', gap: '4px' }}>
                          {q.options.map((opt, oIdx) => {
                            const isPicked = fb?.selected === oIdx;
                            const isCorrect = isPicked && fb?.correct;
                            const isWrong = isPicked && !fb?.correct;
                            return (
                              <button
                                key={oIdx}
                                type="button"
                                data-testid={`study-quiz-option-${qIdx}-${oIdx}`}
                                className="btn-ghost"
                                onClick={() => void handleAnswerQuiz(q.id, oIdx)}
                                style={{
                                  justifyContent: 'flex-start',
                                  textAlign: 'left',
                                  fontSize: '11.5px',
                                  padding: '6px 9px',
                                  borderColor: isCorrect
                                    ? '#B6F23A'
                                    : isWrong
                                    ? '#FF5A5F'
                                    : undefined,
                                  color: isCorrect ? '#B6F23A' : isWrong ? '#FF5A5F' : undefined,
                                }}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                        {fb && (
                          <div
                            data-testid={`study-quiz-feedback-${qIdx}`}
                            style={{
                              fontSize: '11px',
                              color: fb.correct ? '#B6F23A' : '#F5A623',
                            }}
                          >
                            {fb.correct
                              ? `¡Correcto!${fb.xpEarned > 0 ? ` +${fb.xpEarned} XP` : ''} — `
                              : 'Pista: '}
                            {fb.explanation}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Feynman Mode */}
              <form
                data-testid="study-feynman-box"
                onSubmit={(e) => void handleFeynmanCheck(e)}
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  display: 'grid',
                  gap: '7px',
                }}
              >
                <span className="eyebrow">
                  Técnica Feynman · Explícalo con tus propias palabras (+30 XP si ≥ 50 %)
                </span>
                <textarea
                  rows={2}
                  className="input"
                  data-testid="study-feynman-input"
                  placeholder="¿Cómo le explicarías este bloque en voz simple a alguien que no lo leyó?"
                  value={feynmanText}
                  onChange={(e) => setFeynmanText(e.target.value)}
                  style={{ fontSize: '12px', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="submit"
                    className="btn-lime"
                    data-testid="study-feynman-btn"
                    disabled={feynmanLoading || feynmanText.trim().length < 8}
                    style={{ fontSize: '11.5px', padding: '6px 10px' }}
                  >
                    {feynmanLoading ? 'Evaluando...' : 'Comprobar comprensión'}
                  </button>
                </div>
                {feynmanResult && (
                  <div
                    data-testid="study-feynman-result"
                    style={{
                      fontSize: '12px',
                      color: feynmanResult.scorePct >= 50 ? '#B6F23A' : '#F5A623',
                    }}
                  >
                    <strong>Cobertura: {feynmanResult.scorePct}%</strong>{' '}
                    {feynmanResult.xpEarned > 0 && `(+${feynmanResult.xpEarned} XP) `}·{' '}
                    {feynmanResult.feedback}
                  </div>
                )}
              </form>
            </article>
          )}
        </div>
      )}
    </div>
  );
}
