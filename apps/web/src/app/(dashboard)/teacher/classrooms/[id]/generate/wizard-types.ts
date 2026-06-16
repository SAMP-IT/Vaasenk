/**
 * Shared TypeScript types for the Question Paper Generator wizard
 * (Sprint 5.3 / Playbook Prompt 21).
 *
 * Wire-level shapes mirror the NestJS DTOs in:
 *   apps/api/src/modules/question-papers/question-papers.dto.ts
 *   apps/api/src/modules/sample-papers/sample-papers.dto.ts
 *
 * Kept local to the wizard (NOT in shared-types) until other surfaces
 * need them — every type here is read by the wizard and only the wizard.
 */

// ---------------------------------------------------------------------------
// Exam type enum mirror — keep in lock-step with the Prisma ExamType enum
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
// Wizard state — the locally-held configuration as the teacher fills the form
// ---------------------------------------------------------------------------

export type QuestionTypeRow = {
  /** Local-only stable id for React keys (not sent to the API). */
  id: string;
  type: string;
  count: number;
  marksEach: number;
};

export type WizardData = {
  // Step 1 — portions
  wholeSyllabus: boolean;
  portionsInput: string; // raw textarea text
  portions: string[]; // parsed + deduped chips (excluding wholeSyllabus sentinel)

  // Step 2 — exam config
  examType: ExamType;
  totalMarks: number;
  durationMinutes: number | null; // null = unset
  questionTypes: QuestionTypeRow[];
  customizeDifficulty: boolean;
  difficulty: { easy: number; medium: number; hard: number };
  includeAnswerKey: boolean;

  // Step 3 — sample guidance
  useSamplePapers: boolean;
  samplePaperIds: string[];

  // Step 4 — generation
  jobId: string | null;
};

// ---------------------------------------------------------------------------
// Wire types — server envelopes (mirror question-papers controller)
// ---------------------------------------------------------------------------

export type ClassroomLite = {
  id: string;
  name: string;
  class: { id: string; name: string } | null;
  section: { id: string; name: string } | null;
  subject: { id: string; name: string } | null;
  teacher: { id: string; name: string; email: string | null } | null;
  syllabus: { id: string; name: string; status: string } | null;
};

export type AuthMe = {
  id: string;
  institutionId: string;
  role: string;
};

export type SamplePaperListItem = {
  id: string;
  name: string;
  examType: ExamType;
  year: number | null;
  priority: 'high' | 'normal' | 'archive' | null;
  status: string; // ProcessingStatus
  classId: string | null;
  subjectId: string | null;
  createdAt: string;
};

export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

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

export type QuestionSource = {
  chapter?: string;
  topic?: string;
};

export type QuestionItem = {
  type: string;
  text: string;
  marks: number;
  options?: string[];
  answer?: string;
  source?: QuestionSource;
};

export type QuestionSection = {
  name: string;
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

// ---------------------------------------------------------------------------
// Quick-pick suggestions for the question types builder
// ---------------------------------------------------------------------------

export const QUESTION_TYPE_PRESETS: Array<{
  label: string;
  type: string;
  marksEach: number;
}> = [
  { label: 'MCQ (1 mark)', type: 'MCQ', marksEach: 1 },
  { label: 'Short Answer (2 marks)', type: 'Short Answer', marksEach: 2 },
  { label: 'Short Answer (5 marks)', type: 'Short Answer', marksEach: 5 },
  { label: 'Long Answer (10 marks)', type: 'Long Answer', marksEach: 10 },
  { label: 'Fill in the Blanks', type: 'Fill in the Blanks', marksEach: 1 },
  { label: 'True / False', type: 'True/False', marksEach: 1 },
];

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

let _rowCounter = 0;
export const newRowId = (): string =>
  `q-${++_rowCounter}-${Date.now().toString(36)}`;

export const defaultWizardData = (): WizardData => ({
  wholeSyllabus: false,
  portionsInput: '',
  portions: [],

  examType: 'UNIT_TEST',
  totalMarks: 50,
  durationMinutes: 60,
  questionTypes: [
    { id: newRowId(), type: 'MCQ', count: 10, marksEach: 1 },
  ],
  customizeDifficulty: false,
  difficulty: { easy: 30, medium: 50, hard: 20 },
  includeAnswerKey: true,

  useSamplePapers: false,
  samplePaperIds: [],

  jobId: null,
});

// ---------------------------------------------------------------------------
// Step metadata
// ---------------------------------------------------------------------------

export const STEPS = [
  { key: 'portions', label: 'Portions' },
  { key: 'config', label: 'Config' },
  { key: 'guidance', label: 'Guidance' },
  { key: 'generate', label: 'Generate' },
  { key: 'preview', label: 'Preview' },
  { key: 'export', label: 'Export' },
] as const;

export type StepIndex = 0 | 1 | 2 | 3 | 4 | 5;

// ---------------------------------------------------------------------------
// Generation milestones (drives the polling step ticker in step 4)
// ---------------------------------------------------------------------------

export const GENERATION_MILESTONES = [
  { step: 'Preparing syllabus context', threshold: 10 },
  { step: 'Analyzing sample patterns', threshold: 30 },
  { step: 'Drafting questions', threshold: 50 },
  { step: 'Validating structure', threshold: 75 },
  { step: 'Saving paper', threshold: 90 },
] as const;
