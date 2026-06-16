/**
 * Paper structure validation — Sprint 5 PROMPT 20.
 *
 * Pure functions. No NestJS / Prisma imports — easy to test in isolation.
 *
 * Strategy:
 *   1. Parse the raw LLM output as JSON (tolerating preamble / trailing prose
 *      via a fenced-block extractor as a fallback).
 *   2. Walk the parsed value against the StructuredContent shape, collecting
 *      every problem in a single pass so the worker can surface a useful
 *      `errorMessage` rather than failing on the first bad field.
 *   3. Cross-check semantic invariants (marks total, question-type counts,
 *      answer-key completeness when required).
 *
 * The validator returns a discriminated union so the worker can `if (ok)` /
 * `if (!ok)` without `any` casts downstream.
 */

import type { QuestionTypeConfigInput, GenerateQuestionPaperInput } from './question-papers.dto';
import type {
  GeneratedQuestion,
  GeneratedSection,
  StructuredContent,
} from './types';

export type ValidationResult =
  | { ok: true; content: StructuredContent }
  | { ok: false; errors: string[] };

/**
 * Loose tolerance for question-type counts. LLMs are fuzzy — we accept ±1
 * question per requested type so a generation that ships 9 MCQs instead of
 * 10 isn't rejected, but a generation that ships 5 instead of 10 is.
 */
const QUESTION_TYPE_COUNT_TOLERANCE = 1;

/**
 * Tries to extract a JSON object from raw LLM text. The model is asked to
 * emit ONLY JSON, but in practice it sometimes wraps the payload in a fenced
 * code block or a leading "Here is the paper:" sentence. We strip those.
 */
export function extractJson(raw: string): unknown {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Empty response from model.');
  }
  const trimmed = raw.trim();

  // Fast path — already pure JSON.
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return JSON.parse(trimmed);
  }

  // Fenced block.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    return JSON.parse(fenceMatch[1].trim());
  }

  // First-brace to last-brace heuristic.
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) {
    const candidate = trimmed.slice(first, last + 1);
    return JSON.parse(candidate);
  }

  throw new Error('Response did not contain a JSON object.');
}

/**
 * Validates the parsed LLM output against the StructuredContent contract +
 * the original generation request. Returns either a typed `content` or a
 * list of human-readable errors.
 */
export function validatePaperStructure(
  parsed: unknown,
  inputConfig: GenerateQuestionPaperInput,
): ValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(parsed)) {
    return { ok: false, errors: ['Top-level value is not a JSON object.'] };
  }

  const title = parsed['title'];
  const instructions = parsed['instructions'];
  const sectionsRaw = parsed['sections'];

  if (typeof title !== 'string' || title.trim().length === 0) {
    errors.push('Field "title" must be a non-empty string.');
  }
  if (typeof instructions !== 'string') {
    errors.push('Field "instructions" must be a string.');
  }
  if (!Array.isArray(sectionsRaw) || sectionsRaw.length === 0) {
    errors.push('Field "sections" must be a non-empty array.');
    return { ok: false, errors };
  }

  const validSections: GeneratedSection[] = [];
  sectionsRaw.forEach((sectionRaw: unknown, sIdx: number) => {
    const path = `sections[${sIdx}]`;
    if (!isPlainObject(sectionRaw)) {
      errors.push(`${path} is not an object.`);
      return;
    }
    const sectionName = sectionRaw['name'];
    const sectionQuestionsRaw = sectionRaw['questions'];
    if (typeof sectionName !== 'string' || sectionName.trim().length === 0) {
      errors.push(`${path}.name must be a non-empty string.`);
    }
    if (!Array.isArray(sectionQuestionsRaw) || sectionQuestionsRaw.length === 0) {
      errors.push(`${path}.questions must be a non-empty array.`);
      return;
    }

    const validQuestions: GeneratedQuestion[] = [];
    sectionQuestionsRaw.forEach((questionRaw: unknown, qIdx: number) => {
      const qPath = `${path}.questions[${qIdx}]`;
      if (!isPlainObject(questionRaw)) {
        errors.push(`${qPath} is not an object.`);
        return;
      }
      const qType = questionRaw['type'];
      const qText = questionRaw['text'];
      const qMarks = questionRaw['marks'];

      if (typeof qType !== 'string' || qType.trim().length === 0) {
        errors.push(`${qPath}.type must be a non-empty string.`);
      }
      if (typeof qText !== 'string' || qText.trim().length === 0) {
        errors.push(`${qPath}.text must be a non-empty string.`);
      }
      if (!Number.isInteger(qMarks) || (qMarks as number) <= 0) {
        errors.push(`${qPath}.marks must be a positive integer.`);
      }

      // MCQ options — required when question type contains "MCQ" (case-insensitive)
      // or when 'options' is present at all.
      const optionsRaw = questionRaw['options'];
      let options: string[] | undefined;
      if (optionsRaw !== undefined) {
        if (!Array.isArray(optionsRaw) || optionsRaw.length < 2) {
          errors.push(`${qPath}.options must be an array of at least 2 strings.`);
        } else if (optionsRaw.some((o: unknown) => typeof o !== 'string' || (o as string).trim().length === 0)) {
          errors.push(`${qPath}.options must contain only non-empty strings.`);
        } else {
          options = optionsRaw as string[];
        }
      } else if (typeof qType === 'string' && /\bmcq\b|multiple\s*choice/i.test(qType)) {
        errors.push(`${qPath}.options is required for MCQ-style questions.`);
      }

      // Answer key — required when the request asked for it.
      const answerRaw = questionRaw['answer'];
      let answer: string | undefined;
      if (inputConfig.includeAnswerKey) {
        if (typeof answerRaw !== 'string' || answerRaw.trim().length === 0) {
          errors.push(`${qPath}.answer is required (includeAnswerKey=true).`);
        } else {
          answer = answerRaw;
        }
      } else if (typeof answerRaw === 'string') {
        // Accept even when not required — useful for teacher review.
        answer = answerRaw;
      }

      // Optional difficulty.
      const difficultyRaw = questionRaw['difficulty'];
      let difficulty: 'easy' | 'medium' | 'hard' | undefined;
      if (
        difficultyRaw === 'easy' ||
        difficultyRaw === 'medium' ||
        difficultyRaw === 'hard'
      ) {
        difficulty = difficultyRaw;
      }

      // Optional source.
      const sourceRaw = questionRaw['source'];
      let source: { chapter?: string; topic?: string } | undefined;
      if (isPlainObject(sourceRaw)) {
        const chapter = sourceRaw['chapter'];
        const topic = sourceRaw['topic'];
        source = {};
        if (typeof chapter === 'string' && chapter.trim().length > 0) {
          source.chapter = chapter;
        }
        if (typeof topic === 'string' && topic.trim().length > 0) {
          source.topic = topic;
        }
        if (!source.chapter && !source.topic) source = undefined;
      }

      // If THIS question had no field errors so far, record it. (We can't
      // perfectly tell — but if mandatory fields are missing we already
      // pushed errors, and we still record a best-effort object so later
      // semantic checks have something to count against.)
      if (
        typeof qType === 'string' &&
        typeof qText === 'string' &&
        Number.isInteger(qMarks)
      ) {
        const q: GeneratedQuestion = {
          type: qType.trim(),
          text: qText.trim(),
          marks: qMarks as number,
        };
        if (options) q.options = options;
        if (answer !== undefined) q.answer = answer;
        if (difficulty) q.difficulty = difficulty;
        if (source) q.source = source;
        validQuestions.push(q);
      }
    });

    if (typeof sectionName === 'string' && validQuestions.length > 0) {
      const section: GeneratedSection = {
        name: sectionName.trim(),
        questions: validQuestions,
      };
      const sectionInstructions = sectionRaw['instructions'];
      if (
        typeof sectionInstructions === 'string' &&
        sectionInstructions.trim().length > 0
      ) {
        section.instructions = sectionInstructions.trim();
      }
      validSections.push(section);
    }
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  if (validSections.length === 0) {
    return { ok: false, errors: ['No valid sections in output.'] };
  }

  // Semantic checks
  const allQuestions = validSections.flatMap((s) => s.questions);
  const marksTotal = allQuestions.reduce((sum, q) => sum + q.marks, 0);
  if (marksTotal !== inputConfig.totalMarks) {
    errors.push(
      `Marks total mismatch: generated paper totals ${marksTotal} marks, ` +
        `requested ${inputConfig.totalMarks}.`,
    );
  }

  // Question-type count check — allow ±tolerance per requested type.
  const requestedByType = new Map<string, QuestionTypeConfigInput>();
  for (const qt of inputConfig.questionTypes) {
    requestedByType.set(normalizeType(qt.type), qt);
  }
  const generatedCountByType = new Map<string, number>();
  for (const q of allQuestions) {
    const key = normalizeType(q.type);
    generatedCountByType.set(key, (generatedCountByType.get(key) ?? 0) + 1);
  }
  for (const [typeKey, qt] of requestedByType) {
    const got = generatedCountByType.get(typeKey) ?? 0;
    const expected = qt.count;
    const drift = Math.abs(got - expected);
    if (drift > QUESTION_TYPE_COUNT_TOLERANCE) {
      errors.push(
        `Question-type count drift for "${qt.type}": expected ${expected}, got ${got}.`,
      );
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    content: {
      title: (title as string).trim(),
      instructions: (instructions as string).trim(),
      sections: validSections,
    },
  };
}

/**
 * Computes a rough confidence score in [0, 1] from a successfully-validated
 * paper. Higher == closer to the requested shape.
 *
 * Scoring (linear blend):
 *   - 0.6 base for passing validation.
 *   - +0.2 if the generated marks total EXACTLY matches the requested total.
 *   - +0.1 if every requested question-type count matches exactly.
 *   - +0.1 if every question has a non-empty `source.chapter` or `.topic`.
 */
export function computePaperConfidence(
  content: StructuredContent,
  inputConfig: GenerateQuestionPaperInput,
): number {
  let score = 0.6;
  const allQ = content.sections.flatMap((s) => s.questions);
  const total = allQ.reduce((sum, q) => sum + q.marks, 0);
  if (total === inputConfig.totalMarks) score += 0.2;

  const generatedCountByType = new Map<string, number>();
  for (const q of allQ) {
    const key = normalizeType(q.type);
    generatedCountByType.set(key, (generatedCountByType.get(key) ?? 0) + 1);
  }
  const exactTypeMatch = inputConfig.questionTypes.every(
    (qt) => generatedCountByType.get(normalizeType(qt.type)) === qt.count,
  );
  if (exactTypeMatch) score += 0.1;

  const groundedShare =
    allQ.filter((q) => q.source?.chapter || q.source?.topic).length /
    Math.max(1, allQ.length);
  if (groundedShare >= 0.9) score += 0.1;

  // Clamp to [0, 1].
  return Math.max(0, Math.min(1, Number(score.toFixed(4))));
}

function normalizeType(t: string): string {
  return t.toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '').trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
