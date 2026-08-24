// ============================================================
// Centralized API client
// All HTTP calls go through this single module so the backend
// URL / auth strategy can be swapped by Antigravity in one place.
// ============================================================

import type { ApiError } from '@/lib/types';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || '/api';

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
  if (!contentType.includes('application/json')) {
    if (!res.ok) throw toApiError(res.status, res.statusText);
    return undefined as unknown as T;
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err: ApiError = body?.message
      ? { statusCode: body.statusCode ?? res.status, message: body.message, code: body.code, details: body.details }
      : toApiError(res.status, body?.error || res.statusText);
    throw err;
  }
  return body as T;
}

function toApiError(status: number, fallback: string): ApiError {
  const messages: Record<number, string> = {
    400: 'The request was invalid. Please check your input and try again.',
    401: 'Your session has expired. Please sign in again.',
    403: 'You do not have permission to perform this action.',
    404: 'The requested resource was not found.',
    409: 'This record already exists or conflicts with existing data.',
    422: 'Some of the submitted data was invalid.',
    500: 'Something went wrong on our end. Please try again later.',
    502: 'The backend service is unavailable. Please try again shortly.',
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
  // internal retry guard
  _retry?: boolean;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, headers = {}, signal, _retry } = opts;

  const url = new URL(buildUrl(path), typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
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

  if (body !== undefined && !(body instanceof FormData)) {
    finalHeaders['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method,
      headers: finalHeaders,
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    throw { statusCode: 0, message: 'Unable to reach the server. Check your internet connection and try again.' } as ApiError;
  }

  // Attempt single token refresh on 401
  if (res.status === 401 && !_retry) {
    const refreshed = await tryRefreshToken();
    if (refreshed) return apiRequest<T>(path, { ...opts, _retry: true });
    clearTokens();
    if (onUnauthorized) onUnauthorized();
    throw toApiError(401, 'Unauthorized');
  }

  if (res.status === 403) {
    // handled centrally but still throw the friendly message
    throw toApiError(403, 'Forbidden');
  }

  return parseResponse<T>(res);
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
    if (data?.accessToken) {
      setTokens(data.accessToken, data.refreshToken ?? refresh);
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
};
