import { ModusignApiError } from '../utils/errors.js';

const DEFAULT_BASE_URL = 'https://api.modusign.co.kr';
const MAX_RETRIES = 3;
const DEFAULT_RETRY_AFTER_MS = 1000;
const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 8000;
export const REQUEST_TIMEOUT_MS = 60_000;

export function apiPath(strings: TemplateStringsArray, ...segments: string[]): string {
  return strings.reduce(
    (path, chunk, i) => path + chunk + (i < segments.length ? encodeURIComponent(segments[i]) : ''),
    '',
  );
}

export function parseRetryAfterMs(header: string | null, now: number = Date.now()): number {
  if (!header) return DEFAULT_RETRY_AFTER_MS;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const retryAt = Date.parse(header);
  return Number.isNaN(retryAt) ? DEFAULT_RETRY_AFTER_MS : Math.max(0, retryAt - now);
}

// Only idempotent GETs retry on 5xx/network errors so a POST is never sent twice.
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const capped = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_MAX_MS);
  return Math.round(capped / 2 + random() * (capped / 2));
}

function odataString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

interface RequestOptions {
  params?: Record<string, string | number | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
}

export class ModusignClient {
  private readonly authHeader: string;
  private readonly baseUrl: string;

  constructor(email: string, apiKey: string, baseUrl?: string) {
    const credentials = Buffer.from(`${email}:${apiKey}`).toString('base64');
    this.authHeader = `Basic ${credentials}`;
    this.baseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    return this.request<T>('GET', path, { params });
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, { body });
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, { body });
  }

  async delete<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('DELETE', path, { body });
  }

  async postFormData<T>(path: string, formData: FormData, params?: Record<string, string | number | undefined>): Promise<T> {
    return this.request<T>('POST', path, {
      body: formData,
      headers: {},
      params,
    });
  }

  static buildODataFilter(filters: {
    status?: string;
    titleContains?: string;
    createdAtFrom?: string;
    createdAtTo?: string;
    labelIds?: string[];
  }): string | undefined {
    const parts: string[] = [];

    if (filters.status) {
      parts.push(`status eq ${odataString(filters.status)}`);
    }
    if (filters.titleContains) {
      parts.push(`contains(title, ${odataString(filters.titleContains)})`);
    }
    if (filters.createdAtFrom) {
      parts.push(`createdAt ge ${odataString(filters.createdAtFrom)}`);
    }
    if (filters.createdAtTo) {
      parts.push(`createdAt le ${odataString(filters.createdAtTo)}`);
    }
    if (filters.labelIds && filters.labelIds.length > 0) {
      const ids = filters.labelIds.map(odataString).join(', ');
      parts.push(`labelIds in (${ids})`);
    }

    return parts.length > 0 ? parts.join(' and ') : undefined;
  }

  private async request<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
    retries: number = MAX_RETRIES,
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);

    if (options.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      ...options.headers,
    };

    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    };

    if (options.body !== undefined) {
      if (options.body instanceof FormData) {
        fetchOptions.body = options.body;
      } else {
        headers['Content-Type'] = 'application/json';
        fetchOptions.body = JSON.stringify(options.body);
      }
    }

    const attempt = MAX_RETRIES - retries;
    const canRetryTransient = method === 'GET' && retries > 0;

    let response: Response;
    try {
      response = await fetch(url.toString(), fetchOptions);
    } catch (err) {
      if (!canRetryTransient || (err as Error).name === 'TimeoutError') throw err;
      await this.sleep(backoffMs(attempt));
      return this.request<T>(method, path, options, retries - 1);
    }

    if (response.status === 429 && retries > 0) {
      await response.body?.cancel();
      const retryAfterMs = parseRetryAfterMs(
        response.headers.get('X-Retry-After') ?? response.headers.get('Retry-After'),
      );
      await this.sleep(retryAfterMs);
      return this.request<T>(method, path, options, retries - 1);
    }

    if (response.status >= 500 && canRetryTransient) {
      await response.body?.cancel();
      await this.sleep(backoffMs(attempt));
      return this.request<T>(method, path, options, retries - 1);
    }

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }
      throw new ModusignApiError(response.status, errorBody);
    }

    const contentType = response.headers.get('Content-Type') || '';
    if (response.status === 204 || !contentType.includes('application/json')) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
