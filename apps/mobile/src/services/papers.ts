/**
 * Vaasenk Mobile — Question Papers service (Sprint 7.3).
 *
 * Mirrors apps/api/src/modules/question-papers/question-papers.controller.ts:
 *
 *   POST   /api/v1/classrooms/:id/question-papers/generate  — create job
 *   GET    /api/v1/question-papers/jobs/:id                 — poll job
 *   POST   /api/v1/question-papers/:id/export               — render PDFs
 *   POST   /api/v1/question-papers/:id/publish              — publish to classroom
 *
 * GAPS (documented for follow-up):
 *
 *   - There is NO `GET /classrooms/:id/question-papers` list endpoint.
 *     The teacher Papers tab therefore cannot show historical papers; it
 *     surfaces a placeholder and the "Generate new paper" CTA only.
 *   - There is NO `GET /question-papers/:id` detail endpoint. Papers must
 *     be navigated to via the `jobId` returned from `generate()` — the
 *     job's `paper` field carries the full structured content.
 *
 * Wire types intentionally duplicate the web's wizard-types.ts shapes;
 * mobile wizard is simpler so we re-declare a smaller subset rather than
 * pull in the whole web types file.
 */

import { apiGet, apiPost } from './api';

// ---------------------------------------------------------------------------
// Enums + value tables (mirror @prisma/client + web wizard)
// ---------------------------------------------------------------------------

export const EXAM_TYPE_VALUES = [
  'UNIT_TEST',
  'MONTHLY_TEST',
  'QUARTERLY',
  'HALF_YEARLY',
  'ANNUAL',
  'REVISION_TEST',
  'CUSTOM',
] as const;
export type ExamType = (typeof EXAM_TYPE_VALUES)[number];

export const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  UNIT_TEST: 'Unit Test',
  MONTHLY_TEST: 'Monthly Test',
  QUARTERLY: 'Quarterly',
  HALF_YEARLY: 'Half Yearly',
  ANNUAL: 'Annual',
  REVISION_TEST: 'Revision Test',
  CUSTOM: 'Custom',
};

// ---------------------------------------------------------------------------
// Generation request / response types
// ---------------------------------------------------------------------------

export type QuestionTypeConfig = {
  type: string;
  count: number;
  marksEach: number;
};

export type DifficultySplit = { easy: number; medium: number; hard: number };

export type GeneratePaperInput = {
  syllabusId?: string;
  portions: string[];
  examType: ExamType;
  totalMarks: number;
  durationMinutes?: number;
  questionTypes: QuestionTypeConfig[];
  difficulty?: DifficultySplit;
  samplePaperIds?: string[];
  includeAnswerKey: boolean;
};

export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export type QuestionItem = {
  type: string;
  text: string;
  marks: number;
  options?: string[];
  answer?: string;
  source?: { chapter?: string; topic?: string };
};

export type QuestionSection = {
  name: string;
  instructions?: string;
  questions: QuestionItem[];
};

export type StructuredContent = {
  title: string;
  instructions: string;
  sections: QuestionSection[];
};

export type QuestionPaperDetail = {
  id: string;
  jobId: string;
  classroomId: string;
  teacherId: string;
  institutionId: string;
  title: string;
  examType: ExamType;
  totalMarks: number;
  durationMinutes: number | null;
  structuredContent: StructuredContent;
  fileUrl: string | null;
  fileSignedUrl: string | null;
  answerKeyFileUrl: string | null;
  answerKeySignedUrl: string | null;
  aiConfidence: number | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt: string | null;
  sourceSummary: {
    syllabusName: string;
    syllabusVersion: string;
    samplePaperNames: string[];
  };
  createdAt: string;
  updatedAt: string;
};

export type QuestionPaperJob = {
  id: string;
  status: JobStatus;
  progress?: { step: string; percentage: number } | null;
  paperId?: string | null;
  paper?: QuestionPaperDetail | null;
  inputConfig: unknown;
  errorMessage?: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

/**
 * POST /api/v1/classrooms/:id/question-papers/generate — enqueue a job.
 * Returns the job in RUNNING state; callers poll `getJob(job.id)`.
 */
export async function generatePaper(
  classroomId: string,
  payload: GeneratePaperInput,
): Promise<{ job: QuestionPaperJob }> {
  return apiPost<{ job: QuestionPaperJob }>(
    `/api/v1/classrooms/${classroomId}/question-papers/generate`,
    payload,
  );
}

/** GET /api/v1/question-papers/jobs/:id — polled every ~2s by the screen. */
export async function getPaperJob(
  jobId: string,
): Promise<{ job: QuestionPaperJob }> {
  return apiGet<{ job: QuestionPaperJob }>(`/api/v1/question-papers/jobs/${jobId}`);
}

/**
 * POST /api/v1/question-papers/:id/export — render the paper + answer key
 * to PDF and return signed URLs. Idempotent — re-exporting an already-
 * exported paper returns the existing signed URL.
 */
export async function exportPaper(
  paperId: string,
): Promise<{ paper: QuestionPaperDetail }> {
  return apiPost<{ paper: QuestionPaperDetail }>(
    `/api/v1/question-papers/${paperId}/export`,
    {},
  );
}

/**
 * POST /api/v1/question-papers/:id/publish — publish to classroom (sets
 * status=PUBLISHED + fans out PAPER_PUBLISHED notifications). Requires a
 * prior export (412 otherwise).
 */
export async function publishPaper(
  paperId: string,
): Promise<{ paper: QuestionPaperDetail }> {
  return apiPost<{ paper: QuestionPaperDetail }>(
    `/api/v1/question-papers/${paperId}/publish`,
    {},
  );
}

// ---------------------------------------------------------------------------
// UI helpers (shared between GeneratePaperScreen and PaperPreviewScreen)
// ---------------------------------------------------------------------------

/**
 * Polling milestones — drives the progress ticker on the GeneratePaper
 * screen. Mirrors the web's GENERATION_MILESTONES.
 */
export const GENERATION_MILESTONES = [
  { step: 'Preparing syllabus context', threshold: 10 },
  { step: 'Analyzing sample patterns', threshold: 30 },
  { step: 'Drafting questions', threshold: 50 },
  { step: 'Validating structure', threshold: 75 },
  { step: 'Saving paper', threshold: 90 },
] as const;

/**
 * Pre-fab paper configurations the teacher can pick to skip the form.
 * Each preset names a sensible default for Indian school exams.
 */
export type PaperPreset = {
  id: string;
  label: string;
  description: string;
  examType: ExamType;
  totalMarks: number;
  durationMinutes: number;
  questionTypes: QuestionTypeConfig[];
};

export const PAPER_PRESETS: PaperPreset[] = [
  {
    id: 'unit-50',
    label: 'Quick unit test',
    description: '50 marks · 60 minutes · MCQ + short answer',
    examType: 'UNIT_TEST',
    totalMarks: 50,
    durationMinutes: 60,
    questionTypes: [
      { type: 'MCQ', count: 10, marksEach: 1 },
      { type: 'Short Answer', count: 8, marksEach: 5 },
    ],
  },
  {
    id: 'monthly-100',
    label: 'Monthly test',
    description: '100 marks · 120 minutes · balanced sections',
    examType: 'MONTHLY_TEST',
    totalMarks: 100,
    durationMinutes: 120,
    questionTypes: [
      { type: 'MCQ', count: 15, marksEach: 1 },
      { type: 'Short Answer', count: 5, marksEach: 5 },
      { type: 'Long Answer', count: 6, marksEach: 10 },
    ],
  },
  {
    id: 'quarterly-100',
    label: 'Quarterly exam',
    description: '100 marks · 180 minutes · board-style',
    examType: 'QUARTERLY',
    totalMarks: 100,
    durationMinutes: 180,
    questionTypes: [
      { type: 'MCQ', count: 20, marksEach: 1 },
      { type: 'Short Answer', count: 8, marksEach: 2 },
      { type: 'Short Answer', count: 4, marksEach: 5 },
      { type: 'Long Answer', count: 4, marksEach: 11 },
    ],
  },
];

/**
 * Total marks computed from a list of question type rows. Used by the
 * generator screen to surface a live "Marks: X / Y" badge.
 */
export function sumQuestionTypeMarks(rows: QuestionTypeConfig[]): number {
  return rows.reduce((sum, r) => sum + r.count * r.marksEach, 0);
}
