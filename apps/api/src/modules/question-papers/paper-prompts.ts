/**
 * Paper generation system prompts — Sprint 5 PROMPT 20.
 *
 * Lives in `apps/api` (not `packages/ai/`) because the prompt is wired to
 * Vaasenk's question-paper-generator domain (exam type, marks, sample paper
 * patterns). `packages/ai/` stays generic — it exposes `ChatService.complete`
 * and `RagService.retrieve`; consumers build their own prompts.
 *
 * The model is instructed to emit ONLY a JSON object. We use a strict parser
 * (with one retry on parse failure) in the worker — the prompt's "output
 * schema" section is the single source of truth that lines up with
 * `paper-validation.ts`.
 */

import type { SyllabusChunk } from '@prisma/client';
import type { QuestionTypeConfigInput } from './question-papers.dto';

interface BuildPaperPromptArgs {
  subject: string;
  className: string;
  boardType?: string | null;
  examType: string;
  totalMarks: number;
  durationMinutes?: number | null;
  questionTypes: QuestionTypeConfigInput[];
  difficulty?: { easy: number; medium: number; hard: number } | null;
  includeAnswerKey: boolean;
  /** Syllabus chunks fetched by chapter/topic (or full fallback). */
  syllabusChunks: Array<
    Pick<SyllabusChunk, 'content' | 'chapter' | 'topic' | 'pageNumber'>
  >;
  /** Optional sample paper text content — truncated upstream. */
  samplePaperTexts: Array<{ name: string; textContent: string }>;
}

/**
 * Builds the system prompt for paper generation.
 *
 * Hard instructions:
 *   - JSON-only output (no preamble, no postamble).
 *   - Source-grounded ONLY in the supplied syllabus passages.
 *   - Marks total must equal `totalMarks`.
 *   - Difficulty mix should follow the requested split.
 *   - Sample papers are STYLE references only — never copy questions.
 */
export function buildPaperGenerationSystemPrompt(
  args: BuildPaperPromptArgs,
): string {
  const {
    subject,
    className,
    boardType,
    examType,
    totalMarks,
    durationMinutes,
    questionTypes,
    difficulty,
    includeAnswerKey,
    syllabusChunks,
    samplePaperTexts,
  } = args;

  const boardLine = boardType
    ? `Board / syllabus body: ${boardType}.`
    : 'Board / syllabus body: not specified.';

  const durationLine =
    typeof durationMinutes === 'number' && durationMinutes > 0
      ? `Total duration: ${durationMinutes} minutes.`
      : 'Total duration: not specified — design the paper to fit a typical session.';

  const typesPlan = questionTypes
    .map(
      (qt, idx) =>
        `${idx + 1}. ${qt.type} — ${qt.count} question(s) × ${qt.marksEach} mark(s) each ` +
        `(${qt.count * qt.marksEach} marks total)`,
    )
    .join('\n');

  const difficultyLine = difficulty
    ? `Difficulty mix to target (best-effort): easy ${difficulty.easy}% / medium ${difficulty.medium}% / hard ${difficulty.hard}%.`
    : 'Difficulty mix: balanced (no explicit target).';

  const answerKeyLine = includeAnswerKey
    ? 'INCLUDE answer keys: every question MUST carry an `answer` field with a concise, correct answer.'
    : 'Do NOT include answer keys — leave the `answer` field absent.';

  const schemaBlock = buildSchemaBlock(includeAnswerKey);

  const contextBlock = buildSyllabusContextBlock(syllabusChunks);
  const sampleBlock = buildSampleBlock(samplePaperTexts);

  return [
    `You are Vaasenk Paper Wright, an exam paper generator for Indian schools and coaching centers.`,
    ``,
    `Your job: produce a high-quality ${examType} question paper for ${subject} (${className}).`,
    boardLine,
    durationLine,
    `Total marks: ${totalMarks}.`,
    ``,
    `Paper composition plan:`,
    typesPlan,
    ``,
    difficultyLine,
    answerKeyLine,
    ``,
    `HARD RULES:`,
    `1. Output ONLY a single JSON object that matches the schema below. No prose before, no prose after, no fenced code blocks, no commentary.`,
    `2. The sum of every \`question.marks\` across every section MUST equal exactly ${totalMarks}.`,
    `3. Use ONLY the syllabus content supplied below. Never invent facts, definitions, formulas, or references that aren't in the passages.`,
    `4. For each question, cite the chapter and/or topic from the syllabus in \`source\` when possible. Never fabricate page numbers.`,
    `5. Sample papers (if provided) are STYLE references for pattern, distribution, and difficulty calibration. NEVER copy a question verbatim.`,
    `6. Questions must be unambiguous, free of typos, and grade-appropriate for ${className}.`,
    `7. For MCQ-style questions, emit exactly 4 plausible options (one correct) under \`options\`.`,
    `8. Vary phrasing across questions — avoid repeating the same stem more than once.`,
    ``,
    `OUTPUT SCHEMA (TypeScript-like):`,
    schemaBlock,
    ``,
    contextBlock,
    sampleBlock,
    ``,
    `Generate the paper now. Respond with the JSON object only.`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Prompt for the single-question regenerate flow. Given the existing
 * question + an optional teacher hint, ask the model for a replacement of
 * the SAME type / marks / shape. Output is a single JSON object matching
 * `GeneratedQuestion`.
 */
export function buildSingleQuestionRegeneratePrompt(args: {
  subject: string;
  className: string;
  examType: string;
  existingQuestion: {
    type: string;
    text: string;
    marks: number;
    options?: string[];
  };
  hint?: string;
  includeAnswerKey: boolean;
  syllabusChunks: Array<
    Pick<SyllabusChunk, 'content' | 'chapter' | 'topic' | 'pageNumber'>
  >;
}): string {
  const {
    subject,
    className,
    examType,
    existingQuestion,
    hint,
    includeAnswerKey,
    syllabusChunks,
  } = args;

  return [
    `You are Vaasenk Paper Wright. The teacher has asked for a replacement of one question in a ${examType} paper for ${subject} (${className}).`,
    ``,
    `Replace the question below with a NEW question of the SAME type and SAME marks. ` +
      `Keep the difficulty similar. Use ONLY the supplied syllabus context.`,
    ``,
    `EXISTING QUESTION (to be replaced):`,
    `type: ${existingQuestion.type}`,
    `marks: ${existingQuestion.marks}`,
    `text: ${existingQuestion.text}`,
    existingQuestion.options
      ? `options: ${JSON.stringify(existingQuestion.options)}`
      : '',
    hint && hint.trim().length > 0 ? `Teacher hint: ${hint.trim()}` : '',
    ``,
    `Output ONLY a single JSON object with this shape:`,
    `{`,
    `  "type": string (must equal "${existingQuestion.type}"),`,
    `  "text": string (the new question; non-empty),`,
    `  "marks": number (must equal ${existingQuestion.marks}),`,
    existingQuestion.options
      ? `  "options": string[] (4 plausible options for MCQ),`
      : '',
    includeAnswerKey
      ? `  "answer": string (concise correct answer),`
      : '',
    `  "source": { "chapter"?: string, "topic"?: string }`,
    `}`,
    ``,
    buildSyllabusContextBlock(syllabusChunks),
    ``,
    `Respond with the JSON object only — no prose, no fenced block.`,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildSchemaBlock(includeAnswerKey: boolean): string {
  return [
    `{`,
    `  "title": string,                       // e.g. "Class 10 Mathematics — Unit Test 1"`,
    `  "instructions": string,                // paper-wide instructions shown at the top`,
    `  "sections": [`,
    `    {`,
    `      "name": string,                    // e.g. "Section A — Multiple Choice (1 mark each)"`,
    `      "instructions"?: string,           // optional per-section instructions`,
    `      "questions": [`,
    `        {`,
    `          "type": string,                // one of the requested types (free string, max 60 chars)`,
    `          "text": string,                // the question itself`,
    `          "marks": number,               // positive integer`,
    `          "options"?: string[],          // REQUIRED for MCQ-style — exactly 4 options`,
    `          "difficulty"?: "easy" | "medium" | "hard",`,
    `          "source"?: { "chapter"?: string, "topic"?: string }${includeAnswerKey ? ',' : ''}`,
    includeAnswerKey
      ? `          "answer": string             // REQUIRED — concise correct answer`
      : '',
    `        }`,
    `      ]`,
    `    }`,
    `  ]`,
    `}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildSyllabusContextBlock(
  chunks: Array<Pick<SyllabusChunk, 'content' | 'chapter' | 'topic' | 'pageNumber'>>,
): string {
  if (chunks.length === 0) {
    return [
      `--- BEGIN SYLLABUS CONTEXT ---`,
      `(no syllabus passages retrieved — refuse to generate and emit a single section`,
      ` containing one question of text "Insufficient syllabus content to generate a paper.")`,
      `--- END SYLLABUS CONTEXT ---`,
    ].join('\n');
  }
  const lines: string[] = ['--- BEGIN SYLLABUS CONTEXT ---'];
  chunks.forEach((c, i) => {
    const header: string[] = [`[${i + 1}]`];
    if (c.chapter) header.push(`Chapter: "${c.chapter}"`);
    if (c.topic) header.push(`Topic: "${c.topic}"`);
    if (c.pageNumber !== null && c.pageNumber !== undefined) {
      header.push(`Page: ${c.pageNumber}`);
    }
    lines.push(header.join(' — '));
    lines.push(c.content);
    lines.push('');
  });
  lines.push('--- END SYLLABUS CONTEXT ---');
  return lines.join('\n');
}

function buildSampleBlock(
  samples: Array<{ name: string; textContent: string }>,
): string {
  if (samples.length === 0) return '';
  const lines: string[] = [
    '',
    `Sample paper patterns (for stylistic reference, NOT to copy from):`,
  ];
  samples.forEach((s, i) => {
    lines.push(`--- SAMPLE ${i + 1}: ${s.name} ---`);
    lines.push(s.textContent);
    lines.push(`--- END SAMPLE ${i + 1} ---`);
    lines.push('');
  });
  return lines.join('\n');
}
