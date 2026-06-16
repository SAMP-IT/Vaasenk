/**
 * Vaasenk Mobile — API client.
 *
 * Wire-compatible port of apps/web/src/lib/api-client.ts. Same envelope
 * shape, same error class, same auth attach behaviour — just backed by
 * the Expo Supabase client (services/supabase.ts) instead of the
 * @supabase/ssr browser client.
 *
 * Per CLAUDE.md §3: NEVER send `institutionId` from the client. The
 * backend extracts it from the JWT. This helper only attaches the
 * Authorization header — institution scoping happens server-side.
 */

import Constants from 'expo-constants';
import { getAccessToken } from './supabase';

/** Standard success envelope returned by the Vaasenk API (CLAUDE.md §5). */
export type ApiSuccess<T> = {
  data: T;
  meta?: { page?: number; limit?: number; total?: number };
};

export type ApiError = {
  error: { code: string; message: string; details?: unknown };
};

export type ApiResult<T> = ApiSuccess<T> | ApiError;

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Resolve the API base URL with fallbacks. Order:
 *   1. EXPO_PUBLIC_API_URL env var (preferred, set in .env.local).
 *   2. expoConfig.extra.apiUrl (build-time injection via EAS).
 *   3. http://localhost:4000 (dev default — only works on simulator).
 *
 * A trailing slash is stripped so callers can build paths with leading slashes.
 */
function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  const fromExtra =
    (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  const raw = fromEnv ?? fromExtra ?? 'http://localhost:4000';
  return raw.replace(/\/$/, '');
}

const baseUrl = resolveBaseUrl();

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  /** Skip attaching the Supabase access token (for unauthenticated endpoints). */
  unauthenticated?: boolean;
};

/**
 * Core fetch wrapper that unwraps the `{ data }` envelope.
 *
 * - Adds Authorization: Bearer <supabase token> unless `unauthenticated`.
 * - Sets Content-Type: application/json when `body` is supplied.
 * - Throws `ApiClientError` with code + message + details for non-2xx.
 *
 * Use the `apiGet` / `apiPost` / `apiPatch` / `apiDelete` shortcuts below
 * unless you need to customise headers or method.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, headers, unauthenticated, ...rest } = options;

  const finalHeaders = new Headers(headers);
  if (body !== undefined && !finalHeaders.has('content-type')) {
    finalHeaders.set('content-type', 'application/json');
  }

  if (!unauthenticated) {
    const token = await getAccessToken();
    if (token) {
      finalHeaders.set('authorization', `Bearer ${token}`);
    }
  }

  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;

  const res = await fetch(url, {
    ...rest,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // 204 No Content — common on DELETE.
  if (res.status === 204) {
    return undefined as T;
  }

  const payload = (await res.json().catch(() => ({}))) as Partial<ApiResult<T>>;

  if (!res.ok) {
    const err = (payload as ApiError).error ?? {
      code: `HTTP_${res.status}`,
      message: res.statusText || 'Request failed',
    };
    throw new ApiClientError(res.status, err.code, err.message, err.details);
  }

  return (payload as ApiSuccess<T>).data;
}

/**
 * Like `apiFetch` but returns the FULL envelope including `meta`.
 * Use for paginated lists where the caller needs `meta.total`.
 */
export async function apiFetchEnvelope<TData>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiSuccess<TData>> {
  const { body, headers, unauthenticated, ...rest } = options;

  const finalHeaders = new Headers(headers);
  if (body !== undefined && !finalHeaders.has('content-type')) {
    finalHeaders.set('content-type', 'application/json');
  }

  if (!unauthenticated) {
    const token = await getAccessToken();
    if (token) {
      finalHeaders.set('authorization', `Bearer ${token}`);
    }
  }

  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;

  const res = await fetch(url, {
    ...rest,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 204) {
    return { data: undefined as unknown as TData };
  }

  const payload = (await res.json().catch(() => ({}))) as Partial<
    ApiResult<TData>
  >;

  if (!res.ok) {
    const err = (payload as ApiError).error ?? {
      code: `HTTP_${res.status}`,
      message: res.statusText || 'Request failed',
    };
    throw new ApiClientError(res.status, err.code, err.message, err.details);
  }

  return payload as ApiSuccess<TData>;
}

/**
 * Raw fetch with the auth header attached but NO envelope unwrapping.
 * Use for file uploads (multipart bodies) and any endpoint that
 * intentionally streams or returns non-JSON. Throws on non-2xx but
 * leaves response handling to the caller.
 */
export async function apiFetchRaw(
  path: string,
  options: Omit<RequestInit, 'body'> & { body?: BodyInit; unauthenticated?: boolean } = {},
): Promise<Response> {
  const { headers, unauthenticated, ...rest } = options;

  const finalHeaders = new Headers(headers);
  if (!unauthenticated) {
    const token = await getAccessToken();
    if (token) {
      finalHeaders.set('authorization', `Bearer ${token}`);
    }
  }

  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;

  const res = await fetch(url, { ...rest, headers: finalHeaders });
  if (!res.ok) {
    let errBody: ApiError | undefined;
    try {
      errBody = (await res.clone().json()) as ApiError;
    } catch {
      // body wasn't JSON; carry on with HTTP info.
    }
    const err = errBody?.error ?? {
      code: `HTTP_${res.status}`,
      message: res.statusText || 'Request failed',
    };
    throw new ApiClientError(res.status, err.code, err.message, err.details);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Convenience verbs
// ---------------------------------------------------------------------------

export const apiGet = <T = unknown>(path: string, options?: RequestOptions) =>
  apiFetch<T>(path, { ...options, method: 'GET' });

export const apiPost = <T = unknown>(
  path: string,
  body?: unknown,
  options?: RequestOptions,
) => apiFetch<T>(path, { ...options, method: 'POST', body });

export const apiPatch = <T = unknown>(
  path: string,
  body?: unknown,
  options?: RequestOptions,
) => apiFetch<T>(path, { ...options, method: 'PATCH', body });

export const apiDelete = <T = unknown>(path: string, options?: RequestOptions) =>
  apiFetch<T>(path, { ...options, method: 'DELETE' });
