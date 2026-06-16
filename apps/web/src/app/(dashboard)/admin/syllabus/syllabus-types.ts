/**
 * API contract types — mirror the Sprint 3.3 backend (FROZEN).
 *
 * Kept inline rather than imported from packages/shared-types because the
 * NestJS DTOs use class-validator decorators that don't carry through a
 * type-only import. The shape here exactly matches the SyllabusView /
 * SyllabusDetailView returned by apps/api/src/modules/syllabus.
 */

export type ProcessingStatus =
  | 'UPLOADED'
  | 'PROCESSING'
  | 'AI_READY'
  | 'FAILED';

export const PROCESSING_STATUS_VALUES = [
  'UPLOADED',
  'PROCESSING',
  'AI_READY',
  'FAILED',
] as const satisfies readonly ProcessingStatus[];

export type SyllabusView = {
  id: string;
  name: string;
  boardType: string | null;
  language: string | null;
  version: string | null;
  status: ProcessingStatus;
  isActive: boolean;
  fileSizeBytes: number | null;
  pageCount: number | null;
  errorMessage: string | null;
  class: { id: string; name: string } | null;
  subject: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  _count: { chunks: number; classrooms: number };
};

export type ProcessingTimelineEntry = {
  status: ProcessingStatus;
  at: string;
};

export type MappedClassroomSummary = {
  id: string;
  name: string;
  class?: { id: string; name: string } | null;
  section?: { id: string; name: string } | null;
  subject?: { id: string; name: string } | null;
  teacher?: { id: string; name: string } | null;
};

export type SyllabusDetailView = SyllabusView & {
  fileSignedUrl: string | null;
  processingTimeline: ProcessingTimelineEntry[];
  chunksCount: number;
  mappedClassrooms: MappedClassroomSummary[];
};

export type ClassroomPickerOption = {
  id: string;
  name: string;
  status?: string;
  class?: { id: string; name: string } | null;
  section?: { id: string; name: string } | null;
  subject?: { id: string; name: string } | null;
  teacher?: { id: string; name: string } | null;
  syllabus?: { id: string; name: string } | null;
};

// ---------------------------------------------------------------------------
// UX constants — single source of truth for filter chips and pickers.
// ---------------------------------------------------------------------------

/**
 * Common Indian boards we ship as a default datalist. Admins can still type
 * a free-text value (e.g. a regional board name) — this is a hint, not a
 * constraint. Order chosen to surface Tamil Nadu boards first since that's
 * the primary launch market.
 */
export const COMMON_BOARDS = [
  'Samacheer Kalvi',
  'State Board – TN',
  'CBSE',
  'ICSE',
  'IB',
  'Cambridge',
] as const;

export const LANGUAGE_OPTIONS = [
  { value: 'English', label: 'English' },
  { value: 'Tamil', label: 'Tamil' },
  { value: 'Hindi', label: 'Hindi' },
  { value: 'Bilingual', label: 'Bilingual (English + Tamil)' },
  { value: 'Other', label: 'Other' },
] as const;

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const ALLOWED_MIME = new Set(['application/pdf']);
export const ALLOWED_EXT_HINT = '.pdf,application/pdf';

export const STATUS_LABELS: Record<ProcessingStatus, string> = {
  UPLOADED: 'Uploaded',
  PROCESSING: 'Processing',
  AI_READY: 'AI ready',
  FAILED: 'Failed',
};

export const STATUS_TOOLTIPS: Record<ProcessingStatus, string> = {
  UPLOADED: 'PDF received and queued for processing.',
  PROCESSING:
    'Extracting text, chunking, and generating embeddings. Usually 1–2 minutes.',
  AI_READY:
    'Indexed and ready. Teachers can use the AI assistant against this syllabus.',
  FAILED:
    'Processing failed. Inspect the error message and reprocess after fixing the PDF.',
};

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

export function formatRelative(iso: string): string {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return '—';
  const now = new Date();
  const diffMs = now.getTime() - target.getTime();
  const min = 1000 * 60;
  const hr = min * 60;
  const day = hr * 24;
  if (diffMs < min) return 'just now';
  if (diffMs < hr) return `${Math.floor(diffMs / min)} min ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hr)}h ago`;
  const days = Math.floor(diffMs / day);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)} wk ago`;
  return target.toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    ...(now.getFullYear() === target.getFullYear() ? {} : { year: 'numeric' }),
  });
}

export function formatAbsolute(iso: string): string {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return '—';
  return target.toLocaleString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
