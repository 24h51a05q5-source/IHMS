// ============================================================
// Centralized High-Performance API Client with In-Memory SWR Cache
// All HTTP calls go through this single module so the backend
// URL / auth strategy can be swapped in one place with zero lag.
// ============================================================

import type { ApiError } from '@/lib/types';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:5000/api';

const TOKEN_KEY = 'ihms_access_token';
const REFRESH_KEY = 'ihms_refresh_token';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function setTokens(access: string, refresh?: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOKEN_KEY, access);
  if (refresh) window.localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

let onUnauthorized: (() => void) | null = null;
export function registerUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

function buildUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

async function parseResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  let body: any = null;
  if (contentType.includes('application/json')) {
    body = await res.json().catch(() => null);
  }

  if (!res.ok) {
    const message = body?.message || body?.error || toApiError(res.status, res.statusText).message;
    const err: ApiError = {
      statusCode: body?.statusCode ?? res.status,
      message,
      code: body?.code,
      details: body?.details,
    };
    throw err;
  }

  // Automatic unwrapping of { success: true, data: ... }
  if (body && typeof body === 'object' && body.success === true && body.data !== undefined) {
    return body.data as T;
  }

  return body as T;
}

function toApiError(status: number, fallback: string): ApiError {
  const messages: Record<number, string> = {
    400: 'The request was invalid. Please check your input and try again.',
    401: 'Unauthorized. Please sign in.',
    403: 'You do not have permission to perform this action.',
    404: 'The requested resource was not found.',
    409: 'This record already exists or conflicts with existing data.',
    422: 'Some of the submitted data was invalid.',
    500: 'Something went wrong on our end. Please try again later.',
    502: 'Unable to connect to the server. Please try again.',
    503: 'The service is temporarily unavailable. Please try again shortly.',
  };
  return { statusCode: status, message: messages[status] || fallback || 'An unexpected error occurred.' };
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  _retry?: boolean;
  skipCache?: boolean;
}

// In-Memory Fast SWR Cache & Inflight Request Deduplication Map
interface CacheEntry {
  data: any;
  freshUntil: number;
  staleUntil: number;
}

const apiCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<any>>();
const FRESH_TTL_MS = 30 * 1000;  // 30 seconds fresh
const STALE_TTL_MS = 5 * 60 * 1000; // 5 minutes stale-while-revalidate

function makeCacheKey(method: string, path: string, query?: Record<string, any>): string {
  const url = new URL(buildUrl(path), typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000');
  if (query) {
    const keys = Object.keys(query).sort();
    keys.forEach((k) => {
      const v = query[k];
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    });
  }
  const token = getAccessToken();
  return `${method}:${url.toString()}:${token || ''}`;
}

export function clearApiCache(prefix?: string) {
  if (!prefix) {
    apiCache.clear();
  } else {
    Array.from(apiCache.keys()).forEach((key) => {
      if (key.includes(prefix)) apiCache.delete(key);
    });
  }
}

export function getCachedData<T>(path: string, query?: Record<string, any>): T | null {
  if (typeof window === 'undefined') return null;
  const key = makeCacheKey('GET', path, query);
  const entry = apiCache.get(key);
  if (!entry) return null;
  if (Date.now() < entry.staleUntil) {
    return entry.data as T;
  }
  apiCache.delete(key);
  return null;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, headers = {}, signal, _retry, skipCache } = opts;

  const url = new URL(buildUrl(path), typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000');
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    });
  }

  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...headers,
  };

  const token = getAccessToken();
  if (token) finalHeaders.Authorization = `Bearer ${token}`;

  const cacheKey = `${method}:${url.toString()}:${token || ''}`;

  // Serve from cache for fast instantaneous navigation on GET requests
  if (method === 'GET' && !skipCache) {
    const cached = apiCache.get(cacheKey);
    const now = Date.now();

    if (cached) {
      if (now < cached.freshUntil) {
        // Return instantly from fresh cache in 0ms
        return cached.data as T;
      }
      if (now < cached.staleUntil) {
        // Stale-While-Revalidate: Trigger background fetch without blocking caller
        if (!inflightRequests.has(cacheKey)) {
          const bgPromise = executeFetch<T>(url, method, finalHeaders, body, signal, path, opts, _retry, cacheKey, false)
            .finally(() => inflightRequests.delete(cacheKey));
          inflightRequests.set(cacheKey, bgPromise);
        }
        return cached.data as T;
      }
    }

    // Deduplicate concurrent inflight requests
    if (inflightRequests.has(cacheKey)) {
      return inflightRequests.get(cacheKey) as Promise<T>;
    }
  }

  // Mutating requests invalidate cache
  if (method !== 'GET') {
    clearApiCache();
  }

  if (body !== undefined && !(body instanceof FormData)) {
    finalHeaders['Content-Type'] = 'application/json';
  }

  const fetchPromise = executeFetch<T>(url, method, finalHeaders, body, signal, path, opts, _retry, cacheKey, !skipCache);

  if (method === 'GET' && !skipCache) {
    const trackedPromise = fetchPromise.finally(() => {
      inflightRequests.delete(cacheKey);
    });
    inflightRequests.set(cacheKey, trackedPromise);
    return trackedPromise;
  }

  return fetchPromise;
}

async function executeFetch<T>(
  url: URL,
  method: string,
  finalHeaders: Record<string, string>,
  body: unknown,
  signal: AbortSignal | undefined,
  path: string,
  opts: RequestOptions,
  _retry: boolean | undefined,
  cacheKey: string,
  cacheResult: boolean
): Promise<T> {
  let res: Response;
  const controller = new AbortController();
  const timeoutMs = path.includes('/auth/me') ? 5000 : 15000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Link caller signal if provided
  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }

  try {
    res = await fetch(url.toString(), {
      method,
      headers: finalHeaders,
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (e: any) {
    if (e.name === 'AbortError') {
      throw { statusCode: 408, message: 'Request timed out. Please check your connection and try again.' } as ApiError;
    }
    throw { statusCode: 0, message: 'Unable to connect to the server. Please try again.' } as ApiError;
  } finally {
    clearTimeout(timeoutId);
  }

  const isAuthEndpoint = path.includes('/auth/login') || path.includes('/auth/register') || path.includes('/auth/refresh');

  // Attempt single token refresh on 401 for authenticated session calls only
  if (res.status === 401 && !isAuthEndpoint && !_retry) {
    const refreshed = await tryRefreshToken();
    if (refreshed) return apiRequest<T>(path, { ...opts, _retry: true });
    clearTokens();
    clearApiCache();
    if (onUnauthorized) onUnauthorized();
    return parseResponse<T>(res);
  }

  const parsedData = await parseResponse<T>(res);

  if (method === 'GET' && cacheResult) {
    const now = Date.now();
    apiCache.set(cacheKey, {
      data: parsedData,
      freshUntil: now + FRESH_TTL_MS,
      staleUntil: now + STALE_TTL_MS,
    });
  }

  return parsedData;
}

async function tryRefreshToken(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const res = await fetch(buildUrl('/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    const token = data?.accessToken || data?.data?.accessToken || data?.token || data?.data?.token;
    if (token) {
      setTokens(token, data.refreshToken || data?.data?.refreshToken || refresh);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) => apiRequest<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) => apiRequest<T>(path, { ...opts, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) => apiRequest<T>(path, { ...opts, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) => apiRequest<T>(path, { ...opts, method: 'PATCH', body }),
  delete: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) => apiRequest<T>(path, { ...opts, method: 'DELETE' }),
  clearCache: clearApiCache,
  getCached: getCachedData,
};

export const apiClient = api;
