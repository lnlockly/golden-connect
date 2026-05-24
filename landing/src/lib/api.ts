// Minimal fetch wrapper for the trendex-api service. The base URL is
// read from `VITE_API_URL` at build time; dev defaults to localhost so
// a local `trendex-api` instance works out of the box. All requests
// send cookies (`af_session`) so the JWT middleware on the API can
// identify the caller.

const BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ||
  'http://localhost:4000';

// Fallback session token for hostile cookie environments (Telegram WebView
// on iOS blocks cross-site cookies even on same-site sub-requests in some
// cases). Endpoints that set a session cookie also return the JWT in the
// body — we stash it here and attach it as Authorization: Bearer.
const TOKEN_STORAGE_KEY = 'af_session';

export function getStoredToken(): string | null {
  try {
    return typeof localStorage !== 'undefined'
      ? localStorage.getItem(TOKEN_STORAGE_KEY)
      : null;
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// Thrown when the API replies with 401 — callers (AuthProvider) use
// the `instanceof` check to clear state without treating it as a hard
// error.
export class AuthExpiredError extends Error {
  constructor(message = 'auth_expired') {
    super(message);
    this.name = 'AuthExpiredError';
  }
}

// Thrown on any non-2xx other than 401. Carries the status code so the
// caller can decide whether to surface a toast or silently ignore
// (e.g. 404 on `/me` when the backend doesn't know the user yet).
export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(status: number, message: string, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;

  const bearer = getStoredToken();
  const res = await fetch(url, {
    ...rest,
    credentials: 'include',
    headers: {
      'accept': 'application/json',
      ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(bearer ? { 'authorization': `Bearer ${bearer}` } : {}),
      ...(headers || {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  if (res.status === 401) {
    throw new AuthExpiredError();
  }

  // 204 No Content or empty-body responses still need handling before
  // we try to parse JSON — otherwise `res.json()` throws on the empty
  // string returned by e.g. the logout endpoint.
  const text = await res.text();
  const data = text ? safeParse(text) : null;

  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && 'error' in data
        ? String((data as Record<string, unknown>).error)
        : res.statusText) || `HTTP ${res.status}`;
    throw new ApiError(res.status, message, data);
  }

  return data as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function apiGet<T = unknown>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}

export function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', json: body });
}

export const apiBaseUrl = BASE_URL;
