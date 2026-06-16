/**
 * Vaasenk Mobile — Notes service.
 *
 * Mirrors apps/api/src/modules/notes/{notes.controller,notes.service}.ts:
 *
 *   GET    /api/v1/classrooms/:id/notes?tag=...&page=...   — list in classroom
 *   POST   /api/v1/classrooms/:id/notes                    — multipart upload (teacher)
 *   GET    /api/v1/notes/:id                               — detail + signed URL
 *   DELETE /api/v1/notes/:id                               — soft-delete (teacher)
 *   POST   /api/v1/notes/:id/bookmark                      — toggle (idempotent)
 *   GET    /api/v1/bookmarks                               — current user's bookmarks
 *
 * Per CLAUDE.md §3 rule 4 the client never sends institutionId; the JWT
 * carries it. The backend signs URLs at read-time with a 1h TTL (see
 * NotesService.toView) — we surface `signedExpiresAt` so callers can
 * decide when to re-fetch on stale links.
 */

import Constants from 'expo-constants';
import { ApiClientError, apiDelete, apiFetchEnvelope, apiGet, apiPost } from './api';
import { getAccessToken } from './supabase';

// ---------------------------------------------------------------------------
// Note view types — match notes-constants.ts on the web app.
// ---------------------------------------------------------------------------

export const NOTE_TAGS = [
  'IMPORTANT',
  'HOMEWORK',
  'EXAM',
  'ASSIGNMENT',
  'REVISION',
  'FORMULA',
] as const;
export type NoteTag = (typeof NOTE_TAGS)[number];

export const TAG_LABELS: Record<NoteTag, string> = {
  IMPORTANT: 'Important',
  HOMEWORK: 'Homework',
  EXAM: 'Exam',
  ASSIGNMENT: 'Assignment',
  REVISION: 'Revision',
  FORMULA: 'Formula',
};

export type NoteStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type NoteView = {
  id: string;
  classroomId: string;
  institutionId: string;
  title: string;
  description: string | null;
  filePath: string | null;
  thumbnailPath: string | null;
  fileSignedUrl: string | null;
  thumbnailSignedUrl: string | null;
  mimeType?: string | null;
  fileType?: string | null;
  sizeBytes?: number | null;
  tags: NoteTag[];
  status: NoteStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt?: string;
  downloadCount: number;
  bookmarkedByMe?: boolean;
  teacher: {
    id: string;
    name: string;
    email?: string | null;
    avatarUrl: string | null;
  };
  classroom?: { id: string; name: string };
};

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

const DEFAULT_PAGE_SIZE = 20;

export type NoteSort =
  | 'publishedAt:desc'
  | 'publishedAt:asc'
  | 'createdAt:desc';

export async function listClassroomNotes(
  classroomId: string,
  options?: {
    tag?: NoteTag;
    page?: number;
    limit?: number;
    sort?: NoteSort;
  },
): Promise<{
  data: NoteView[];
  meta: { page: number; limit: number; total: number };
}> {
  const params = new URLSearchParams();
  params.set('page', String(options?.page ?? 1));
  params.set('limit', String(options?.limit ?? DEFAULT_PAGE_SIZE));
  params.set('sort', options?.sort ?? 'publishedAt:desc');
  params.set('status', 'PUBLISHED');
  if (options?.tag) params.set('tag', options.tag);

  const result = await apiFetchEnvelope<NoteView[]>(
    `/api/v1/classrooms/${classroomId}/notes?${params.toString()}`,
  );
  return {
    data: result.data ?? [],
    meta: {
      page: result.meta?.page ?? 1,
      limit: result.meta?.limit ?? DEFAULT_PAGE_SIZE,
      total: result.meta?.total ?? (result.data ?? []).length,
    },
  };
}

/**
 * GET /notes/:id — backend computes a fresh 1h signed URL on every call
 * and stamps `bookmarkedByMe`. The web equivalent re-derives bookmarked
 * via a separate /bookmarks lookup; mobile prefers the inline flag to
 * save the round-trip.
 */
export async function getNote(noteId: string): Promise<NoteView> {
  const result = await apiGet<{ note: NoteView }>(`/api/v1/notes/${noteId}`);
  return result.note;
}

/**
 * POST /notes/:id/bookmark — toggle. Backend returns
 * `{ bookmarked: boolean }` with the new state. We expose specific
 * `bookmark` / `unbookmark` helpers so screens don't have to think
 * about toggle semantics; both call the same endpoint.
 */
export async function toggleBookmark(
  noteId: string,
): Promise<{ bookmarked: boolean }> {
  return apiPost<{ bookmarked: boolean }>(`/api/v1/notes/${noteId}/bookmark`);
}

/**
 * Convenience: if you know the desired state, call this. It still calls
 * the toggle endpoint (the backend has no dedicated PUT/DELETE) — we
 * just retry once if the first call's result doesn't match the intent.
 */
export async function setBookmark(
  noteId: string,
  desired: boolean,
): Promise<{ bookmarked: boolean }> {
  const first = await toggleBookmark(noteId);
  if (first.bookmarked === desired) return first;
  return toggleBookmark(noteId);
}

/**
 * GET /bookmarks — list the current user's bookmarked notes. Backend
 * paginates and returns each note's signed URL alongside the cached
 * teacher/classroom relations.
 */
export async function listBookmarkedNotes(options?: {
  page?: number;
  limit?: number;
}): Promise<{
  data: NoteView[];
  meta: { page: number; limit: number; total: number };
}> {
  const params = new URLSearchParams();
  params.set('page', String(options?.page ?? 1));
  params.set('limit', String(options?.limit ?? 50));
  const result = await apiFetchEnvelope<NoteView[]>(
    `/api/v1/bookmarks?${params.toString()}`,
  );
  return {
    data: result.data ?? [],
    meta: {
      page: result.meta?.page ?? 1,
      limit: result.meta?.limit ?? 50,
      total: result.meta?.total ?? (result.data ?? []).length,
    },
  };
}

/**
 * DELETE /api/v1/notes/:id — soft delete (TEACHER + ADMIN). Backend sets
 * NoteStatus.ARCHIVED + leaves storage in place for admin restore.
 * Returns 204 No Content; `apiDelete` unwraps that as `undefined`.
 */
export async function deleteNoteForTeacher(noteId: string): Promise<void> {
  await apiDelete(`/api/v1/notes/${noteId}`);
}

// ---------------------------------------------------------------------------
// Teacher upload (Sprint 7.3) — multipart with XHR progress
// ---------------------------------------------------------------------------

/**
 * Upload payload coming out of the QuickUpload flow. The image URI is the
 * post-manipulation file:// path produced by expo-image-manipulator (which
 * also keeps a JPEG copy in cache so the URI is stable across the upload).
 *
 * Per CLAUDE.md §3 we never send `institutionId` from the client — the
 * backend derives it from the JWT on the multipart route.
 */
export type UploadNotePayload = {
  classroomId: string;
  file: {
    /** Local file URI (file:// on iOS/Android, blob: on web). */
    uri: string;
    /** MIME type — auto-detected if missing (defaults to image/jpeg). */
    type?: string | null;
    /** Filename including extension. Backend uses this for the stored object key. */
    name: string;
  };
  title: string;
  description?: string;
  tags?: NoteTag[];
  status?: 'DRAFT' | 'PUBLISHED';
};

/** Status callback invoked on XHR upload progress events (0–100). */
export type UploadProgressFn = (pct: number) => void;

/**
 * POST /api/v1/classrooms/:id/notes — multipart upload.
 *
 * Why XHR instead of fetch? React Native's `fetch` does not surface upload
 * progress events; `XMLHttpRequest.upload.onprogress` does (and is fully
 * supported on RN 0.74+). Mirrors apps/web/src/lib/xhr-upload.ts so the
 * teacher gets a real % counter during publish.
 *
 * Resolves with the parsed `note` field from the success envelope. Throws
 * `ApiClientError` on non-2xx; throws `AbortError` if the caller aborts.
 */
export function uploadNote(
  payload: UploadNotePayload,
  options?: {
    onProgress?: UploadProgressFn;
    /** Caller-owned ref so the screen can abort an in-flight upload. */
    xhrRef?: { current: XMLHttpRequest | null };
  },
): Promise<NoteView> {
  return new Promise<NoteView>((resolve, reject) => {
    void (async () => {
      const token = await getAccessToken();
      const base = resolveBaseUrl();
      const url = `${base}/api/v1/classrooms/${payload.classroomId}/notes`;

      // Build the multipart body. React Native's FormData accepts the
      // `{ uri, name, type }` shape directly (this is the RN convention,
      // not the DOM File spec).
      const fd = new FormData();
      const fileType = payload.file.type ?? guessMime(payload.file.name);
      fd.append('file', {
        uri: payload.file.uri,
        name: payload.file.name,
        type: fileType,
        // The `as unknown as Blob` cast keeps TS happy — RN's FormData
        // accepts this shape at runtime even though the lib.dom.d.ts type
        // declares it as Blob | string only.
      } as unknown as Blob);
      fd.append('title', payload.title.trim());
      if (payload.description) {
        fd.append('description', payload.description.trim());
      }
      if (payload.tags && payload.tags.length > 0) {
        // Backend accepts repeated fields OR a comma-separated string —
        // repeated keeps the wire format unambiguous for class-validator.
        for (const tag of payload.tags) fd.append('tags', tag);
      }
      fd.append('status', payload.status ?? 'PUBLISHED');

      const xhr = new XMLHttpRequest();
      if (options?.xhrRef) options.xhrRef.current = xhr;
      xhr.open('POST', url);
      // NEVER set Content-Type on multipart FormData — the runtime sets
      // it (with the boundary) automatically.
      if (token) {
        xhr.setRequestHeader('authorization', `Bearer ${token}`);
      }

      xhr.upload.addEventListener('progress', (ev) => {
        if (!options?.onProgress || !ev.lengthComputable) return;
        const pct = Math.round((ev.loaded / ev.total) * 100);
        options.onProgress(pct);
      });

      xhr.addEventListener('load', () => {
        if (options?.xhrRef) options.xhrRef.current = null;
        const status = xhr.status;
        const ok = status >= 200 && status < 300;
        type Envelope = {
          data?: { note?: NoteView };
          error?: { code?: string; message?: string; details?: unknown };
        };
        let parsed: Envelope | null = null;
        try {
          parsed = xhr.responseText
            ? (JSON.parse(xhr.responseText) as Envelope)
            : null;
        } catch {
          parsed = null;
        }
        if (ok) {
          const note = parsed?.data?.note;
          if (!note) {
            reject(
              new ApiClientError(
                status,
                'UPLOAD_PARSE_ERROR',
                'Upload succeeded but the response was malformed.',
              ),
            );
            return;
          }
          resolve(note);
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
        if (options?.xhrRef) options.xhrRef.current = null;
        reject(
          new ApiClientError(
            0,
            'NETWORK_ERROR',
            'Network error. Check your connection and try again.',
          ),
        );
      });

      xhr.addEventListener('abort', () => {
        if (options?.xhrRef) options.xhrRef.current = null;
        const aborted = new Error('aborted');
        aborted.name = 'AbortError';
        reject(aborted);
      });

      xhr.send(fd);
    })().catch(reject);
  });
}

/**
 * Resolve the API base URL identically to services/api.ts but at the
 * boundary of the multipart upload (which doesn't use apiFetch). Kept
 * inline so we don't widen the api.ts surface.
 */
function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  const fromExtra =
    (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  const raw = fromEnv ?? fromExtra ?? 'http://localhost:4000';
  return raw.replace(/\/$/, '');
}

/** Best-effort MIME inference from a filename. The backend re-validates. */
function guessMime(name: string): string {
  const ext = name.toLowerCase().split('.').pop();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'pdf':
      return 'application/pdf';
    case 'txt':
      return 'text/plain';
    default:
      return 'application/octet-stream';
  }
}
