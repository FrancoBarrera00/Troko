export interface BridgeServiceOptions {
  fetchImpl?: typeof fetch;
  geocodingBaseUrl?: string;
  forecastBaseUrl?: string;
  tavilyBaseUrl?: string;
  telegramBaseUrl?: string;
  timeoutMs?: number;
}

export interface WeatherResult {
  ok: boolean;
  city: string;
  country?: string;
  temperature?: number;
  apparentTemperature?: number;
  windSpeed?: number;
  unitSymbol: '°C' | '°F';
  windUnit: 'km/h' | 'mph';
  weatherDescription: string;
  summary: string;
  error?: string;
}

export interface TavilySearchResultItem {
  title: string;
  url: string;
  content: string;
}

export interface TavilyResult {
  ok: boolean;
  query: string;
  answer?: string;
  results: TavilySearchResultItem[];
  summary: string;
  error?: string;
}

export interface TelegramSendResult {
  ok: boolean;
  messageId?: number;
  summary: string;
  error?: string;
}

const DEFAULT_GEOCODING_URL = 'https://geocoding-api.open-meteo.com';
const DEFAULT_FORECAST_URL = 'https://api.open-meteo.com';
const DEFAULT_TAVILY_URL = 'https://api.tavily.com';
const DEFAULT_TELEGRAM_URL = 'https://api.telegram.org';
const DEFAULT_TIMEOUT_MS = 5000;

export function describeWmoWeatherCode(code: number | undefined): string {
  switch (code) {
    case 0:
      return 'Despejado';
    case 1:
      return 'Mayormente despejado';
    case 2:
      return 'Parcialmente nublado';
    case 3:
      return 'Nublado';
    case 45:
    case 48:
      return 'Niebla';
    case 51:
    case 53:
    case 55:
      return 'Llovizna';
    case 56:
    case 57:
      return 'Llovizna helada';
    case 61:
      return 'Lluvia ligera';
    case 63:
      return 'Lluvia moderada';
    case 65:
      return 'Lluvia intensa';
    case 66:
    case 67:
      return 'Lluvia helada';
    case 71:
      return 'Nieve ligera';
    case 73:
      return 'Nieve moderada';
    case 75:
      return 'Nieve intensa';
    case 77:
      return 'Granizo fino';
    case 80:
    case 81:
    case 82:
      return 'Chubascos';
    case 85:
    case 86:
      return 'Chubascos de nieve';
    case 95:
      return 'Tormenta eléctrica';
    case 96:
    case 99:
      return 'Tormenta con granizo';
    default:
      return 'Condición variable';
  }
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export class BridgeService {
  private readonly fetchImpl?: typeof fetch;
  private readonly geocodingBaseUrl: string;
  private readonly forecastBaseUrl: string;
  private readonly tavilyBaseUrl: string;
  private readonly telegramBaseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: BridgeServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl;
    this.geocodingBaseUrl = stripTrailingSlash(
      options.geocodingBaseUrl ?? DEFAULT_GEOCODING_URL
    );
    this.forecastBaseUrl = stripTrailingSlash(
      options.forecastBaseUrl ?? DEFAULT_FORECAST_URL
    );
    this.tavilyBaseUrl = stripTrailingSlash(
      options.tavilyBaseUrl ?? DEFAULT_TAVILY_URL
    );
    this.telegramBaseUrl = stripTrailingSlash(
      options.telegramBaseUrl ?? DEFAULT_TELEGRAM_URL
    );
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private async fetchJson<T>(
    url: string,
    init?: RequestInit
  ): Promise<{ status: number; ok: boolean; data: T; parseError?: boolean }> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const doFetch = this.fetchImpl ?? globalThis.fetch;
      const response = await doFetch(url, {
        ...init,
        signal: controller.signal,
      });
      const text = await response.text();
      let data: unknown = {};
      let parseError = false;
      if (text.trim().length > 0) {
        try {
          data = JSON.parse(text) as unknown;
        } catch {
          data = {};
          parseError = true;
        }
      }
      return {
        status: response.status,
        ok: response.ok && !parseError,
        data: data as T,
        ...(parseError ? { parseError: true } : {}),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async getWeather(
    city: string,
    units: 'metric' | 'imperial' = 'metric'
  ): Promise<WeatherResult> {
    const trimmedCity = city.trim() || 'Madrid';
    const unitSymbol: '°C' | '°F' = units === 'imperial' ? '°F' : '°C';
    const windUnit: 'km/h' | 'mph' = units === 'imperial' ? 'mph' : 'km/h';

    try {
      const geoUrl = `${this.geocodingBaseUrl}/v1/search?name=${encodeURIComponent(trimmedCity)}&count=1&language=es&format=json`;
      const geoRes = await this.fetchJson<{
        results?: Array<{
          name?: string;
          country?: string;
          latitude?: number;
          longitude?: number;
        }>;
      }>(geoUrl, { method: 'GET' });

      if (!geoRes.ok) {
        const msg = geoRes.parseError
          ? 'Respuesta inválida del servidor.'
          : `Error de geocodificación (HTTP ${geoRes.status})`;
        return {
          ok: false,
          city: trimmedCity,
          unitSymbol,
          windUnit,
          weatherDescription: 'No disponible',
          summary: `No pude consultar el clima de ${trimmedCity}: ${msg}`,
          error: msg,
        };
      }

      const first = geoRes.data.results?.[0];
      if (
        !first ||
        typeof first.latitude !== 'number' ||
        typeof first.longitude !== 'number'
      ) {
        const msg = `No encontré la ubicación "${trimmedCity}"`;
        return {
          ok: false,
          city: trimmedCity,
          unitSymbol,
          windUnit,
          weatherDescription: 'Desconocido',
          summary: `No encontré información climática para "${trimmedCity}".`,
          error: msg,
        };
      }

      const resolvedCity =
        typeof first.name === 'string' && first.name.trim()
          ? first.name.trim()
          : trimmedCity;
      const country =
        typeof first.country === 'string' && first.country.trim()
          ? first.country.trim()
          : undefined;

      const tempParam = units === 'imperial' ? 'fahrenheit' : 'celsius';
      const windParam = units === 'imperial' ? 'mph' : 'kmh';
      const forecastUrl =
        `${this.forecastBaseUrl}/v1/forecast?latitude=${first.latitude}&longitude=${first.longitude}` +
        `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m` +
        `&temperature_unit=${tempParam}&wind_speed_unit=${windParam}&timezone=auto`;

      const forecastRes = await this.fetchJson<{
        current?: {
          temperature_2m?: number;
          apparent_temperature?: number;
          weather_code?: number;
          wind_speed_10m?: number;
        };
      }>(forecastUrl, { method: 'GET' });

      if (!forecastRes.ok || !forecastRes.data.current) {
        const msg = forecastRes.parseError
          ? 'Respuesta inválida del servidor.'
          : `Error de pronóstico (HTTP ${forecastRes.status})`;
        return {
          ok: false,
          city: resolvedCity,
          country,
          unitSymbol,
          windUnit,
          weatherDescription: 'No disponible',
          summary: `No pude obtener el pronóstico de ${resolvedCity}: ${msg}`,
          error: msg,
        };
      }

      const current = forecastRes.data.current;
      const temperature =
        typeof current.temperature_2m === 'number'
          ? Math.round(current.temperature_2m * 10) / 10
          : undefined;
      const apparentTemperature =
        typeof current.apparent_temperature === 'number'
          ? Math.round(current.apparent_temperature * 10) / 10
          : undefined;
      const windSpeed =
        typeof current.wind_speed_10m === 'number'
          ? Math.round(current.wind_speed_10m * 10) / 10
          : undefined;
      const weatherDescription = describeWmoWeatherCode(
        typeof current.weather_code === 'number' ? current.weather_code : undefined
      );

      const locationLabel = country ? `${resolvedCity}, ${country}` : resolvedCity;
      const tempText =
        temperature !== undefined ? `${temperature}${unitSymbol}` : 'temperatura no disponible';
      const feelsText =
        apparentTemperature !== undefined
          ? ` (sensación ${apparentTemperature}${unitSymbol})`
          : '';
      const windText =
        windSpeed !== undefined ? `, viento ${windSpeed} ${windUnit}` : '';

      return {
        ok: true,
        city: resolvedCity,
        country,
        temperature,
        apparentTemperature,
        windSpeed,
        unitSymbol,
        windUnit,
        weatherDescription,
        summary: `Clima en ${locationLabel}: ${tempText}${feelsText}, ${weatherDescription.toLowerCase()}${windText}.`,
      };
    } catch (err) {
      const message =
        err instanceof Error && err.name === 'AbortError'
          ? 'Tiempo de espera agotado al consultar el clima'
          : err instanceof Error
          ? err.message
          : 'Error de red al consultar el clima';
      return {
        ok: false,
        city: trimmedCity,
        unitSymbol,
        windUnit,
        weatherDescription: 'No disponible',
        summary: `No pude consultar el clima de ${trimmedCity}: ${message}.`,
        error: message,
      };
    }
  }

  async searchTavily(apiKey: string, query: string): Promise<TavilyResult> {
    const trimmedKey = apiKey.trim();
    const trimmedQuery = query.trim();

    if (!trimmedKey) {
      return {
        ok: false,
        query: trimmedQuery,
        results: [],
        summary: 'Falta la API Key de Tavily.',
        error: 'Falta la API Key de Tavily',
      };
    }
    if (!trimmedQuery) {
      return {
        ok: false,
        query: '',
        results: [],
        summary: 'Falta el término de búsqueda.',
        error: 'Falta el término de búsqueda',
      };
    }

    try {
      const res = await this.fetchJson<{
        answer?: string;
        results?: Array<{
          title?: string;
          url?: string;
          content?: string;
        }>;
        error?: string;
        detail?: { error?: string };
      }>(`${this.tavilyBaseUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: trimmedKey,
          query: trimmedQuery,
          max_results: 3,
          include_answer: true,
        }),
      });

      if (!res.ok) {
        const errDetail = res.parseError
          ? 'Respuesta inválida del servidor.'
          : res.data.detail?.error ??
            res.data.error ??
            `Error de Tavily (HTTP ${res.status})`;
        return {
          ok: false,
          query: trimmedQuery,
          results: [],
          summary: `No pude completar la búsqueda en Tavily: ${errDetail}`,
          error: errDetail,
        };
      }

      const results: TavilySearchResultItem[] = Array.isArray(res.data.results)
        ? res.data.results
            .filter((item) => typeof item?.title === 'string' || typeof item?.url === 'string')
            .slice(0, 3)
            .map((item) => ({
              title: String(item.title ?? item.url ?? 'Resultado'),
              url: String(item.url ?? ''),
              content: String(item.content ?? ''),
            }))
        : [];

      const answer =
        typeof res.data.answer === 'string' && res.data.answer.trim()
          ? res.data.answer.trim()
          : undefined;

      let summary: string;
      if (answer) {
        summary = answer;
      } else if (results.length > 0) {
        summary = `Resultados para «${trimmedQuery}»: ${results
          .map((r) => `${r.title}${r.url ? ` (${r.url})` : ''}`)
          .join(' | ')}`;
      } else {
        summary = `No encontré resultados para «${trimmedQuery}».`;
      }

      return {
        ok: true,
        query: trimmedQuery,
        answer,
        results,
        summary,
      };
    } catch (err) {
      const message =
        err instanceof Error && err.name === 'AbortError'
          ? 'Tiempo de espera agotado al buscar en Tavily'
          : err instanceof Error
          ? err.message
          : 'Error de red al buscar en Tavily';
      return {
        ok: false,
        query: trimmedQuery,
        results: [],
        summary: `No pude buscar «${trimmedQuery}» en Tavily: ${message}.`,
        error: message,
      };
    }
  }

  async sendTelegramMessage(
    botToken: string,
    chatId: string,
    text: string
  ): Promise<TelegramSendResult> {
    const trimmedToken = botToken.trim();
    const trimmedChatId = chatId.trim();
    const trimmedText = text.trim();

    if (!trimmedToken || !trimmedChatId) {
      return {
        ok: false,
        summary: 'Faltan Bot Token o Chat ID de Telegram.',
        error: 'Faltan Bot Token o Chat ID',
      };
    }
    if (!trimmedText) {
      return {
        ok: false,
        summary: 'El mensaje de Telegram no puede estar vacío.',
        error: 'Mensaje vacío',
      };
    }

    try {
      const url = `${this.telegramBaseUrl}/bot${encodeURIComponent(trimmedToken)}/sendMessage`;
      const res = await this.fetchJson<{
        ok?: boolean;
        description?: string;
        result?: { message_id?: number };
      }>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: trimmedChatId,
          text: trimmedText,
        }),
      });

      if (!res.ok || res.data.ok !== true) {
        const msg = res.parseError
          ? 'Respuesta inválida del servidor.'
          : res.data.description ?? `Error de Telegram (HTTP ${res.status})`;
        return {
          ok: false,
          summary: `No pude enviar el mensaje por Telegram: ${msg}`,
          error: msg,
        };
      }

      const messageId =
        typeof res.data.result?.message_id === 'number'
          ? res.data.result.message_id
          : undefined;

      return {
        ok: true,
        messageId,
        summary: `Mensaje enviado por Telegram al chat ${trimmedChatId}.`,
      };
    } catch (err) {
      const message =
        err instanceof Error && err.name === 'AbortError'
          ? 'Tiempo de espera agotado al enviar por Telegram'
          : err instanceof Error
          ? err.message
          : 'Error de red al enviar por Telegram';
      return {
        ok: false,
        summary: `No pude enviar el mensaje por Telegram: ${message}.`,
        error: message,
      };
    }
  }
}
