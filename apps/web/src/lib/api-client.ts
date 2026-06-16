import { createClient as createBrowserSupabase } from './supabase/client';

/**
 * Standard envelope returned by the Vaasenk API (see CLAUDE.md §5).
 */
export type ApiSuccess<T> = {
  data: T;
  meta?: { page?: number; limit?: number; total?: number };
};

export type ApiError = {
  error: { code: string; message: string; details?: unknown };
};

export type ApiResult<T> = ApiSuccess<T> | ApiError;

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

const baseUrl = (() => {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  return raw.replace(/\/$/, '');
})();

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  /** Skip attaching the Supabase access token (for unauthenticated endpoints). */
  unauthenticated?: boolean;
};

/**
 * Browser-side fetch wrapper for the Vaasenk API.
 *
 * - Joins the path onto NEXT_PUBLIC_API_URL.
 * - Sets Content-Type to JSON when a body is supplied.
 * - Adds Authorization: Bearer <token> from the current Supabase session
 *   unless `unauthenticated: true`.
 * - Unwraps the { data } envelope on 2xx; throws ApiClientError on errors.
 *
 * For server-component fetches, build a similar helper backed by the
 * server Supabase client — this module is browser-only because it imports
 * the browser Supabase client.
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
    const supabase = createBrowserSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      finalHeaders.set('authorization', `Bearer ${session.access_token}`);
    }
  }

  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;

  const res = await fetch(url, {
    ...rest,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // 204 No Content
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
 * Same wire format as {@link apiFetch} but returns the FULL envelope
 * `{ data, meta }` instead of unwrapping `data`. Use for paginated list
 * endpoints where the caller needs `meta.total` for "Showing X–Y of Z".
 *
 * Identical auth + base-URL behaviour to apiFetch — they share the same
 * Supabase access-token attach step and the same {error} shape on failures.
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
    const supabase = createBrowserSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      finalHeaders.set('authorization', `Bearer ${session.access_token}`);
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
