/**
 * Question Papers — internal types & shared shapes.
 *
 * Sprint 5 PROMPT 20. The structured-content shape is the source of truth
 * for what the LLM is asked to emit, what we validate before persisting, and
 * what the PDF templates consume.
 *
 * Keep this file framework-free — no NestJS decorators, no Prisma imports.
 * It's loaded by:
 *   - the service / worker (orchestration)
 *   - the validation module (parser + checker)
 *   - the prompt builder (schema description for the LLM)
 *   - the PDF templates (rendering)
 */

import type { ExamType } from '@prisma/client';

/** Granular progress step the BullMQ worker writes via job.updateProgress(). */
export type GenerationProgressStep =
  | 'Preparing syllabus context'
  | 'Analyzing sample patterns'
  | 'Drafting questions'
  | 'Validating structure'
  | 'Saving paper';

export interface GenerationProgress {
  step: GenerationProgressStep;
  percentage: number;
}

/**
 * One question inside a section. The LLM must emit this shape (1:1 with the
 * schema described in `paper-prompts.ts`). `answer` is only present when
 * `includeAnswerKey: true`.
 */
export interface GeneratedQuestion {
  type: string;
  text: string;
  marks: number;
  /** MCQ-only — exactly 4 options unless the question type explicitly differs. */
  options?: string[];
  /** Optional — the model may emit "easy" | "medium" | "hard" per question. */
  difficulty?: 'easy' | 'medium' | 'hard';
  /** Optional source reference the model emitted (chapter/topic). */
  source?: {
    chapter?: string;
    topic?: string;
  };
  /** Answer key — REQUIRED when `includeAnswerKey: true` at request time. */
  answer?: string;
}

export interface GeneratedSection {
  /** Human-readable section header, e.g. "Section A — MCQ (1 mark)". */
  name: string;
  /** Optional per-section instructions. */
  instructions?: string;
  questions: GeneratedQuestion[];
}

/** Top-level structured content persisted on `QuestionPaper.structuredContent`. */
export interface StructuredContent {
  title: string;
  /** Paper-wide instructions (shown at the top of the rendered PDF). */
  instructions: string;
  sections: GeneratedSection[];
}

/**
 * Echoed back in the detail view so the frontend can render
 * "Generated using <syllabus> + <sample paper names>" attribution.
 */
export interface PaperSourceSummary {
  syllabusName: string;
  syllabusVersion: string;
  samplePaperNames: string[];
}

/** Lightweight snapshot we pass to PDF templates so they don't import Prisma. */
export interface PaperPdfContext {
  paper: {
    id: string;
    title: string;
    examType: ExamType;
    totalMarks: number;
    durationMinutes: number | null;
    structuredContent: StructuredContent;
  };
  classroom: {
    name: string;
    className: string;
    sectionName: string | null;
    subjectName: string;
  };
  institution: {
    name: string;
  };
  source: PaperSourceSummary;
}
