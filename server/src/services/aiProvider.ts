import { TROKO_MOODS } from '../../../shared/types.ts';
import type {
  AiConnectionTestResult,
  AiDetectResult,
  AppSettings,
  TrokoMood,
} from '../../../shared/types.ts';

export type AiProviderSettings = Pick<
  AppSettings,
  'aiProvider' | 'aiEndpoint' | 'aiModel' | 'aiApiKey'
>;

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiGenerateOptions {
  timeoutMs?: number;
  systemPrompt?: string;
}

export interface AiGeneratedReply {
  reply: string;
  emotion?: TrokoMood;
  intent?: string;
}

const DEFAULT_OLLAMA_ENDPOINT = 'http://127.0.0.1:11434';
const DEFAULT_SYSTEM_PROMPT =
  'Eres Troko, un compañero de escritorio inteligente en español, conciso y amable.';

export function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, '');
}

export function isValidHttpEndpoint(endpoint: string): boolean {
  return endpoint.startsWith('http://') || endpoint.startsWith('https://');
}

export function resolveChatCompletionsUrl(endpoint: string): string {
  if (endpoint.endsWith('/chat/completions')) {
    return endpoint;
  }
  if (endpoint.endsWith('/v1')) {
    return `${endpoint}/chat/completions`;
  }
  return `${endpoint}/v1/chat/completions`;
}

export function tryParseStructuredResponse(rawText: string): AiGeneratedReply {
  const trimmed = rawText.trim();
  let candidate = trimmed;

  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fenceMatch && fenceMatch[1]) {
    candidate = fenceMatch[1].trim();
  }

  if (candidate.startsWith('{') && candidate.endsWith('}')) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      if (typeof parsed['reply'] === 'string' && parsed['reply'].trim().length > 0) {
        const result: AiGeneratedReply = {
          reply: parsed['reply'].trim(),
        };
        if (
          typeof parsed['emotion'] === 'string' &&
          (TROKO_MOODS as readonly string[]).includes(parsed['emotion'])
        ) {
          result.emotion = parsed['emotion'] as TrokoMood;
        }
        if (typeof parsed['intent'] === 'string' && parsed['intent'].trim().length > 0) {
          result.intent = parsed['intent'].trim();
        }
        return result;
      }
    } catch {
      // Fall back to plain text below
    }
  }

  return { reply: trimmed };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref();
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function formatFetchError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'AbortError') {
      return 'Tiempo de espera agotado';
    }
    return err.message;
  }
  return String(err);
}

export class AiProviderService {
  async detectOllama(
    endpoint = DEFAULT_OLLAMA_ENDPOINT,
    timeoutMs = 1500
  ): Promise<AiDetectResult> {
    const normalized = normalizeEndpoint(endpoint || DEFAULT_OLLAMA_ENDPOINT);
    if (!isValidHttpEndpoint(normalized)) {
      return {
        ollamaDetected: false,
        endpoint: normalized,
        models: [],
        error: 'Endpoint inválido: debe comenzar con http:// o https://',
      };
    }

    try {
      const res = await fetchWithTimeout(
        `${normalized}/api/tags`,
        { method: 'GET' },
        timeoutMs
      );
      if (!res.ok) {
        return {
          ollamaDetected: false,
          endpoint: normalized,
          models: [],
          error: `HTTP ${res.status}`,
        };
      }

      const data = (await res.json()) as Record<string, unknown>;
      const rawModels = data['models'];
      const models = Array.isArray(rawModels)
        ? rawModels
            .map((m) => {
              if (typeof m === 'object' && m !== null) {
                const rec = m as Record<string, unknown>;
                if (typeof rec['name'] === 'string') return rec['name'].trim();
                if (typeof rec['model'] === 'string') return rec['model'].trim();
              }
              return '';
            })
            .filter((name) => name.length > 0)
        : [];

      return {
        ollamaDetected: true,
        endpoint: normalized,
        models,
      };
    } catch (err) {
      return {
        ollamaDetected: false,
        endpoint: normalized,
        models: [],
        error: formatFetchError(err),
      };
    }
  }

  async testConnection(settings: AiProviderSettings): Promise<AiConnectionTestResult> {
    const start = Date.now();
    const endpoint = normalizeEndpoint(settings.aiEndpoint || '');
    const model = (settings.aiModel || '').trim() || 'llama3.2:3b';

    if (settings.aiProvider === 'local_fallback') {
      return {
        ok: true,
        provider: 'local_fallback',
        endpoint,
        model,
        latencyMs: 0,
        replyPreview: 'Motor local offline activo',
      };
    }

    if (!isValidHttpEndpoint(endpoint)) {
      return {
        ok: false,
        provider: settings.aiProvider,
        endpoint,
        model,
        latencyMs: Date.now() - start,
        error: 'Endpoint inválido: debe comenzar con http:// o https://',
      };
    }

    if (
      settings.aiProvider === 'ollama' &&
      !endpoint.endsWith('/chat/completions')
    ) {
      try {
        const tagsRes = await fetchWithTimeout(
          `${endpoint}/api/tags`,
          { method: 'GET' },
          3000
        );
        if (!tagsRes.ok) {
          return {
            ok: false,
            provider: 'ollama',
            endpoint,
            model,
            latencyMs: Date.now() - start,
            error: `Ollama respondió HTTP ${tagsRes.status}`,
          };
        }

        const tagsData = (await tagsRes.json()) as Record<string, unknown>;
        const rawModels = tagsData['models'];
        const models = Array.isArray(rawModels)
          ? rawModels
              .map((m) => {
                if (typeof m === 'object' && m !== null) {
                  const rec = m as Record<string, unknown>;
                  if (typeof rec['name'] === 'string') return rec['name'].trim();
                  if (typeof rec['model'] === 'string') return rec['model'].trim();
                }
                return '';
              })
              .filter((name) => name.length > 0)
          : [];

        if (models.length > 0 && !models.includes(model)) {
          return {
            ok: false,
            provider: 'ollama',
            endpoint,
            model,
            latencyMs: Date.now() - start,
            error: `Modelo "${model}" no encontrado en Ollama. Disponibles: ${models.slice(0, 5).join(', ')}`,
          };
        }

        const chatRes = await fetchWithTimeout(
          `${endpoint}/api/chat`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              messages: [{ role: 'user', content: 'Di OK' }],
              stream: false,
              options: { num_predict: 8, temperature: 0 },
            }),
          },
          8000
        );

        if (!chatRes.ok) {
          return {
            ok: false,
            provider: 'ollama',
            endpoint,
            model,
            latencyMs: Date.now() - start,
            error: `Ollama /api/chat respondió HTTP ${chatRes.status}`,
          };
        }

        const chatData = (await chatRes.json()) as Record<string, unknown>;
        const msg = chatData['message'] as Record<string, unknown> | undefined;
        const previewRaw =
          (msg && typeof msg['content'] === 'string' ? msg['content'] : null) ??
          (typeof chatData['response'] === 'string' ? chatData['response'] : null) ??
          'OK';

        return {
          ok: true,
          provider: 'ollama',
          endpoint,
          model,
          latencyMs: Date.now() - start,
          replyPreview: previewRaw.trim().slice(0, 120),
        };
      } catch (err) {
        return {
          ok: false,
          provider: 'ollama',
          endpoint,
          model,
          latencyMs: Date.now() - start,
          error: formatFetchError(err),
        };
      }
    }

    // llama_cpp, openai_compatible, openai (or explicit /chat/completions)
    const url = resolveChatCompletionsUrl(endpoint);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (settings.aiApiKey && settings.aiApiKey.trim().length > 0) {
      headers['Authorization'] = `Bearer ${settings.aiApiKey.trim()}`;
    }

    try {
      const res = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: 'Di OK' }],
            max_tokens: 16,
            temperature: 0,
          }),
        },
        8000
      );

      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        const errObj = data['error'] as Record<string, unknown> | string | undefined;
        const errMsg =
          typeof errObj === 'string'
            ? errObj
            : errObj && typeof errObj['message'] === 'string'
            ? errObj['message']
            : `HTTP ${res.status}`;
        return {
          ok: false,
          provider: settings.aiProvider,
          endpoint,
          model,
          latencyMs: Date.now() - start,
          error: errMsg,
        };
      }

      const choices = data['choices'];
      let preview = 'OK';
      if (Array.isArray(choices) && choices.length > 0) {
        const first = choices[0] as Record<string, unknown>;
        const msg = first['message'] as Record<string, unknown> | undefined;
        if (msg && typeof msg['content'] === 'string' && msg['content'].trim()) {
          preview = msg['content'].trim();
        }
      } else if (typeof data['response'] === 'string' && data['response'].trim()) {
        preview = data['response'].trim();
      }

      return {
        ok: true,
        provider: settings.aiProvider,
        endpoint,
        model,
        latencyMs: Date.now() - start,
        replyPreview: preview.slice(0, 120),
      };
    } catch (err) {
      return {
        ok: false,
        provider: settings.aiProvider,
        endpoint,
        model,
        latencyMs: Date.now() - start,
        error: formatFetchError(err),
      };
    }
  }

  async generateReply(
    settings: AiProviderSettings,
    history: AiChatMessage[],
    userText: string,
    options: AiGenerateOptions = {}
  ): Promise<AiGeneratedReply | null> {
    if (settings.aiProvider === 'local_fallback') {
      return null;
    }

    const baseEndpoint = normalizeEndpoint(settings.aiEndpoint || '');
    if (!isValidHttpEndpoint(baseEndpoint)) {
      return null;
    }

    const timeoutMs = options.timeoutMs ?? 8000;
    const model = (settings.aiModel || '').trim() || 'llama3.2:3b';
    const systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    const recentHistory = history.slice(-6).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentHistory,
      { role: 'user', content: userText },
    ];

    try {
      if (
        settings.aiProvider === 'ollama' &&
        !baseEndpoint.endsWith('/chat/completions')
      ) {
        const res = await fetchWithTimeout(
          `${baseEndpoint}/api/chat`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              messages,
              stream: false,
              options: { temperature: 0.4 },
            }),
          },
          timeoutMs
        );
        if (!res.ok) return null;

        const data = (await res.json()) as Record<string, unknown>;
        const msg = data['message'] as Record<string, unknown> | undefined;
        const rawText =
          (msg && typeof msg['content'] === 'string' ? msg['content'] : null) ??
          (typeof data['response'] === 'string' ? data['response'] : null);

        if (!rawText || !rawText.trim()) return null;
        return tryParseStructuredResponse(rawText);
      }

      const url = resolveChatCompletionsUrl(baseEndpoint);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (settings.aiApiKey && settings.aiApiKey.trim().length > 0) {
        headers['Authorization'] = `Bearer ${settings.aiApiKey.trim()}`;
      }

      const res = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.4,
          }),
        },
        timeoutMs
      );
      if (!res.ok) return null;

      const data = (await res.json()) as Record<string, unknown>;
      const choices = data['choices'];
      let rawText: string | null = null;
      if (Array.isArray(choices) && choices.length > 0) {
        const first = choices[0] as Record<string, unknown>;
        const msg = first['message'] as Record<string, unknown> | undefined;
        if (msg && typeof msg['content'] === 'string') {
          rawText = msg['content'];
        }
      }
      if (!rawText && typeof data['response'] === 'string') {
        rawText = data['response'];
      }

      if (!rawText || !rawText.trim()) return null;
      return tryParseStructuredResponse(rawText);
    } catch {
      return null;
    }
  }
}
