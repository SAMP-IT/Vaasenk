import { Processor, WorkerHost } from '@nestjs/bullmq';
import { HttpException, Logger } from '@nestjs/common';
import {
  NotificationType,
  PaperJobStatus,
  Prisma,
  type SyllabusChunk,
} from '@prisma/client';
import {
  ChatService,
  computeChatCostUsd,
  countTokens,
  DEFAULT_CHAT_MODEL,
} from '@vaasenk/ai';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { buildPaperGenerationSystemPrompt } from './paper-prompts';
import {
  computePaperConfidence,
  extractJson,
  validatePaperStructure,
} from './paper-validation';
import { GenerateQuestionPaperInput } from './question-papers.dto';
import type { GenerationProgress, GenerationProgressStep } from './types';

/**
 * Question Papers worker — Sprint 5 PROMPT 20.
 *
 * Picks up `generate` jobs enqueued by the QuestionPapersService and runs
 * the actual LLM pipeline:
 *
 *   1. Resolve syllabus chunks for the requested portions (with fallback).
 *   2. Pull truncated sample-paper text content if provided.
 *   3. Build the system prompt and call ChatService.complete().
 *   4. Parse JSON (with one retry on parse failure).
 *   5. Validate the structure against the inputConfig.
 *   6. Persist QuestionPaper + AiUsageLog atomically.
 *   7. Mark the job COMPLETED (or FAILED with a user-friendly message).
 *
 * Multi-tenant scoping (CLAUDE.md §3) is enforced from `job.data.institutionId`
 * on every Prisma query in here — the controller's request context doesn't
 * exist by the time the worker runs (vaasenk-api skill §9).
 */

interface QuestionPaperJobData {
  jobId: string;
  institutionId: string;
  classroomId: string;
  teacherId: string;
}

/** Soft caps for the prompt — Claude Sonnet has ~200K input tokens. */
const MAX_INPUT_TOKENS = 180_000;
const MAX_OUTPUT_TOKENS = 4096;
const CHUNK_TAKE_DEFAULT = 60;
const CHUNK_TAKE_FALLBACK = 40;
const SAMPLE_TEXT_TRUNCATE_CHARS = 5_000;

@Processor('question-papers')
export class QuestionPapersWorker extends WorkerHost {
  private readonly logger = new Logger(QuestionPapersWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
    private readonly notifications: NotificationsService,
    private readonly subscriptions: SubscriptionsService,
  ) {
    super();
  }

  async process(job: Job<QuestionPaperJobData>): Promise<void> {
    if (job.name !== 'generate') {
      this.logger.warn(
        `Unhandled job name "${job.name}" on question-papers queue; skipping.`,
      );
      return;
    }

    const { jobId, institutionId, teacherId, classroomId } = job.data;
    this.logger.log(
      `Question paper generation started for job ${jobId} ` +
        `(institution ${institutionId}, classroom ${classroomId})`,
    );

    try {
      const row = await this.prisma.questionPaperJob.findFirst({
        where: { id: jobId, institutionId },
      });
      if (!row) {
        this.logger.warn(
          `Job ${jobId} not found (institution ${institutionId}) — skipping.`,
        );
        return;
      }
      const inputConfig = row.inputConfig as unknown as GenerateQuestionPaperInput;
      if (!inputConfig || typeof inputConfig !== 'object') {
        await this.markFailed(jobId, institutionId, 'Job has no input config.');
        return;
      }

      const syllabusId = row.syllabusId;
      if (!syllabusId) {
        await this.markFailed(
          jobId,
          institutionId,
          'Job is missing a syllabus reference.',
        );
        return;
      }
      const syllabus = await this.prisma.syllabusDocument.findFirst({
        where: { id: syllabusId, institutionId },
        select: {
          id: true,
          name: true,
          version: true,
          boardType: true,
          subjectId: true,
          classId: true,
        },
      });
      if (!syllabus) {
        await this.markFailed(
          jobId,
          institutionId,
          'Syllabus referenced by the job was deleted.',
        );
        return;
      }

      // -------- Sprint 8.1: pre-flight credit guard -------------------------
      // We refuse to consume a worker slot for a job whose institution is
      // already over the AI credit cap. The 402 surfaces on the job row's
      // errorMessage so the polling client sees a clear "upgrade required"
      // signal without needing a separate paymentRequired flag.
      try {
        await this.subscriptions.ensureAiCreditsAvailable(institutionId);
      } catch (err) {
        const message =
          err instanceof HttpException
            ? this.extractErrorMessage(err) ?? 'Monthly AI credit limit reached.'
            : 'Monthly AI credit limit reached.';
        await this.markFailed(jobId, institutionId, message);
        return;
      }

      // -------- Step 1: fetch syllabus chunks for the requested portions ----
      await this.updateProgress(job, {
        step: 'Preparing syllabus context',
        percentage: 10,
      });
      let chunks = await this.fetchChunksByPortions(
        institutionId,
        syllabusId,
        inputConfig.portions,
        CHUNK_TAKE_DEFAULT,
      );
      let usedFallback = false;
      if (chunks.length === 0) {
        usedFallback = true;
        chunks = await this.prisma.syllabusChunk.findMany({
          where: { syllabusId, institutionId },
          orderBy: { chunkIndex: 'asc' },
          take: CHUNK_TAKE_FALLBACK,
        });
      }
      if (chunks.length === 0) {
        await this.markFailed(
          jobId,
          institutionId,
          'No syllabus content available. Re-process the syllabus and try again.',
        );
        return;
      }

      // -------- Step 2: load sample paper texts if any ----------------------
      await this.updateProgress(job, {
        step: 'Analyzing sample patterns',
        percentage: 30,
      });
      const samplePaperTexts = await this.loadSamplePaperTexts(
        institutionId,
        inputConfig.samplePaperIds ?? [],
      );

      // -------- Step 3: build prompt ----------------------------------------
      await this.updateProgress(job, {
        step: 'Drafting questions',
        percentage: 50,
      });

      const { subjectName, className } = await this.resolveSubjectAndClass(
        syllabus.subjectId,
        syllabus.classId,
      );

      let promptChunks = chunks.map((c) => ({
        content: c.content,
        chapter: c.chapter,
        topic: c.topic,
        pageNumber: c.pageNumber,
      }));
      let promptSamples = samplePaperTexts;

      let systemPrompt = buildPaperGenerationSystemPrompt({
        subject: subjectName,
        className,
        boardType: syllabus.boardType,
        examType: String(inputConfig.examType),
        totalMarks: inputConfig.totalMarks,
        durationMinutes: inputConfig.durationMinutes ?? null,
        questionTypes: inputConfig.questionTypes,
        difficulty: inputConfig.difficulty ?? null,
        includeAnswerKey: inputConfig.includeAnswerKey,
        syllabusChunks: promptChunks,
        samplePaperTexts: promptSamples,
      });

      // Apply token budget. Trim samples first, then chunks.
      let estimated = countTokens(systemPrompt, DEFAULT_CHAT_MODEL);
      if (estimated > MAX_INPUT_TOKENS) {
        this.logger.warn(
          `Prompt over budget (${estimated} > ${MAX_INPUT_TOKENS}). Trimming samples then chunks.`,
        );
        // Trim samples first.
        promptSamples = [];
        systemPrompt = buildPaperGenerationSystemPrompt({
          subject: subjectName,
          className,
          boardType: syllabus.boardType,
          examType: String(inputConfig.examType),
          totalMarks: inputConfig.totalMarks,
          durationMinutes: inputConfig.durationMinutes ?? null,
          questionTypes: inputConfig.questionTypes,
          difficulty: inputConfig.difficulty ?? null,
          includeAnswerKey: inputConfig.includeAnswerKey,
          syllabusChunks: promptChunks,
          samplePaperTexts: promptSamples,
        });
        estimated = countTokens(systemPrompt, DEFAULT_CHAT_MODEL);

        // Still over budget — trim chunks.
        while (
          estimated > MAX_INPUT_TOKENS &&
          promptChunks.length > 10
        ) {
          promptChunks = promptChunks.slice(0, Math.floor(promptChunks.length * 0.75));
          systemPrompt = buildPaperGenerationSystemPrompt({
            subject: subjectName,
            className,
            boardType: syllabus.boardType,
            examType: String(inputConfig.examType),
            totalMarks: inputConfig.totalMarks,
            durationMinutes: inputConfig.durationMinutes ?? null,
            questionTypes: inputConfig.questionTypes,
            difficulty: inputConfig.difficulty ?? null,
            includeAnswerKey: inputConfig.includeAnswerKey,
            syllabusChunks: promptChunks,
            samplePaperTexts: promptSamples,
          });
          estimated = countTokens(systemPrompt, DEFAULT_CHAT_MODEL);
        }
        if (estimated > MAX_INPUT_TOKENS) {
          await this.markFailed(
            jobId,
            institutionId,
            'Syllabus too large for this generation request. Reduce portions or split into multiple papers.',
          );
          return;
        }
      }

      // -------- Step 4: call LLM with one retry on parse failure -----------
      let parsed: unknown;
      let llmResult;
      try {
        llmResult = await this.chat.complete(institutionId, {
          systemPrompt,
          userMessage: 'Generate the paper now.',
          maxTokens: MAX_OUTPUT_TOKENS,
        });
        try {
          parsed = extractJson(llmResult.content);
        } catch (parseErr) {
          this.logger.warn(
            `Initial JSON parse failed for job ${jobId} — retrying once: ` +
              (parseErr instanceof Error ? parseErr.message : String(parseErr)),
          );
          // One retry with a stricter prompt addendum.
          llmResult = await this.chat.complete(institutionId, {
            systemPrompt:
              systemPrompt +
              '\n\nReminder: respond with ONLY the JSON object, no prose, no fenced code blocks.',
            userMessage: 'Generate the paper now. JSON only.',
            maxTokens: MAX_OUTPUT_TOKENS,
          });
          parsed = extractJson(llmResult.content);
        }
      } catch (err) {
        this.logger.error(
          `LLM call/parse failed for job ${jobId}: ` +
            (err instanceof Error ? err.message : String(err)),
          err instanceof Error ? err.stack : undefined,
        );
        await this.markFailed(
          jobId,
          institutionId,
          'AI provider error during paper generation. Please retry.',
        );
        return;
      }

      // -------- Step 5: validate -------------------------------------------
      await this.updateProgress(job, {
        step: 'Validating structure',
        percentage: 75,
      });
      const validation = validatePaperStructure(parsed, inputConfig);
      if (!validation.ok) {
        const detail = validation.errors.slice(0, 5).join('; ');
        this.logger.warn(
          `Validation failed for job ${jobId}: ${validation.errors.join(' | ')}`,
        );
        await this.markFailed(
          jobId,
          institutionId,
          `Generated paper failed validation: ${detail}. Try a smaller portions list or different question mix.`,
        );
        return;
      }

      // -------- Step 6: persist + log + complete ---------------------------
      await this.updateProgress(job, {
        step: 'Saving paper',
        percentage: 90,
      });

      const confidence = computePaperConfidence(validation.content, inputConfig);
      const title = (validation.content.title ?? '').trim() || this.deriveTitle(
        subjectName,
        className,
        inputConfig.examType,
      );

      const fallbackNote = usedFallback
        ? 'Portions list did not match any chunk metadata — used full-syllabus fallback.'
        : null;

      await this.prisma.$transaction(async (tx) => {
        const paper = await tx.questionPaper.create({
          data: {
            institutionId,
            classroomId,
            teacherId,
            jobId,
            title,
            examType: inputConfig.examType,
            totalMarks: inputConfig.totalMarks,
            ...(typeof inputConfig.durationMinutes === 'number' && {
              durationMinutes: inputConfig.durationMinutes,
            }),
            structuredContent:
              validation.content as unknown as Prisma.InputJsonValue,
            aiConfidence: new Prisma.Decimal(confidence),
          },
          select: { id: true },
        });

        // AiUsageLog — paper_generation.
        const cost = computeChatCostUsd(
          llmResult.model,
          llmResult.promptTokens,
          llmResult.completionTokens,
        );
        await tx.aiUsageLog.create({
          data: {
            institutionId,
            userId: teacherId,
            classroomId,
            operation: 'paper_generation',
            provider: 'anthropic',
            modelName: llmResult.model,
            promptTokens: llmResult.promptTokens,
            completionTokens: llmResult.completionTokens,
            totalTokens: llmResult.promptTokens + llmResult.completionTokens,
            costUsd: cost,
            metadata: {
              jobId,
              paperId: paper.id,
              syllabusId,
              examType: inputConfig.examType,
              ...(fallbackNote && { note: fallbackNote }),
            },
          },
        });

        // Flip the job to COMPLETED.
        await tx.questionPaperJob.update({
          where: { id: jobId },
          data: {
            status: PaperJobStatus.COMPLETED,
            completedAt: new Date(),
            errorMessage: null,
          },
        });
      });

      await this.updateProgress(job, {
        step: 'Saving paper',
        percentage: 100,
      });

      // Sprint 8.1 — atomic credit increment through the shared
      // SubscriptionsService. Runs OUTSIDE the persistence transaction so a
      // tracking failure can never block paper creation that has already
      // succeeded (best-effort, log-on-fail).
      const totalTokens = llmResult.promptTokens + llmResult.completionTokens;
      if (totalTokens > 0) {
        try {
          await this.subscriptions.incrementAiCredits(institutionId, totalTokens);
        } catch (incErr) {
          this.logger.warn(
            `incrementAiCredits failed for job ${jobId}: ` +
              (incErr instanceof Error ? incErr.message : String(incErr)),
          );
        }
      }

      this.logger.log(
        `Question paper job ${jobId} completed: ` +
          `confidence=${confidence}, model=${llmResult.model}, ` +
          `tokens=${llmResult.promptTokens}+${llmResult.completionTokens}.`,
      );

      // Sprint 6 — credits just bumped; emit AI_CREDITS_LOW to all
      // admins if usage crossed 80% (idempotent within a calendar month).
      await this.notifications.maybeNotifyCreditsLow(institutionId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Question paper job ${jobId} failed: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      await this.markFailed(jobId, institutionId, this.userFacingError(message));
    }
  }

  /* ------------------------------------------------------------------------ */

  private async fetchChunksByPortions(
    institutionId: string,
    syllabusId: string,
    portions: string[],
    take: number,
  ): Promise<SyllabusChunk[]> {
    if (!portions || portions.length === 0) return [];
    return this.prisma.syllabusChunk.findMany({
      where: {
        syllabusId,
        institutionId,
        OR: [
          { chapter: { in: portions, mode: 'insensitive' } },
          { topic: { in: portions, mode: 'insensitive' } },
        ],
      },
      orderBy: { chunkIndex: 'asc' },
      take,
    });
  }

  private async loadSamplePaperTexts(
    institutionId: string,
    samplePaperIds: string[],
  ): Promise<Array<{ name: string; textContent: string }>> {
    if (!samplePaperIds || samplePaperIds.length === 0) return [];
    const rows = await this.prisma.sampleQuestionPaper.findMany({
      where: { id: { in: samplePaperIds }, institutionId },
      select: { name: true, extractionMeta: true },
    });
    const out: Array<{ name: string; textContent: string }> = [];
    for (const r of rows) {
      const meta = r.extractionMeta as unknown;
      let text = '';
      if (
        meta &&
        typeof meta === 'object' &&
        !Array.isArray(meta) &&
        'textContent' in (meta as Record<string, unknown>) &&
        typeof (meta as Record<string, unknown>)['textContent'] === 'string'
      ) {
        text = (meta as Record<string, string>)['textContent'] as string;
      }
      if (text.length === 0) continue;
      const truncated =
        text.length > SAMPLE_TEXT_TRUNCATE_CHARS
          ? text.slice(0, SAMPLE_TEXT_TRUNCATE_CHARS) + '…'
          : text;
      out.push({ name: r.name, textContent: truncated });
    }
    return out;
  }

  private async resolveSubjectAndClass(
    subjectId: string | null,
    classId: string | null,
  ): Promise<{ subjectName: string; className: string }> {
    const [subject, klass] = await Promise.all([
      subjectId
        ? this.prisma.subject.findUnique({
            where: { id: subjectId },
            select: { name: true },
          })
        : Promise.resolve(null),
      classId
        ? this.prisma.class.findUnique({
            where: { id: classId },
            select: { name: true },
          })
        : Promise.resolve(null),
    ]);
    return {
      subjectName: subject?.name ?? 'this subject',
      className: klass?.name ?? 'this class',
    };
  }

  private deriveTitle(
    subjectName: string,
    className: string,
    examType: import('@prisma/client').ExamType,
  ): string {
    const human = String(examType)
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return `${className} ${subjectName} — ${human}`;
  }

  private async updateProgress(
    job: Job<QuestionPaperJobData>,
    progress: GenerationProgress,
  ): Promise<void> {
    try {
      await job.updateProgress(progress);
    } catch (err) {
      this.logger.debug(
        `Failed to update progress to ${progress.step}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  private async markFailed(
    jobId: string,
    institutionId: string,
    message: string,
  ): Promise<void> {
    await this.prisma.questionPaperJob.updateMany({
      where: { id: jobId, institutionId },
      data: {
        status: PaperJobStatus.FAILED,
        completedAt: new Date(),
        errorMessage: message,
      },
    });
    this.logger.warn(`Question paper job ${jobId} marked FAILED: ${message}`);

    // Sprint 6 — emit PAPER_FAILED to the requesting teacher so the bell
    // updates without polling the job status. Look up teacherId on the
    // failed row (best-effort — if the lookup fails we just skip the WS
    // emit; the failed row is already persisted).
    try {
      const row = await this.prisma.questionPaperJob.findFirst({
        where: { id: jobId, institutionId },
        select: { teacherId: true, classroomId: true },
      });
      if (!row) return;
      await this.notifications.notify({
        institutionId,
        userId: row.teacherId,
        type: NotificationType.PAPER_FAILED,
        title: 'Question paper generation failed',
        body: message,
        metadata: {
          paperJobId: jobId,
          classroomId: row.classroomId,
        },
      });
    } catch (notifyErr) {
      this.logger.warn(
        `Failed to emit PAPER_FAILED for job ${jobId}: ` +
          (notifyErr instanceof Error ? notifyErr.message : String(notifyErr)),
      );
    }
  }

  /**
   * Pulls a human-readable message out of an HttpException whose body
   * follows the Sprint 8.1 `{ code, message, details }` envelope. Falls
   * back to the exception's own message field otherwise. Used by the
   * pre-flight credit guard so the user sees the actual "upgrade plan"
   * copy instead of a generic 402 string.
   */
  private extractErrorMessage(err: HttpException): string | null {
    const resp = err.getResponse();
    if (typeof resp === 'string') return resp;
    if (resp && typeof resp === 'object') {
      const r = resp as Record<string, unknown>;
      if (typeof r['message'] === 'string') return r['message'] as string;
    }
    return err.message || null;
  }

  /**
   * Translates raw error messages into user-friendly ones for the
   * QuestionPaperJob.errorMessage column. Keeps provider-specific stack
   * traces off the API surface.
   */
  private userFacingError(message: string): string {
    const lower = message.toLowerCase();
    if (lower.includes('rate limit') || lower.includes('429')) {
      return 'AI provider is rate-limited. Wait a minute and try again.';
    }
    if (lower.includes('quota') || lower.includes('insufficient')) {
      return 'AI provider quota exceeded. Contact support to increase the plan.';
    }
    if (lower.includes('api key') || lower.includes('unauthorized')) {
      return 'AI provider is not configured correctly. Contact support.';
    }
    if (lower.includes('timeout') || lower.includes('aborted')) {
      return 'AI provider timed out. Please retry — paper generation can take up to a minute.';
    }
    return 'Paper generation failed unexpectedly. Please retry.';
  }
}

// Make TS happy when the `GenerationProgressStep` type isn't directly used.
// (Imported as a type-only annotation on `GenerationProgress` keeps the file
// surface accurate without forcing every call site to know the literal type.)
export type { GenerationProgressStep };
