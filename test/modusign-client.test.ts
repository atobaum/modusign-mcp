import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModusignClient, apiPath, backoffMs, parseRetryAfterMs } from '../src/client/modusign-client.js';
import { ModusignApiError } from '../src/utils/errors.js';

describe('apiPath', () => {
  it('encodes interpolated segments', () => {
    expect(apiPath`/documents/${'../webhooks'}/labels/${'a b'}`).toBe(
      '/documents/..%2Fwebhooks/labels/a%20b',
    );
  });
});

describe('buildODataFilter', () => {
  it('escapes single quotes in every string value', () => {
    const filter = ModusignClient.buildODataFilter({
      titleContains: "it's",
      createdAtFrom: "2024' or 1 eq 1 or 'x",
      labelIds: ["a'b"],
    });
    expect(filter).toBe(
      "contains(title, 'it''s') and createdAt ge '2024'' or 1 eq 1 or ''x' and labelIds in ('a''b')",
    );
  });

  it('returns undefined without filters', () => {
    expect(ModusignClient.buildODataFilter({})).toBeUndefined();
  });
});

describe('parseRetryAfterMs', () => {
  it('parses delta seconds', () => {
    expect(parseRetryAfterMs('3')).toBe(3000);
  });

  it('parses HTTP-date', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(parseRetryAfterMs('Thu, 01 Jan 2026 00:00:05 GMT', now)).toBe(5000);
  });

  it('falls back to 1s for missing or invalid values', () => {
    expect(parseRetryAfterMs(null)).toBe(1000);
    expect(parseRetryAfterMs('soon')).toBe(1000);
  });
});

describe('ModusignClient request', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  }

  it('retries on 429 and returns the next successful response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, {}, { 'Retry-After': '0' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new ModusignClient('a@b.c', 'key', 'https://example.test');
    await expect(client.get('/user')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws ModusignApiError on error status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(404, { message: 'nope' })));

    const client = new ModusignClient('a@b.c', 'key', 'https://example.test');
    await expect(client.get('/documents/x')).rejects.toBeInstanceOf(ModusignApiError);
  });

  it('sends a timeout signal with every request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    await new ModusignClient('a@b.c', 'key', 'https://example.test').get('/user');
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('falls back to the default base URL when given an empty string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    await new ModusignClient('a@b.c', 'key', '').get('/user');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.modusign.co.kr/user');
  });

  it('keeps a path prefix in the base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    await new ModusignClient('a@b.c', 'key', 'https://example.test/api/').get('/user');
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.test/api/user');
  });

  it('retries GET on 5xx and network errors', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, {}))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const pending = new ModusignClient('a@b.c', 'key', 'https://example.test').get('/user');
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('does not retry POST on 5xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(503, {}));
    vi.stubGlobal('fetch', fetchMock);

    const client = new ModusignClient('a@b.c', 'key', 'https://example.test');
    await expect(client.post('/documents', {})).rejects.toBeInstanceOf(ModusignApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('backoffMs', () => {
  it('grows exponentially with jitter and caps at 8s', () => {
    expect(backoffMs(0, () => 0)).toBe(250);
    expect(backoffMs(0, () => 1)).toBe(500);
    expect(backoffMs(2, () => 1)).toBe(2000);
    expect(backoffMs(10, () => 1)).toBe(8000);
  });
});
