import { ModusignApiError } from '../utils/errors.js';

const DEFAULT_BASE_URL = 'https://api.modusign.co.kr';
const MAX_RETRIES = 3;

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
    this.baseUrl = baseUrl ?? DEFAULT_BASE_URL;
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

  async postFormData<T>(path: string, formData: FormData): Promise<T> {
    return this.request<T>('POST', path, {
      body: formData,
      headers: {},
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
      parts.push(`status eq '${filters.status}'`);
    }
    if (filters.titleContains) {
      const escaped = filters.titleContains.replace(/'/g, "''");
      parts.push(`contains(title, '${escaped}')`);
    }
    if (filters.createdAtFrom) {
      parts.push(`createdAt ge '${filters.createdAtFrom}'`);
    }
    if (filters.createdAtTo) {
      parts.push(`createdAt le '${filters.createdAtTo}'`);
    }
    if (filters.labelIds && filters.labelIds.length > 0) {
      const ids = filters.labelIds.map((id) => `'${id}'`).join(', ');
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
    const url = new URL(path, this.baseUrl);

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

    const fetchOptions: RequestInit = { method, headers };

    if (options.body !== undefined) {
      if (options.body instanceof FormData) {
        fetchOptions.body = options.body;
      } else {
        headers['Content-Type'] = 'application/json';
        fetchOptions.body = JSON.stringify(options.body);
      }
    }

    const response = await fetch(url.toString(), fetchOptions);

    if (response.status === 429 && retries > 0) {
      const retryAfter = parseInt(
        response.headers.get('X-Retry-After') ??
        response.headers.get('Retry-After') ??
        '1',
        10,
      );
      await this.sleep(retryAfter * 1000);
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
