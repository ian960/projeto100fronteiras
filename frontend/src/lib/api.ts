import { pt } from './pt';
import type { Paginated } from './types';

// Every request goes to a relative /api path. In development Vite forwards it
// to the backend (see vite.config.ts); in production nginx does the same.
// Same origin both ways, so the session cookie travels without CORS.
const BASE = '/api';

// The API answers errors as { error: { code, message, fields? } }.
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    // Translated once, here, so every screen shows Portuguese.
    super(pt(message));
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    // Zod reports "body.title", services report "title". The form only cares
    // about the field name.
    this.fields = Object.fromEntries(
      Object.entries(fields ?? {}).map(([key, value]) => [key.replace(/^(body|query|params)\./, ''), pt(value)]),
    );
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, query?: Query): string {
  const url = new URL(BASE + path, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.pathname + url.search;
}

async function request<T>(method: string, path: string, options: { body?: unknown; query?: Query; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;

  if (options.form) {
    body = options.form; // the browser sets the multipart boundary itself
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Sem conexão com o servidor. Verifique se a API está rodando.');
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const json = text ? safeJson(text) : null;

  if (!response.ok) {
    const error = (json as { error?: { code?: string; message?: string; fields?: Record<string, string> } } | null)?.error;
    // No error body in the API's format: the API itself never answered. In
    // development that is the Vite proxy failing to reach the backend.
    if (!error && response.status >= 500) {
      throw new ApiError(
        response.status,
        'UNREACHABLE',
        import.meta.env.DEV
          ? 'A API não respondeu. Confira se o backend está rodando (npm run dev em backend/) e se a porta em frontend/.env é a mesma.'
          : 'O servidor não respondeu. Tente de novo em instantes.',
      );
    }
    throw new ApiError(
      response.status,
      error?.code ?? 'HTTP_' + response.status,
      error?.message ?? `O servidor respondeu ${response.status}.`,
      error?.fields,
    );
  }

  return json as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Success bodies come as { data: ... }; paginated ones add { meta: ... }.
export async function get<T>(path: string, query?: Query): Promise<T> {
  const res = await request<{ data: T }>('GET', path, { query });
  return res.data;
}

export async function getPage<T>(path: string, query?: Query): Promise<Paginated<T>> {
  const res = await request<{ data: { items: T[] }; meta: Omit<Paginated<T>, 'items'> }>('GET', path, { query });
  return { items: res.data.items, ...res.meta };
}

export async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await request<{ data: T } | undefined>('POST', path, { body });
  return res?.data as T;
}

export async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await request<{ data: T }>('PATCH', path, { body });
  return res.data;
}

export async function del(path: string): Promise<void> {
  await request<void>('DELETE', path);
}

export async function upload<T>(path: string, form: FormData, query?: Query): Promise<T> {
  const res = await request<{ data: T }>('POST', path, { form, query });
  return res.data;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Algo deu errado.';
}
