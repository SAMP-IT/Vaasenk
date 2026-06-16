/**
 * XHR-based file upload with progress reporting.
 *
 * Why XMLHttpRequest instead of fetch()?
 *   fetch() has no upload-progress API in browsers today (the streams spec
 *   exists but isn't widely supported), so the only way to render a real
 *   progress bar for multipart uploads is XHR. We still mirror apiFetch's
 *   conventions: Bearer access-token, base URL from NEXT_PUBLIC_API_URL,
 *   { error: { code, message, details? } } envelope on failure.
 *
 * Used by:
 *   - apps/web/src/app/(dashboard)/teacher/classrooms/[id]/upload-note-drawer.tsx
 *   - apps/web/src/app/(dashboard)/admin/syllabus/upload-syllabus-drawer.tsx
 *   - apps/web/src/app/(dashboard)/admin/syllabus/replace-version-drawer.tsx
 */

import { ApiClientError } from './api-client';

export type XhrUploadProgress = (pct: number) => void;

export type XhrUploadOptions = {
  /** Absolute URL or path starting with /api. Path joins onto NEXT_PUBLIC_API_URL. */
  url: string;
  /** HTTP method — defaults to POST. PATCH is supported for "replace version" flows. */
  method?: 'POST' | 'PATCH' | 'PUT';
  /** FormData payload (file + fields). */
  body: FormData;
  /** Bearer token from the Supabase session — usually session.access_token. */
  accessToken: string | null;
  /** Called whenever the browser reports upload progress (0–100). */
  onProgress?: XhrUploadProgress;
  /** A ref that the helper assigns the in-flight xhr to, so the caller can abort. */
  xhrRef?: { current: XMLHttpRequest | null };
  /** Extra request headers (e.g. an idempotency key). */
  headers?: Record<string, string>;
};

export type XhrUploadResult<T> = {
  /** Parsed `data` field from the success envelope, if present. */
  data: T;
  /** Raw HTTP status (200/201/204). */
  status: number;
};

/**
 * Upload a multipart body with progress events. Resolves with the parsed
 * `data` field from the standard Vaasenk envelope, throws ApiClientError on
 * non-2xx responses, throws a tagged Error('aborted') on caller abort.
 */
export async function xhrUpload<T = unknown>(
  options: XhrUploadOptions,
): Promise<XhrUploadResult<T>> {
  const {
    url,
    method = 'POST',
    body,
    accessToken,
    onProgress,
    xhrRef,
    headers,
  } = options;

  const baseUrl = (
    process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
  ).replace(/\/$/, '');
  const finalUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;

  return new Promise<XhrUploadResult<T>>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    if (xhrRef) xhrRef.current = xhr;

    xhr.open(method, finalUrl);
    // NEVER set Content-Type for FormData — the browser must set it with the
    // multipart boundary. Only set auth + extras.
    if (accessToken) {
      xhr.setRequestHeader('authorization', `Bearer ${accessToken}`);
    }
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        xhr.setRequestHeader(k, v);
      }
    }

    xhr.upload.addEventListener('progress', (ev) => {
      if (!onProgress || !ev.lengthComputable) return;
      const pct = Math.round((ev.loaded / ev.total) * 100);
      onProgress(pct);
    });

    xhr.addEventListener('load', () => {
      if (xhrRef) xhrRef.current = null;
      const status = xhr.status;
      const ok = status >= 200 && status < 300;
      // Parse the response payload defensively — backend may return text on
      // some failures (e.g. nginx 413 may not be JSON).
      type ApiEnvelope = {
        data?: T;
        error?: { code?: string; message?: string; details?: unknown };
      };
      let parsed: ApiEnvelope | null = null;
      try {
        parsed = xhr.responseText
          ? (JSON.parse(xhr.responseText) as ApiEnvelope)
          : null;
      } catch {
        parsed = null;
      }

      if (ok) {
        const data = (parsed?.data ?? (undefined as unknown)) as T;
        resolve({ data, status });
        return;
      }

      const err = parsed?.error ?? {
        code: `HTTP_${status}`,
        message: xhr.statusText || 'Upload failed',
      };
      reject(
        new ApiClientError(
          status,
          err.code ?? `HTTP_${status}`,
          err.message ?? 'Upload failed',
          err.details,
        ),
      );
    });

    xhr.addEventListener('error', () => {
      if (xhrRef) xhrRef.current = null;
      reject(
        new ApiClientError(
          0,
          'NETWORK_ERROR',
          'Network error. Check your connection and try again.',
        ),
      );
    });

    xhr.addEventListener('abort', () => {
      if (xhrRef) xhrRef.current = null;
      const aborted = new Error('aborted');
      aborted.name = 'AbortError';
      reject(aborted);
    });

    xhr.send(body);
  });
}

/**
 * Best-effort flattening of class-validator's `details` field which arrives
 * as a string[] (or sometimes an object). Returns a user-readable string or
 * the supplied fallback if we couldn't extract anything useful.
 */
export function flattenValidationDetails(
  details: unknown,
  fallback: string,
): string {
  if (Array.isArray(details)) {
    const lines = (details as unknown[])
      .filter((d): d is string => typeof d === 'string')
      .join(' ');
    if (lines.length > 0) return lines;
  }
  if (typeof details === 'string' && details.length > 0) return details;
  return fallback;
}
