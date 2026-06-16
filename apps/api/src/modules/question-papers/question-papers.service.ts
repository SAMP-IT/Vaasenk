import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import {
  NoteStatus,
  NotificationType,
  PaperJobStatus,
  Prisma,
  ProcessingStatus,
  Status,
  UserRole,
  type Classroom,
  type QuestionPaper,
  type QuestionPaperJob,
  type User,
} from '@prisma/client';
import {
  ChatService,
  RagService,
  computeChatCostUsd,
  countTokens,
  DEFAULT_CHAT_MODEL,
} from '@vaasenk/ai';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { PapersStorageService } from './papers-storage.service';
import { PaperPdfService } from './paper-pdf.service';
import { buildSingleQuestionRegeneratePrompt } from './paper-prompts';
import { extractJson, validatePaperStructure } from './paper-validation';
import {
  EditQuestionPaperDto,
  GenerateQuestionPaperDto,
  GenerateQuestionPaperInput,
  RegenerateQuestionDto,
} from './question-papers.dto';
import type {
  GeneratedQuestion,
  PaperPdfContext,
  PaperSourceSummary,
  StructuredContent,
} from './types';

/**
 * Question Papers service — Sprint 5 PROMPT 20.
 *
 * Owns the orchestration around AI paper generation:
 *   1. Validate inputs (marks distribution, difficulty sum, sample papers).
 *   2. Authorize the actor (assigned teacher / admin / super-admin).
 *   3. Enforce per-institution AI credit limits.
 *   4. Persist a `QuestionPaperJob` row and enqueue a BullMQ job.
 *   5. Expose status polling, edit, regenerate-question, export, publish.
 *
 * The heavy LLM work happens in `QuestionPapersWorker` so the controller
 * stays under the typical 2s budget.
 *
 * Multi-tenant scoping (CLAUDE.md §3) is enforced on every read/write by
 * filtering on `actor.institutionId`.
 */
@Injectable()
export class QuestionPapersService {
  private readonly logger = new Logger(QuestionPapersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: PapersStorageService,
    private readonly paperPdf: PaperPdfService,
    private readonly chat: ChatService,
    private readonly rag: RagService,
    private readonly notifications: NotificationsService,
    private readonly subscriptions: SubscriptionsService,
    @InjectQueue('question-papers') private readonly queue: Queue,
  ) {}

  /* ------------------------------------------------------------------------ */
  /* POST /classrooms/:id/question-papers/generate                            */
  /* ------------------------------------------------------------------------ */

  async createJob(
    actor: User,
    classroomId: string,
    dto: GenerateQuestionPaperDto,
  ): Promise<{ job: QuestionPaperJobView }> {
    // 1) Authorize + load classroom.
    const classroom = await this.assertClassroomWritable(actor, classroomId);

    // 2) Resolve syllabusId — explicit dto or classroom-mapped.
    const syllabusId = dto.syllabusId ?? classroom.syllabusId;
    if (!syllabusId) {
      throw new PreconditionFailedException(
        'Classroom has no mapped syllabus. Ask an admin to map a syllabus first.',
      );
    }
    const syllabus = await this.prisma.syllabusDocument.findFirst({
      where: { id: syllabusId, institutionId: actor.institutionId },
      select: { id: true, status: true, name: true, version: true },
    });
    if (!syllabus) {
      throw new BadRequestException('Syllabus not found in this institution');
    }
    if (syllabus.status !== ProcessingStatus.AI_READY) {
      throw new PreconditionFailedException(
        'Syllabus must be AI-ready before generating papers.',
      );
    }

    // 3) Marks distribution must add up.
    const computedTotal = dto.questionTypes.reduce(
      (sum, qt) => sum + qt.count * qt.marksEach,
      0,
    );
    if (computedTotal !== dto.totalMarks) {
      throw new BadRequestException(
        `Marks distribution doesn't add up to total marks ` +
          `(distribution=${computedTotal}, requested=${dto.totalMarks})`,
      );
    }

    // 4) Difficulty defense-in-depth (the DTO custom validator already checked).
    if (dto.difficulty) {
      const d = dto.difficulty;
      if (d.easy + d.medium + d.hard !== 100) {
        throw new BadRequestException(
          'Difficulty split must sum to 100 (easy + medium + hard)',
        );
      }
    }

    // 5) Sample papers — must belong to the actor's institution AND be AI_READY.
    const samplePaperIds = dto.samplePaperIds ?? [];
    if (samplePaperIds.length > 0) {
      const samples = await this.prisma.sampleQuestionPaper.findMany({
        where: {
          id: { in: samplePaperIds },
          institutionId: actor.institutionId,
        },
        select: { id: true, status: true },
      });
      if (samples.length !== samplePaperIds.length) {
        throw new BadRequestException(
          'One or more sample papers were not found in this institution',
        );
      }
      const notReady = samples.filter((s) => s.status !== ProcessingStatus.AI_READY);
      if (notReady.length > 0) {
        throw new BadRequestException(
          `One or more sample papers are not AI-ready (${notReady.length} pending)`,
        );
      }
    }

    // 6) AI credit check — Sprint 8.1 formalized guard.
    try {
      await this.subscriptions.ensureAiCreditsAvailable(actor.institutionId);
    } catch (err) {
      await this.writeAuditLog(actor, 'paper.credit_exceeded', null, {
        classroomId,
        reason: err instanceof Error ? err.message : 'limit_reached',
      });
      throw err;
    }

    // 7) Persist the job + enqueue.
    const inputConfig: GenerateQuestionPaperInput = {
      portions: dto.portions,
      examType: dto.examType,
      totalMarks: dto.totalMarks,
      questionTypes: dto.questionTypes.map((qt) => ({
        type: qt.type,
        count: qt.count,
        marksEach: qt.marksEach,
      })),
      includeAnswerKey: dto.includeAnswerKey,
      ...(dto.syllabusId !== undefined && { syllabusId: dto.syllabusId }),
      ...(dto.durationMinutes !== undefined && {
        durationMinutes: dto.durationMinutes,
      }),
      ...(dto.difficulty !== undefined && {
        difficulty: {
          easy: dto.difficulty.easy,
          medium: dto.difficulty.medium,
          hard: dto.difficulty.hard,
        },
      }),
      ...(samplePaperIds.length > 0 && { samplePaperIds }),
    };

    const job = await this.prisma.questionPaperJob.create({
      data: {
        institutionId: actor.institutionId,
        classroomId: classroom.id,
        teacherId: actor.id,
        syllabusId,
        inputConfig: inputConfig as unknown as Prisma.InputJsonValue,
        status: PaperJobStatus.PENDING,
      },
    });

    try {
      await this.queue.add(
        'generate',
        {
          jobId: job.id,
          institutionId: actor.institutionId,
          classroomId: classroom.id,
          teacherId: actor.id,
        },
        {
          attempts: 2,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 100,
          removeOnFail: 500,
          jobId: `qp:${job.id}`,
        },
      );
    } catch (err) {
      // Roll back the row if the queue is unavailable so we don't leave
      // PENDING jobs that will never run.
      await this.prisma.questionPaperJob.update({
        where: { id: job.id },
        data: {
          status: PaperJobStatus.FAILED,
          errorMessage:
            'Could not enqueue background job (queue unavailable). Please retry.',
        },
      });
      this.logger.error(
        `Failed to enqueue generate job for ${job.id}: ` +
          (err instanceof Error ? err.message : String(err)),
        err instanceof Error ? err.stack : undefined,
      );
      throw new HttpException(
        {
          error: {
            code: 'QUEUE_UNAVAILABLE',
            message:
              'Background queue is unavailable. Please retry in a few seconds.',
          },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // Flip to RUNNING immediately so the polling client sees progress.
    const startedAt = new Date();
    const running = await this.prisma.questionPaperJob.update({
      where: { id: job.id },
      data: { status: PaperJobStatus.RUNNING, startedAt },
    });

    await this.writeAuditLog(actor, 'paper.created', job.id, {
      classroomId,
      syllabusId,
      examType: dto.examType,
      totalMarks: dto.totalMarks,
    });

    return { job: this.toJobView(running, null) };
  }

  /* ------------------------------------------------------------------------ */
  /* GET /question-papers/jobs/:id                                            */
  /* ------------------------------------------------------------------------ */

  async getJob(actor: User, jobId: string): Promise<{ job: QuestionPaperJobView }> {
    const job = await this.prisma.questionPaperJob.findFirst({
      where: { id: jobId, institutionId: actor.institutionId },
      include: {
        questionPaper: {
          select: {
            id: true,
            title: true,
            examType: true,
            totalMarks: true,
            status: true,
          },
        },
      },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    // Visibility: actor must be able to see the parent classroom.
    await this.assertClassroomVisible(actor, job.classroomId);

    // Optional live progress from BullMQ if still RUNNING.
    let progress: { step: string; percentage: number } | null = null;
    if (job.status === PaperJobStatus.RUNNING) {
      try {
        const liveJob = await this.queue.getJob(`qp:${job.id}`);
        const raw = liveJob ? await liveJob.progress : null;
        if (
          raw &&
          typeof raw === 'object' &&
          'step' in raw &&
          'percentage' in raw
        ) {
          progress = {
            step: String((raw as { step: unknown }).step),
            percentage: Number((raw as { percentage: unknown }).percentage) || 0,
          };
        }
      } catch (err) {
        this.logger.debug(
          `Could not fetch live progress for job ${job.id}: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    return { job: this.toJobView(job, progress, job.questionPaper) };
  }

  /* ------------------------------------------------------------------------ */
  /* PATCH /question-papers/:id                                               */
  /* ------------------------------------------------------------------------ */

  async editPaper(
    actor: User,
    paperId: string,
    dto: EditQuestionPaperDto,
  ): Promise<{ paper: QuestionPaperDetailView }> {
    const paper = await this.loadPaperForActor(actor, paperId);

    const isOwner =
      actor.role === UserRole.TEACHER && paper.teacherId === actor.id;
    const isAdmin =
      actor.role === UserRole.ADMIN || actor.role === UserRole.SUPER_ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Only the paper author or an admin can edit this paper',
      );
    }

    if (paper.status === NoteStatus.PUBLISHED) {
      throw new PreconditionFailedException(
        'Cannot edit a published paper. Unpublish first or duplicate it.',
      );
    }

    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('No fields supplied for update');
    }

    const data: Prisma.QuestionPaperUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.durationMinutes !== undefined) {
      data.durationMinutes = dto.durationMinutes;
    }

    if (dto.structuredContent !== undefined) {
      // Validate against the original input config (marks total etc).
      const inputConfig = await this.loadInputConfig(paper);
      const validation = validatePaperStructure(
        dto.structuredContent as unknown,
        inputConfig,
      );
      if (!validation.ok) {
        throw new BadRequestException(
          'Structured content failed validation: ' + validation.errors.join('; '),
        );
      }
      data.structuredContent =
        validation.content as unknown as Prisma.InputJsonValue;
      // Stale PDFs — null both URLs so a re-export is required.
      data.fileUrl = null;
      data.answerKeyFileUrl = null;
    }

    const updated = await this.prisma.questionPaper.update({
      where: { id: paper.id },
      data,
    });

    await this.writeAuditLog(actor, 'paper.updated', paper.id, {
      classroomId: paper.classroomId,
      changedKeys: Object.keys(dto),
    });

    return { paper: await this.toDetailView(updated) };
  }

  /* ------------------------------------------------------------------------ */
  /* POST /question-papers/:id/regenerate-question                            */
  /* ------------------------------------------------------------------------ */

  async regenerateQuestion(
    actor: User,
    paperId: string,
    dto: RegenerateQuestionDto,
  ): Promise<{ paper: QuestionPaperDetailView; regeneratedAt: Date }> {
    const paper = await this.loadPaperForActor(actor, paperId);

    const isOwner =
      actor.role === UserRole.TEACHER && paper.teacherId === actor.id;
    const isAdmin =
      actor.role === UserRole.ADMIN || actor.role === UserRole.SUPER_ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Only the paper author or an admin can regenerate questions',
      );
    }

    if (paper.status === NoteStatus.PUBLISHED) {
      throw new PreconditionFailedException(
        'Cannot regenerate a question on a published paper.',
      );
    }

    const content = this.readStructuredContent(paper);
    const section = content.sections[dto.sectionIndex];
    if (!section) {
      throw new BadRequestException(
        `Section index ${dto.sectionIndex} out of range`,
      );
    }
    const existing = section.questions[dto.questionIndex];
    if (!existing) {
      throw new BadRequestException(
        `Question index ${dto.questionIndex} out of range in section ${dto.sectionIndex}`,
      );
    }

    const inputConfig = await this.loadInputConfig(paper);

    // Fetch classroom + syllabus for prompt context.
    const classroom = await this.prisma.classroom.findFirst({
      where: { id: paper.classroomId, institutionId: paper.institutionId },
      select: {
        id: true,
        institutionId: true,
        subjectId: true,
        classId: true,
        syllabusId: true,
      },
    });
    if (!classroom || !classroom.syllabusId) {
      throw new PreconditionFailedException(
        'Classroom/syllabus context missing — cannot regenerate.',
      );
    }
    const subjectName = await this.resolveSubjectName(classroom.subjectId);
    const className = await this.resolveClassName(classroom.classId);

    // Use RAG to pull the most relevant chunks for THIS question's text.
    const rag = await this.rag.retrieve(
      paper.institutionId,
      classroom.id,
      classroom.syllabusId,
      existing.text,
      { topK: 6 },
    );

    const prompt = buildSingleQuestionRegeneratePrompt({
      subject: subjectName,
      className,
      examType: String(paper.examType),
      existingQuestion: {
        type: existing.type,
        text: existing.text,
        marks: existing.marks,
        ...(existing.options !== undefined && { options: existing.options }),
      },
      ...(dto.hint !== undefined && dto.hint.trim().length > 0 && { hint: dto.hint }),
      includeAnswerKey: inputConfig.includeAnswerKey,
      syllabusChunks: rag.chunks.map((c) => ({
        content: c.content,
        chapter: c.citation.chapter,
        topic: c.citation.topic,
        pageNumber: c.citation.pageNumber,
      })),
    });

    let parsed: unknown;
    let result;
    try {
      result = await this.chat.complete(paper.institutionId, {
        systemPrompt: prompt,
        userMessage: 'Generate the replacement question now.',
        maxTokens: 1024,
      });
      parsed = extractJson(result.content);
    } catch (err) {
      this.logger.error(
        `Question regeneration LLM call failed: ` +
          (err instanceof Error ? err.message : String(err)),
        err instanceof Error ? err.stack : undefined,
      );
      throw new HttpException(
        {
          error: {
            code: 'REGENERATE_FAILED',
            message: 'AI failed to regenerate the question. Please retry.',
          },
        },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const newQuestion = this.coerceRegeneratedQuestion(
      parsed,
      existing,
      inputConfig.includeAnswerKey,
    );

    // Replace the question in-place.
    const newContent: StructuredContent = {
      ...content,
      sections: content.sections.map((s, sIdx) => {
        if (sIdx !== dto.sectionIndex) return s;
        return {
          ...s,
          questions: s.questions.map((q, qIdx) =>
            qIdx === dto.questionIndex ? newQuestion : q,
          ),
        };
      }),
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      // Cost tracking.
      const cost = computeChatCostUsd(
        result.model,
        result.promptTokens,
        result.completionTokens,
      );
      await tx.aiUsageLog.create({
        data: {
          institutionId: paper.institutionId,
          userId: actor.id,
          classroomId: paper.classroomId,
          operation: 'paper_generation',
          provider: 'anthropic',
          modelName: result.model,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          totalTokens: result.promptTokens + result.completionTokens,
          costUsd: cost,
          metadata: {
            paperId: paper.id,
            phase: 'regenerate_question',
            sectionIndex: dto.sectionIndex,
            questionIndex: dto.questionIndex,
          },
        },
      });

      // RAG embedding usage.
      if (rag.totalTokens > 0) {
        await tx.aiUsageLog.create({
          data: {
            institutionId: paper.institutionId,
            userId: actor.id,
            classroomId: paper.classroomId,
            operation: 'embedding',
            provider: 'openai',
            modelName: rag.embeddingModel,
            promptTokens: rag.totalTokens,
            completionTokens: 0,
            totalTokens: rag.totalTokens,
            costUsd: (rag.totalTokens / 1_000_000) * 0.02,
            metadata: {
              paperId: paper.id,
              phase: 'regenerate_question_rag',
            },
          },
        });
      }

      // The paper itself — clear PDF URLs so re-export is required.
      return tx.questionPaper.update({
        where: { id: paper.id },
        data: {
          structuredContent: newContent as unknown as Prisma.InputJsonValue,
          fileUrl: null,
          answerKeyFileUrl: null,
        },
      });
    });

    const regeneratedAt = new Date();
    await this.writeAuditLog(actor, 'paper.question_regenerated', paper.id, {
      classroomId: paper.classroomId,
      sectionIndex: dto.sectionIndex,
      questionIndex: dto.questionIndex,
    });

    // Sprint 8.1 — atomic credit increment through SubscriptionsService.
    const regenTokens =
      result.promptTokens + result.completionTokens + rag.totalTokens;
    if (regenTokens > 0) {
      try {
        await this.subscriptions.incrementAiCredits(
          paper.institutionId,
          regenTokens,
        );
      } catch (incErr) {
        this.logger.warn(
          `incrementAiCredits failed for paper ${paper.id}: ` +
            (incErr instanceof Error ? incErr.message : String(incErr)),
        );
      }
    }

    // Sprint 6 — credits bumped; trip AI_CREDITS_LOW if at threshold.
    await this.notifications.maybeNotifyCreditsLow(paper.institutionId);

    return {
      paper: await this.toDetailView(updated),
      regeneratedAt,
    };
  }

  /* ------------------------------------------------------------------------ */
  /* POST /question-papers/:id/export                                         */
  /* ------------------------------------------------------------------------ */

  async exportPdf(
    actor: User,
    paperId: string,
  ): Promise<{ paper: QuestionPaperDetailView }> {
    const paper = await this.loadPaperForActor(actor, paperId);

    const isOwner =
      actor.role === UserRole.TEACHER && paper.teacherId === actor.id;
    const isAdmin =
      actor.role === UserRole.ADMIN || actor.role === UserRole.SUPER_ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Only the paper author or an admin can export this paper',
      );
    }

    // Idempotency: if the PDF exists AND the paper hasn't been edited since
    // the last export, return the existing URL.
    if (paper.fileUrl) {
      return { paper: await this.toDetailView(paper) };
    }

    // Build render context.
    const ctx = await this.buildPdfContext(paper);

    // Render + upload main paper.
    const paperBuffer = await this.paperPdf.renderPaper(ctx);
    const paperPath = `${paper.institutionId}/papers/${paper.id}/paper.pdf`;
    await this.storage.uploadObject(paperPath, paperBuffer, 'application/pdf');

    // Optionally render + upload answer key.
    let answerKeyPath: string | null = null;
    const inputConfig = await this.loadInputConfig(paper);
    if (inputConfig.includeAnswerKey) {
      const keyBuffer = await this.paperPdf.renderAnswerKey(ctx);
      if (keyBuffer) {
        answerKeyPath = `${paper.institutionId}/papers/${paper.id}/answer-key.pdf`;
        await this.storage.uploadObject(
          answerKeyPath,
          keyBuffer,
          'application/pdf',
        );
      }
    }

    const updated = await this.prisma.questionPaper.update({
      where: { id: paper.id },
      data: {
        fileUrl: paperPath,
        answerKeyFileUrl: answerKeyPath,
      },
    });

    await this.writeAuditLog(actor, 'paper.exported', paper.id, {
      classroomId: paper.classroomId,
      hasAnswerKey: answerKeyPath !== null,
    });

    return { paper: await this.toDetailView(updated) };
  }

  /* ------------------------------------------------------------------------ */
  /* POST /question-papers/:id/publish                                        */
  /* ------------------------------------------------------------------------ */

  async publish(
    actor: User,
    paperId: string,
  ): Promise<{ paper: QuestionPaperDetailView }> {
    const paper = await this.loadPaperForActor(actor, paperId);

    const isOwner =
      actor.role === UserRole.TEACHER && paper.teacherId === actor.id;
    const isAdmin =
      actor.role === UserRole.ADMIN || actor.role === UserRole.SUPER_ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Only the paper author or an admin can publish this paper',
      );
    }

    if (!paper.fileUrl) {
      throw new PreconditionFailedException(
        'Paper PDF has not been exported yet. Export first, then publish.',
      );
    }

    if (paper.status === NoteStatus.PUBLISHED) {
      return { paper: await this.toDetailView(paper) };
    }

    const publishedAt = new Date();
    const updated = await this.prisma.questionPaper.update({
      where: { id: paper.id },
      data: {
        status: NoteStatus.PUBLISHED,
        publishedAt,
      },
      include: {
        classroom: { select: { id: true, name: true } },
      },
    });

    // Fan-out notifications to ACTIVE student members.
    await this.fanoutPublishNotifications(updated);

    await this.writeAuditLog(actor, 'paper.published', paper.id, {
      classroomId: paper.classroomId,
    });

    return { paper: await this.toDetailView(updated) };
  }

  /* ------------------------------------------------------------------------ */
  /* Internal — access control                                                */
  /* ------------------------------------------------------------------------ */

  /**
   * Returns the classroom IFF the actor can WRITE to it (assigned teacher,
   * institution admin, or super-admin). 404 otherwise (non-disclosure).
   */
  private async assertClassroomWritable(
    actor: User,
    classroomId: string,
  ): Promise<Classroom> {
    if (actor.role === UserRole.STUDENT) {
      throw new ForbiddenException(
        'Students cannot generate question papers.',
      );
    }
    const classroom = await this.prisma.classroom.findFirst({
      where: { id: classroomId, institutionId: actor.institutionId },
    });
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }
    const isAdmin =
      actor.role === UserRole.ADMIN || actor.role === UserRole.SUPER_ADMIN;
    if (isAdmin) return classroom;

    if (actor.role === UserRole.TEACHER) {
      if (classroom.teacherId === actor.id) return classroom;
      // Co-teacher membership?
      const member = await this.prisma.classroomMember.findFirst({
        where: {
          classroomId: classroom.id,
          userId: actor.id,
          role: UserRole.TEACHER,
          status: Status.ACTIVE,
        },
        select: { id: true },
      });
      if (member) return classroom;
    }
    throw new NotFoundException('Classroom not found');
  }

  /**
   * Read-only visibility check used when fetching jobs (teachers should be
   * able to see jobs in classrooms they're enrolled in even if they didn't
   * create the job — admins/super-admins always pass).
   */
  private async assertClassroomVisible(
    actor: User,
    classroomId: string,
  ): Promise<void> {
    const classroom = await this.prisma.classroom.findFirst({
      where: { id: classroomId, institutionId: actor.institutionId },
      select: { id: true, teacherId: true },
    });
    if (!classroom) {
      throw new NotFoundException('Job not found');
    }
    if (
      actor.role === UserRole.ADMIN ||
      actor.role === UserRole.SUPER_ADMIN
    ) {
      return;
    }
    if (actor.role === UserRole.TEACHER && classroom.teacherId === actor.id) {
      return;
    }
    // For teachers/students, also accept any active classroom_member row.
    const member = await this.prisma.classroomMember.findFirst({
      where: {
        classroomId: classroom.id,
        userId: actor.id,
        status: Status.ACTIVE,
      },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException('Job not found');
    }
  }

  private async loadPaperForActor(
    actor: User,
    paperId: string,
  ): Promise<QuestionPaper> {
    const paper = await this.prisma.questionPaper.findFirst({
      where: { id: paperId, institutionId: actor.institutionId },
    });
    if (!paper) {
      throw new NotFoundException('Question paper not found');
    }
    // Students never see DRAFT papers — flag as not-found.
    if (
      actor.role === UserRole.STUDENT &&
      paper.status !== NoteStatus.PUBLISHED
    ) {
      throw new NotFoundException('Question paper not found');
    }
    // Verify classroom visibility (covers role-aware scoping).
    await this.assertClassroomVisible(actor, paper.classroomId);
    return paper;
  }

  /* ------------------------------------------------------------------------ */
  /* Internal — helpers                                                       */
  /* ------------------------------------------------------------------------ */

  private async resolveSubjectName(subjectId: string): Promise<string> {
    const subject = await this.prisma.subject.findUnique({
      where: { id: subjectId },
      select: { name: true },
    });
    return subject?.name ?? 'this subject';
  }

  private async resolveClassName(classId: string): Promise<string> {
    const klass = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { name: true },
    });
    return klass?.name ?? 'this class';
  }

  /**
   * Loads the original GenerateQuestionPaperInput from the parent
   * QuestionPaperJob's `inputConfig` JSON column. Used by edit / regenerate /
   * export to enforce the same constraints that the worker enforced when
   * generating the paper.
   */
  private async loadInputConfig(
    paper: QuestionPaper,
  ): Promise<GenerateQuestionPaperInput> {
    const job = await this.prisma.questionPaperJob.findFirst({
      where: { id: paper.jobId, institutionId: paper.institutionId },
      select: { inputConfig: true },
    });
    const raw = job?.inputConfig as unknown;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as GenerateQuestionPaperInput;
    }
    // Defensive fallback: synthesize from the paper itself so callers don't
    // crash if the job row is somehow corrupt. Marks validation degrades to
    // "must equal paper.totalMarks" + "answer keys based on existing data".
    return {
      portions: [],
      examType: paper.examType,
      totalMarks: paper.totalMarks,
      questionTypes: [],
      includeAnswerKey: this.readStructuredContent(paper).sections.some((s) =>
        s.questions.some(
          (q) => typeof q.answer === 'string' && q.answer.trim().length > 0,
        ),
      ),
    };
  }

  private readStructuredContent(paper: QuestionPaper): StructuredContent {
    const raw = paper.structuredContent as unknown;
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw) ||
      !('sections' in (raw as Record<string, unknown>))
    ) {
      throw new HttpException(
        {
          error: {
            code: 'MALFORMED_PAPER',
            message:
              'Stored paper has no structured content. Re-generate the paper.',
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return raw as StructuredContent;
  }

  private coerceRegeneratedQuestion(
    parsed: unknown,
    existing: GeneratedQuestion,
    includeAnswerKey: boolean,
  ): GeneratedQuestion {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new BadRequestException('Regenerated question was not a JSON object');
    }
    const v = parsed as Record<string, unknown>;
    const text = typeof v['text'] === 'string' ? (v['text'] as string).trim() : '';
    const marksRaw = v['marks'];
    const marks = Number.isInteger(marksRaw) ? (marksRaw as number) : existing.marks;
    if (text.length === 0) {
      throw new BadRequestException('Regenerated question had empty text');
    }
    if (marks !== existing.marks) {
      throw new BadRequestException(
        `Regenerated question must keep marks=${existing.marks}`,
      );
    }
    const q: GeneratedQuestion = {
      type: existing.type,
      text,
      marks,
    };
    if (existing.options && Array.isArray(v['options'])) {
      const opts = (v['options'] as unknown[]).filter(
        (o) => typeof o === 'string' && o.trim().length > 0,
      ) as string[];
      if (opts.length >= 2) q.options = opts;
    } else if (existing.options) {
      // Keep prior options if model omitted.
      q.options = existing.options;
    }
    if (includeAnswerKey) {
      const ans = typeof v['answer'] === 'string' ? (v['answer'] as string) : '';
      if (ans.trim().length === 0) {
        throw new BadRequestException(
          'Regenerated question is missing an answer (includeAnswerKey=true)',
        );
      }
      q.answer = ans.trim();
    } else if (typeof v['answer'] === 'string') {
      q.answer = (v['answer'] as string).trim();
    }
    if (
      v['source'] &&
      typeof v['source'] === 'object' &&
      !Array.isArray(v['source'])
    ) {
      const s = v['source'] as Record<string, unknown>;
      const source: { chapter?: string; topic?: string } = {};
      if (typeof s['chapter'] === 'string' && (s['chapter'] as string).trim()) {
        source.chapter = (s['chapter'] as string).trim();
      }
      if (typeof s['topic'] === 'string' && (s['topic'] as string).trim()) {
        source.topic = (s['topic'] as string).trim();
      }
      if (source.chapter || source.topic) q.source = source;
    }
    return q;
  }

  private async fanoutPublishNotifications(
    paper: QuestionPaper & { classroom?: { name: string } | null },
  ): Promise<void> {
    const members = await this.prisma.classroomMember.findMany({
      where: {
        institutionId: paper.institutionId,
        classroomId: paper.classroomId,
        role: UserRole.STUDENT,
        status: Status.ACTIVE,
      },
      select: { userId: true },
    });
    if (members.length === 0) return;

    const classroomName = paper.classroom?.name ?? 'your classroom';

    // PAPER_GENERATED is the Sprint 6 canonical type (was PAPER_READY).
    const result = await this.notifications.notifyMany({
      institutionId: paper.institutionId,
      userIds: members.map((m) => m.userId),
      type: NotificationType.PAPER_GENERATED,
      title: `${classroomName}: ${paper.title} is now available`,
      body: `A new question paper has been published in ${classroomName}.`,
      metadata: {
        paperId: paper.id,
        classroomId: paper.classroomId,
      },
    });
    this.logger.log(
      `Notified ${result.count} student(s) of new paper ${paper.id} in classroom ${paper.classroomId}`,
    );
  }

  private async writeAuditLog(
    actor: User,
    action: string,
    entityId: string | null,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          institutionId: actor.institutionId,
          actorId: actor.id,
          action,
          entityType: 'QuestionPaper',
          ...(entityId !== null && { entityId }),
          metadata: metadata as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Audit log write failed (${action}): ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Internal — view projections                                              */
  /* ------------------------------------------------------------------------ */

  private toJobView(
    job: QuestionPaperJob,
    progress: { step: string; percentage: number } | null,
    paperSummary?: {
      id: string;
      title: string;
      examType: import('@prisma/client').ExamType;
      totalMarks: number;
      status: NoteStatus;
    } | null,
  ): QuestionPaperJobView {
    const view: QuestionPaperJobView = {
      id: job.id,
      classroomId: job.classroomId,
      teacherId: job.teacherId,
      syllabusId: job.syllabusId,
      status: job.status,
      errorMessage: job.errorMessage,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      paperId: paperSummary?.id ?? null,
      paper: paperSummary
        ? {
            id: paperSummary.id,
            title: paperSummary.title,
            examType: paperSummary.examType,
            totalMarks: paperSummary.totalMarks,
            status: paperSummary.status,
          }
        : null,
      inputConfig: job.inputConfig as unknown as GenerateQuestionPaperInput,
      progress,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
    return view;
  }

  /**
   * Builds the public detail view, freshly signing the storage URLs each
   * call (1h expiry).
   */
  async toDetailView(paper: QuestionPaper): Promise<QuestionPaperDetailView> {
    const [fileSignedUrl, answerKeySignedUrl] = await Promise.all([
      this.storage.getSignedUrl(paper.fileUrl),
      this.storage.getSignedUrl(paper.answerKeyFileUrl),
    ]);

    const source = await this.buildSourceSummary(paper);

    return {
      id: paper.id,
      jobId: paper.jobId,
      classroomId: paper.classroomId,
      teacherId: paper.teacherId,
      institutionId: paper.institutionId,
      title: paper.title,
      examType: paper.examType,
      totalMarks: paper.totalMarks,
      durationMinutes: paper.durationMinutes,
      structuredContent: this.readStructuredContent(paper),
      fileUrl: paper.fileUrl,
      fileSignedUrl,
      answerKeyFileUrl: paper.answerKeyFileUrl,
      answerKeySignedUrl,
      aiConfidence: paper.aiConfidence ? Number(paper.aiConfidence) : null,
      status: paper.status,
      publishedAt: paper.publishedAt,
      sourceSummary: source,
      createdAt: paper.createdAt,
      updatedAt: paper.updatedAt,
    };
  }

  private async buildSourceSummary(
    paper: QuestionPaper,
  ): Promise<PaperSourceSummary> {
    const job = await this.prisma.questionPaperJob.findFirst({
      where: { id: paper.jobId, institutionId: paper.institutionId },
      include: {
        syllabus: { select: { name: true, version: true } },
      },
    });
    const inputConfig =
      (job?.inputConfig as unknown as GenerateQuestionPaperInput) ??
      ({
        includeAnswerKey: false,
        portions: [],
        examType: paper.examType,
        totalMarks: paper.totalMarks,
        questionTypes: [],
      } satisfies GenerateQuestionPaperInput);

    let samplePaperNames: string[] = [];
    if (inputConfig.samplePaperIds && inputConfig.samplePaperIds.length > 0) {
      const samples = await this.prisma.sampleQuestionPaper.findMany({
        where: {
          id: { in: inputConfig.samplePaperIds },
          institutionId: paper.institutionId,
        },
        select: { name: true },
      });
      samplePaperNames = samples.map((s) => s.name);
    }

    return {
      syllabusName: job?.syllabus?.name ?? 'Unknown syllabus',
      syllabusVersion: job?.syllabus?.version ?? 'v1',
      samplePaperNames,
    };
  }

  private async buildPdfContext(
    paper: QuestionPaper,
  ): Promise<PaperPdfContext> {
    const [classroom, institution] = await Promise.all([
      this.prisma.classroom.findFirst({
        where: { id: paper.classroomId, institutionId: paper.institutionId },
        include: {
          class: { select: { name: true } },
          section: { select: { name: true } },
          subject: { select: { name: true } },
        },
      }),
      this.prisma.institution.findFirst({
        where: { id: paper.institutionId },
        select: { name: true },
      }),
    ]);

    const source = await this.buildSourceSummary(paper);

    return {
      paper: {
        id: paper.id,
        title: paper.title,
        examType: paper.examType,
        totalMarks: paper.totalMarks,
        durationMinutes: paper.durationMinutes,
        structuredContent: this.readStructuredContent(paper),
      },
      classroom: {
        name: classroom?.name ?? 'Classroom',
        className: classroom?.class?.name ?? '—',
        sectionName: classroom?.section?.name ?? null,
        subjectName: classroom?.subject?.name ?? '—',
      },
      institution: {
        name: institution?.name ?? 'Vaasenk',
      },
      source,
    };
  }

  /* ------------------------------------------------------------------------ */
  /* Token budget helper (used by the worker)                                 */
  /* ------------------------------------------------------------------------ */

  static estimatePromptTokens(text: string): number {
    return countTokens(text, DEFAULT_CHAT_MODEL);
  }
}

/* -------------------------------------------------------------------------- */
/* Exported view types                                                        */
/* -------------------------------------------------------------------------- */

export interface QuestionPaperJobView {
  id: string;
  classroomId: string;
  teacherId: string;
  syllabusId: string | null;
  status: PaperJobStatus;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  paperId: string | null;
  paper: {
    id: string;
    title: string;
    examType: import('@prisma/client').ExamType;
    totalMarks: number;
    status: NoteStatus;
  } | null;
  inputConfig: GenerateQuestionPaperInput;
  progress: { step: string; percentage: number } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuestionPaperDetailView {
  id: string;
  jobId: string;
  classroomId: string;
  teacherId: string;
  institutionId: string;
  title: string;
  examType: import('@prisma/client').ExamType;
  totalMarks: number;
  durationMinutes: number | null;
  structuredContent: StructuredContent;
  fileUrl: string | null;
  fileSignedUrl: string | null;
  answerKeyFileUrl: string | null;
  answerKeySignedUrl: string | null;
  aiConfidence: number | null;
  status: NoteStatus;
  publishedAt: Date | null;
  sourceSummary: PaperSourceSummary;
  createdAt: Date;
  updatedAt: Date;
}
