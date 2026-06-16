/**
 * Vaasenk Mobile — Downloads service.
 *
 * Offline-cache layer for notes. Backed by `expo-file-system`:
 *
 *   documentDirectory/
 *     vaasenk/
 *       downloads.json                          ← index (this module owns it)
 *       {institutionId}/notes/{noteId}/{filename}  ← per-note payload
 *
 * Per CLAUDE.md §3 rule 5 the on-device path is namespaced by
 * institutionId. Since the client doesn't trust its own claim about
 * institutionId, we derive it from the NoteView (which the backend
 * stamped from the JWT before sending) — the same value the server
 * already used as the storage path prefix.
 *
 * Index design notes:
 * - JSON, NOT SQLite. The Downloads screen will rarely hold >100 items;
 *   a flat array is fine and avoids a native dependency.
 * - Reads always wrap a try/catch so a corrupt file never crashes the
 *   downloads tab; we rebuild from scratch on parse failure.
 * - Writes are atomic-ish via `writeAsStringAsync` (Expo guarantees a
 *   tmpfile + rename on iOS / Android — not a partial overwrite).
 */

import * as FileSystem from 'expo-file-system';
import type { NoteView } from './notes';

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

const ROOT = `${FileSystem.documentDirectory}vaasenk/`;
const INDEX_PATH = `${ROOT}downloads.json`;

function notesFolderFor(institutionId: string, noteId: string): string {
  // Mirror the backend Supabase Storage path so debugging is easy.
  return `${ROOT}${institutionId}/notes/${noteId}/`;
}

function safeFilenameFromUrl(url: string, fallback: string): string {
  // Strip the query string (signed URLs have one) then take the trailing
  // path segment. If anything looks wrong, fall back to a UUID-ish name.
  try {
    const noQuery = url.split('?')[0] ?? '';
    const segments = noQuery.split('/');
    const last = segments[segments.length - 1] ?? '';
    if (last && /^[A-Za-z0-9._-]+$/.test(last)) return last;
  } catch {
    // Fall through.
  }
  return fallback;
}

async function ensureDir(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

// ---------------------------------------------------------------------------
// Index types
// ---------------------------------------------------------------------------

export type DownloadEntry = {
  noteId: string;
  classroomId: string;
  classroomName: string | null;
  institutionId: string;
  title: string;
  mimeType: string | null;
  localUri: string;
  sizeBytes: number;
  downloadedAt: string; // ISO
};

type DownloadIndex = {
  version: 1;
  entries: DownloadEntry[];
};

const EMPTY_INDEX: DownloadIndex = { version: 1, entries: [] };

async function readIndex(): Promise<DownloadIndex> {
  try {
    const info = await FileSystem.getInfoAsync(INDEX_PATH);
    if (!info.exists) return { ...EMPTY_INDEX };
    const raw = await FileSystem.readAsStringAsync(INDEX_PATH);
    const parsed = JSON.parse(raw) as Partial<DownloadIndex>;
    if (parsed && parsed.version === 1 && Array.isArray(parsed.entries)) {
      return { version: 1, entries: parsed.entries };
    }
    return { ...EMPTY_INDEX };
  } catch {
    // Corrupt / unreadable — treat as fresh. The next write will fix it.
    return { ...EMPTY_INDEX };
  }
}

async function writeIndex(index: DownloadIndex): Promise<void> {
  await ensureDir(ROOT);
  await FileSystem.writeAsStringAsync(INDEX_PATH, JSON.stringify(index));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Download a note's file to local storage and add an index entry.
 *
 * @param note    Backend NoteView (used for metadata + institutionId).
 * @param signedUrl Fresh signed URL. We do NOT re-fetch it here — pass the
 *                  url you already got from the detail call. Signed URLs
 *                  live 1h, plenty for an interactive download.
 * @param onProgress Optional progress callback (0..1).
 */
export async function downloadNote(
  note: NoteView,
  signedUrl: string,
  onProgress?: (fraction: number) => void,
): Promise<DownloadEntry> {
  if (!note.institutionId) {
    throw new Error('Note is missing institutionId; cannot download safely.');
  }
  const folder = notesFolderFor(note.institutionId, note.id);
  await ensureDir(folder);

  // Pick a stable filename. Prefer the URL's tail because the backend
  // already sanitized it; fall back to a synthetic name keyed by noteId.
  const filename = safeFilenameFromUrl(signedUrl, `note-${note.id}.bin`);
  const localUri = `${folder}${filename}`;

  const downloadResumable = FileSystem.createDownloadResumable(
    signedUrl,
    localUri,
    {},
    onProgress
      ? (progress) => {
          if (progress.totalBytesExpectedToWrite > 0) {
            const fraction =
              progress.totalBytesWritten /
              progress.totalBytesExpectedToWrite;
            onProgress(Math.max(0, Math.min(1, fraction)));
          }
        }
      : undefined,
  );

  const result = await downloadResumable.downloadAsync();
  if (!result || result.status >= 400) {
    throw new Error(
      `Download failed${result ? ` (HTTP ${result.status})` : ''}`,
    );
  }

  const info = await FileSystem.getInfoAsync(result.uri, { size: true });
  const sizeBytes =
    'size' in info && typeof info.size === 'number' ? info.size : 0;

  const entry: DownloadEntry = {
    noteId: note.id,
    classroomId: note.classroomId,
    classroomName: note.classroom?.name ?? null,
    institutionId: note.institutionId,
    title: note.title,
    mimeType: note.mimeType ?? note.fileType ?? null,
    localUri: result.uri,
    sizeBytes,
    downloadedAt: new Date().toISOString(),
  };

  // Update the index — replace any existing row for the same note id.
  const index = await readIndex();
  const next = {
    version: 1 as const,
    entries: [entry, ...index.entries.filter((e) => e.noteId !== note.id)],
  };
  await writeIndex(next);
  return entry;
}

/** Check whether a note has been downloaded for offline reading. */
export async function getLocalDownloadUri(
  noteId: string,
): Promise<DownloadEntry | null> {
  const index = await readIndex();
  const entry = index.entries.find((e) => e.noteId === noteId);
  if (!entry) return null;
  // Defensive: the file might have been swept by the OS. If it's gone,
  // remove the stale entry so the UI doesn't lie.
  try {
    const info = await FileSystem.getInfoAsync(entry.localUri);
    if (!info.exists) {
      const next = {
        version: 1 as const,
        entries: index.entries.filter((e) => e.noteId !== noteId),
      };
      await writeIndex(next);
      return null;
    }
  } catch {
    return null;
  }
  return entry;
}

/** List all downloads sorted newest-first (by downloadedAt). */
export async function listDownloads(): Promise<DownloadEntry[]> {
  const index = await readIndex();
  return [...index.entries].sort((a, b) =>
    b.downloadedAt.localeCompare(a.downloadedAt),
  );
}

/** Delete a downloaded note's file + remove its index entry. */
export async function deleteDownload(noteId: string): Promise<void> {
  const index = await readIndex();
  const entry = index.entries.find((e) => e.noteId === noteId);
  if (entry) {
    try {
      await FileSystem.deleteAsync(entry.localUri, { idempotent: true });
    } catch {
      // Best-effort — the index update below is the source of truth.
    }
  }
  const next = {
    version: 1 as const,
    entries: index.entries.filter((e) => e.noteId !== noteId),
  };
  await writeIndex(next);
}

/** Total bytes used by all downloads (handy for a "free up space" hint). */
export async function totalDownloadedBytes(): Promise<number> {
  const index = await readIndex();
  return index.entries.reduce((acc, e) => acc + (e.sizeBytes ?? 0), 0);
}

/** Helper for the UI — format a byte size for display. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
