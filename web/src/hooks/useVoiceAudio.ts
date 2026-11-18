import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence?: number;
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  length: number;
  isFinal: boolean;
}

interface SpeechRecognitionEventLike {
  resultIndex?: number;
  results: {
    [index: number]: SpeechRecognitionResultLike;
    length: number;
  };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: ((ev: Event) => void) | null;
  onend: ((ev: Event) => void) | null;
  onerror: ((ev: { error: string; message?: string }) => void) | null;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

export interface UseVoiceAudioOptions {
  voiceEnabled: boolean;
  wakeWordEnabled: boolean;
  wakeWord: string;
  onListenStart: (transcript?: string) => void;
  onTranscriptUpdate: (transcript: string) => void;
  onVoiceCommand: (text: string) => Promise<void>;
  onMicDenied: (reason: string) => void;
  onSpeakStart: () => void;
  onSpeakEnd: () => void;
}

export function useVoiceAudio({
  voiceEnabled,
  wakeWordEnabled,
  wakeWord,
  onListenStart,
  onTranscriptUpdate,
  onVoiceCommand,
  onMicDenied,
  onSpeakStart,
  onSpeakEnd,
}: UseVoiceAudioOptions) {
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [micError, setMicError] = useState<string | null>(null);

  const voiceEnabledRef = useRef(voiceEnabled);
  voiceEnabledRef.current = voiceEnabled;
  const prevVoiceEnabledRef = useRef(voiceEnabled);

  const callbacksRef = useRef({
    onListenStart,
    onTranscriptUpdate,
    onVoiceCommand,
    onMicDenied,
    onSpeakStart,
    onSpeakEnd,
  });
  callbacksRef.current = {
    onListenStart,
    onTranscriptUpdate,
    onVoiceCommand,
    onMicDenied,
    onSpeakStart,
    onSpeakEnd,
  };

  const activeRecRef = useRef<SpeechRecognitionLike | null>(null);
  const wakeArmedRef = useRef(false);

  const attachHandlers = useCallback(
    (rec: SpeechRecognitionLike, isPushToTalk: boolean) => {
      rec.lang = 'es-ES';
      rec.continuous = !isPushToTalk;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onstart = () => {
        if (isPushToTalk) {
          setIsListening(true);
          setMicError(null);
          callbacksRef.current.onListenStart();
        }
      };

      rec.onerror = (ev) => {
        const errCode = String(ev?.error ?? '');
        if (
          errCode === 'not-allowed' ||
          errCode === 'service-not-allowed' ||
          errCode === 'permission-denied'
        ) {
          setIsListening(false);
          const msg = 'Permiso de micrófono denegado';
          setMicError(msg);
          callbacksRef.current.onMicDenied(msg);
        }
      };

      rec.onend = () => {
        if (isPushToTalk) {
          setIsListening(false);
        }
      };

      rec.onresult = (ev: SpeechRecognitionEventLike) => {
        const len = ev.results?.length ?? 0;
        if (len === 0) return;
        const lastResult = ev.results[len - 1];
        if (!lastResult || !lastResult[0]) return;

        const rawTranscript = String(lastResult[0].transcript ?? '').trim();
        const isFinal = Boolean(lastResult.isFinal);
        if (!rawTranscript) return;

        setLiveTranscript(rawTranscript);
        callbacksRef.current.onTranscriptUpdate(rawTranscript);

        const wakeRegex = new RegExp(
          `^(?:oye\\s+)?${wakeWord || 'troko'}\\b[,:\\s]*(.*)$`,
          'i'
        );
        const wakeMatch = wakeRegex.exec(rawTranscript);

        if (!isFinal) {
          setIsListening(true);
          callbacksRef.current.onListenStart(rawTranscript);
          return;
        }

        // Final result
        if (wakeMatch) {
          const remainder = (wakeMatch[1] ?? '').trim();
          if (!remainder) {
            // Wake word only ("Troko" / "Oye Troko") -> stay in Escuchando state
            wakeArmedRef.current = true;
            setIsListening(true);
            callbacksRef.current.onListenStart(rawTranscript);
            return;
          }
          wakeArmedRef.current = false;
          setIsListening(false);
          void callbacksRef.current.onVoiceCommand(remainder);
          return;
        }

        // Push-to-talk or armed wake word session
        wakeArmedRef.current = false;
        setIsListening(false);
        void callbacksRef.current.onVoiceCommand(rawTranscript);
      };
    },
    [wakeWord]
  );

  // Initialize passive wake-word listener when wakeWordEnabled is true
  useEffect(() => {
    if (!wakeWordEnabled) return;
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    attachHandlers(rec, false);
    activeRecRef.current = rec;
    return () => {
      try {
        rec.abort();
      } catch {
        // ignore
      }
    };
  }, [wakeWordEnabled, attachHandlers]);

  const togglePushToTalk = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      const msg = 'Reconocimiento de voz no disponible en este navegador';
      setMicError(msg);
      callbacksRef.current.onMicDenied(msg);
      return;
    }

    if (isListening && activeRecRef.current) {
      try {
        activeRecRef.current.stop();
      } catch {
        // ignore
      }
      setIsListening(false);
      return;
    }

    const rec = new Ctor();
    attachHandlers(rec, true);
    activeRecRef.current = rec;
    try {
      rec.start();
    } catch {
      const msg = 'Permiso de micrófono denegado';
      setMicError(msg);
      callbacksRef.current.onMicDenied(msg);
    }
  }, [isListening, attachHandlers]);

  const cancelSpeech = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    callbacksRef.current.onSpeakEnd();
  }, []);

  // Cancel active TTS immediately if voiceEnabled transitions from true to false
  useEffect(() => {
    if (prevVoiceEnabledRef.current && !voiceEnabled) {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      callbacksRef.current.onSpeakEnd();
    }
    prevVoiceEnabledRef.current = voiceEnabled;
  }, [voiceEnabled]);

  const speakText = useCallback((text: string) => {
    if (!voiceEnabledRef.current) return;
    if (
      typeof window === 'undefined' ||
      !window.speechSynthesis ||
      typeof window.SpeechSynthesisUtterance === 'undefined'
    ) {
      return;
    }
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.rate = 1.02;
    utterance.onstart = () => {
      callbacksRef.current.onSpeakStart();
    };
    utterance.onend = () => {
      callbacksRef.current.onSpeakEnd();
    };
    utterance.onerror = () => {
      callbacksRef.current.onSpeakEnd();
    };
    window.speechSynthesis.speak(utterance);
  }, []);

  return {
    isListening,
    liveTranscript,
    setLiveTranscript,
    micError,
    togglePushToTalk,
    speakText,
    cancelSpeech,
  };
}
