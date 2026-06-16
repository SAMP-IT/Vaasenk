/**
 * Shared note-tag + note-view constants for the web app.
 *
 * Single source of truth for both the teacher classroom detail screens and
 * the student classroom feed / viewer (Sprint 2.5). The enums are duplicated
 * here (rather than imported from @prisma/client) so the client bundle stays
 * free of any server-only imports. Order matches the design-doc's recommended
 * display order: severity-tinted (red/orange) first, neutral last.
 */

export const NOTE_TAGS = [
  'IMPORTANT',
  'HOMEWORK',
  'EXAM',
  'ASSIGNMENT',
  'REVISION',
  'FORMULA',
] as const;

export type NoteTag = (typeof NOTE_TAGS)[number];

export const NOTE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type NoteStatus = (typeof NOTE_STATUSES)[number];

/**
 * Friendly sentence-case labels (en-IN). Per design-docs typography:
 * "Use sentence case for buttons and labels". The all-caps enum stays in
 * the API; only display uses these labels.
 */
export const TAG_LABELS: Record<NoteTag, string> = {
  IMPORTANT: 'Important',
  HOMEWORK: 'Homework',
  EXAM: 'Exam',
  ASSIGNMENT: 'Assignment',
  REVISION: 'Revision',
  FORMULA: 'Formula',
};

/**
 * Tag → Tailwind classes for the small badge surface. Background tints
 * use status token alphas (per the brief) so dark mode / contrast tweaks
 * later flow through. Text colors are full-strength tokens.
 */
export const TAG_CHIP_CLASSES: Record<NoteTag, string> = {
  IMPORTANT: 'bg-(--vaasenk-danger)/15 text-(--vaasenk-danger)',
  HOMEWORK: 'bg-(--vaasenk-warning)/15 text-(--vaasenk-warning)',
  REVISION: 'bg-(--vaasenk-info)/15 text-(--vaasenk-info)',
  FORMULA: 'bg-(--vaasenk-gold)/20 text-(--vaasenk-deep-maroon)',
  ASSIGNMENT: 'bg-(--vaasenk-coral-pink)/15 text-(--vaasenk-coral-pink)',
  EXAM: 'bg-(--vaasenk-deep-maroon)/10 text-(--vaasenk-deep-maroon)',
};

/**
 * The note view shape returned by GET /api/v1/classrooms/:id/notes,
 * GET /api/v1/notes/:id, and the recent-notes blob on the student
 * dashboard. Kept loose where the backend is loose (description, mimeType,
 * thumbnail can all be null for in-flight uploads).
 */
export type NoteView = {
  id: string;
  classroomId: string;
  title: string;
  description: string | null;
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
  teacher: {
    id: string;
    name: string;
    email?: string | null;
    avatarUrl: string | null;
  };
  classroom?: { id: string; name: string };
};
