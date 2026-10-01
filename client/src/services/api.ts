import type { Paged } from '../types';

const TOKEN_KEY = 'gdtrading_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type QueryValue = string | number | boolean | null | undefined;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
}

function buildQuery(query?: Record<string, QueryValue>): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { payload } = await send(path, options);
  return payload as T;
}

async function send(
  path: string,
  options: RequestOptions,
): Promise<{ payload: unknown; response: Response }> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`/api${path}${buildQuery(options.query)}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 204) return { payload: undefined, response };

  const text = await response.text();
  const payload: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const data = (payload ?? {}) as { code?: string; message?: string; details?: unknown };
    if (response.status === 401) setToken(null);
    throw new ApiError(
      response.status,
      data.code ?? 'ERREUR',
      data.message ?? `Erreur ${response.status}`,
      data.details,
    );
  }

  return { payload, response };
}

/**
 * Comme request(), mais expose le total renvoye par l'API dans X-Total-Count
 * (utilise par les endpoints pagines) afin d'afficher "X sur N" plutot que
 * de tronquer silencieusement la liste.
 */
export async function requestPaged<T>(path: string, options: RequestOptions = {}): Promise<Paged<T>> {
  const { payload, response } = await send(path, options);
  const header = response.headers.get('X-Total-Count');
  const total = header === null ? NaN : Number(header);
  const items = Array.isArray(payload) ? (payload as T[]) : [];
  return {
    items,
    total: Number.isFinite(total) ? total : items.length,
    truncated: response.headers.get('X-Search-Truncated') === 'true' || undefined,
  };
}
