import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import {
  Prisma,
  ProcessingStatus,
  UserRole,
  type AiChatSession,
  type User,
} from '@prisma/client';
import {
  ChatService,
  Citation,
  RagService,
  buildTeacherAssistantSystemPrompt,
  computeChatCostUsd,
  type ChatHistoryMessage,
  type ChatStreamEvent,
} from '@vaasenk/ai';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import {
  CreateChatSessionDto,
  ListChatSessionsDto,
  SendChatMessageDto,
} from './ai-chat.dto';

/**
 * AI Chat service — Sprint 4 PROMPT 18.
 *
 * Implements the teacher chatbot flow end-to-end:
 *   1. Resolve & authorize the classroom (teacher, admin, or super-admin).
 *   2. Verify the syllabus is AI_READY.
 *   3. Enforce monthly AI credit limits (subscription).
 *   4. Persist the user message.
 *   5. Retrieve syllabus chunks via RAG.
 *   6. Stream the Claude completion, persisting tokens to the response body.
 *   7. On completion, persist the assistant message + write `AiUsageLog`.
 *
 * Multi-tenant scoping (CLAUDE.md §3) is enforced on every read/write by
 * filtering on `actor.institutionId`.
 */

const HISTORY_WINDOW = 10;
const MESSAGE_PAGE_LIMIT = 100;

/** Trimmed shape we serialize back to the client for sessions. */
type ChatSessionView = {
  id: string;
  title: string | null;
  classroomId: string;
  chatbotId: string;
  createdAt: Date;
  updatedAt: Date;
  messagesCount: number;
};

/** Trimmed shape for messages. */
type ChatMessageView = {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  citations: Citation[];
  safetyStatus: string | null;
  tokenCount: number | null;
  modelName: string | null;
  createdAt: Date;
};

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rag: RagService,
    private readonly chat: ChatService,
    private readonly notifications: NotificationsService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  /* ------------------------------------------------------------------------ */
  /* POST /classrooms/:id/ai/sessions                                          */
  /* ------------------------------------------------------------------------ */

  async createSession(
    actor: User,
    classroomId: string,
    dto: CreateChatSessionDto,
  ): Promise<{ session: ChatSessionView }> {
    const classroom = await this.assertClassroomAccess(actor, classroomId);
    if (!classroom.syllabusId) {
      throw new PreconditionFailedException(
        'Classroom has no mapped syllabus. Ask an admin to map a syllabus first.',
      );
    }
    const chatbot = await this.getOrCreateChatbot(
      actor.institutionId,
      classroom.id,
      classroom.syllabusId,
    );
    if (chatbot.status !== ProcessingStatus.AI_READY) {
      throw new PreconditionFailedException(
        'Syllabus is still being prepared for AI. Try again in a few minutes.',
      );
    }

    const title =
      dto.title?.trim() ||
      `Chat — ${new Date().toISOString().replace('T', ' ').slice(0, 16)}`;

    const session = await this.prisma.aiChatSession.create({
      data: {
        institutionId: actor.institutionId,
        chatbotId: chatbot.id,
        classroomId: classroom.id,
        teacherId: actor.id,
        title,
      },
    });

    return { session: this.toSessionView(session, 0) };
  }

  /* ------------------------------------------------------------------------ */
  /* GET /classrooms/:id/ai/sessions                                           */
  /* ------------------------------------------------------------------------ */

  async listSessions(
    actor: User,
    classroomId: string,
    query: ListChatSessionsDto,
  ): Promise<{
    data: ChatSessionView[];
    meta: { page: number; limit: number; total: number };
  }> {
    const classroom = await this.assertClassroomAccess(actor, classroomId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.AiChatSessionWhereInput = {
      institutionId: actor.institutionId,
      classroomId: classroom.id,
    };
    // Teachers see only their own sessions; admins see everyone's.
    if (actor.role === UserRole.TEACHER) {
      where.teacherId = actor.id;
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.aiChatSession.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { messages: true } } },
      }),
      this.prisma.aiChatSession.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.toSessionView(r, r._count.messages)),
      meta: { page, limit, total },
    };
  }

  /* ------------------------------------------------------------------------ */
  /* GET /classrooms/:id/ai/sessions/:sessionId                                */
  /* ------------------------------------------------------------------------ */

  async getSessionWithMessages(
    actor: User,
    classroomId: string,
    sessionId: string,
  ): Promise<{ session: ChatSessionView; messages: ChatMessageView[] }> {
    const { session } = await this.loadSession(actor, classroomId, sessionId);

    const messages = await this.prisma.aiChatMessage.findMany({
      where: {
        institutionId: actor.institutionId,
        sessionId: session.id,
      },
      orderBy: { createdAt: 'asc' },
      take: MESSAGE_PAGE_LIMIT,
    });

    return {
      session: this.toSessionView(session, messages.length),
      messages: messages.map((m) => this.toMessageView(m)),
    };
  }

  /* ------------------------------------------------------------------------ */
  /* POST /classrooms/:id/ai/sessions/:sessionId/chat                          */
  /* ------------------------------------------------------------------------ */

  /**
   * Streams a chat completion. The generator yields each event from the
   * model (token → ... → usage / error), and at the `usage` event we
   * persist the assistant message, update credits, and write the
   * AiUsageLog row.
   *
   * The controller turns this iterable into SSE frames written directly to
   * the Express Response (see ai-chat.controller.ts). The interceptor is
   * bypassed because we write raw SSE; this is documented at the controller.
   */
  async *streamChat(
    actor: User,
    classroomId: string,
    sessionId: string,
    dto: SendChatMessageDto,
  ): AsyncGenerator<ChatStreamEvent> {
    // 1) Authorization + status preflight.
    const { session, classroom } = await this.loadSession(
      actor,
      classroomId,
      sessionId,
    );

    if (!classroom.syllabusId) {
      throw new PreconditionFailedException(
        'Classroom has no mapped syllabus.',
      );
    }
    const syllabus = await this.prisma.syllabusDocument.findFirst({
      where: {
        id: classroom.syllabusId,
        institutionId: actor.institutionId,
      },
      select: { id: true, status: true },
    });
    if (!syllabus || syllabus.status !== ProcessingStatus.AI_READY) {
      throw new PreconditionFailedException(
        'Syllabus is still being prepared for AI. Try again in a few minutes.',
      );
    }

    // 2) Credit check — delegated to the @Global SubscriptionsService.
    // Sprint 8.1 formalizes the Sprint 4 inline check into a reusable
    // guard. Soft-over-the-limit semantics preserved: the call that
    // pushes us over the cap still completes; the NEXT call fails closed.
    try {
      await this.subscriptions.ensureAiCreditsAvailable(actor.institutionId);
    } catch (err) {
      await this.writeAuditLog(actor, 'chat.credit_exceeded', sessionId, {
        reason: err instanceof Error ? err.message : 'limit_reached',
      });
      throw err;
    }

    // 3) Persist the user message.
    await this.prisma.aiChatMessage.create({
      data: {
        institutionId: actor.institutionId,
        sessionId: session.id,
        role: 'user',
        content: dto.content,
      },
    });

    await this.writeAuditLog(actor, 'chat.message_sent', sessionId, {
      length: dto.content.length,
    });

    // 4) Build context + history.
    const subjectName = await this.resolveSubjectName(classroom.subjectId);
    const className = await this.resolveClassName(classroom.classId);

    const rag = await this.rag.retrieve(
      actor.institutionId,
      classroom.id,
      classroom.syllabusId,
      dto.content,
      { topK: 5 },
    );

    const history = await this.loadHistory(actor.institutionId, session.id);

    const systemPrompt = buildTeacherAssistantSystemPrompt({
      subject: subjectName,
      className,
      chunks: rag.chunks,
    });

    // 5) Open the stream.
    const stream = this.chat.stream(actor.institutionId, {
      systemPrompt,
      userMessage: dto.content,
      history,
      contextChunks: rag.chunks,
    });

    let finalContent = '';
    let finalCitations: Citation[] = [];
    let finalUsage: {
      promptTokens: number;
      completionTokens: number;
      model: string;
    } | null = null;
    let safetyStatus: 'passed' | 'flagged' = 'passed';

    try {
      for await (const event of stream) {
        if (event.type === 'token') {
          yield event;
        } else if (event.type === 'usage') {
          finalContent = event.content;
          finalCitations = event.citations;
          finalUsage = {
            promptTokens: event.promptTokens,
            completionTokens: event.completionTokens,
            model: event.model,
          };
          yield event;
        } else if (event.type === 'error') {
          safetyStatus = 'flagged';
          yield event;
        }
      }
    } finally {
      // 6) Persist the assistant message + usage log even on error so the
      //    session keeps a consistent transcript. If we have NO content at
      //    all (immediate provider failure), skip persistence — there's
      //    nothing meaningful to save.
      if (finalContent.length > 0 || safetyStatus === 'flagged') {
        await this.persistAssistantResponse({
          institutionId: actor.institutionId,
          sessionId: session.id,
          classroomId: classroom.id,
          actorId: actor.id,
          content: finalContent,
          citations: finalCitations,
          safetyStatus,
          usage: finalUsage,
          ragTokens: rag.totalTokens,
          ragModel: rag.embeddingModel,
        });
      }
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Internal helpers                                                          */
  /* ------------------------------------------------------------------------ */

  /**
   * Returns the classroom IFF the actor is the teacher of record OR an
   * institution admin / super-admin. 404 otherwise (non-disclosure).
   * Students are explicitly rejected even if they're members — Sprint 4
   * restricts chat to teachers.
   */
  private async assertClassroomAccess(
    actor: User,
    classroomId: string,
  ): Promise<{
    id: string;
    institutionId: string;
    syllabusId: string | null;
    subjectId: string;
    classId: string;
    teacherId: string;
  }> {
    if (actor.role === UserRole.STUDENT) {
      // Students don't see chat at all in Sprint 4.
      throw new ForbiddenException(
        'Students do not have access to the AI assistant in this sprint.',
      );
    }
    const classroom = await this.prisma.classroom.findFirst({
      where: {
        id: classroomId,
        institutionId: actor.institutionId,
      },
      select: {
        id: true,
        institutionId: true,
        syllabusId: true,
        subjectId: true,
        classId: true,
        teacherId: true,
      },
    });
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }
    const isAdmin =
      actor.role === UserRole.ADMIN || actor.role === UserRole.SUPER_ADMIN;
    const isAssignedTeacher =
      actor.role === UserRole.TEACHER && classroom.teacherId === actor.id;
    if (!isAdmin && !isAssignedTeacher) {
      // Non-assigned teacher / unknown role — 404 per non-disclosure rule.
      throw new NotFoundException('Classroom not found');
    }
    return classroom;
  }

  /**
   * Loads a chat session enforcing institution + classroom + visibility
   * scoping. Teachers can only see their own sessions; admins see everyone's.
   */
  private async loadSession(
    actor: User,
    classroomId: string,
    sessionId: string,
  ): Promise<{
    session: AiChatSession;
    classroom: {
      id: string;
      institutionId: string;
      syllabusId: string | null;
      subjectId: string;
      classId: string;
      teacherId: string;
    };
  }> {
    const classroom = await this.assertClassroomAccess(actor, classroomId);

    const where: Prisma.AiChatSessionWhereInput = {
      id: sessionId,
      institutionId: actor.institutionId,
      classroomId: classroom.id,
    };
    if (actor.role === UserRole.TEACHER) {
      where.teacherId = actor.id;
    }
    const session = await this.prisma.aiChatSession.findFirst({ where });
    if (!session) {
      throw new NotFoundException('Chat session not found');
    }
    return { session, classroom };
  }

  /**
   * Lazily creates the per-classroom `AiChatbot` row on first session, and
   * keeps its status synced with the mapped syllabus's status so the UI can
   * gate chat by `chatbot.status === AI_READY`.
   */
  private async getOrCreateChatbot(
    institutionId: string,
    classroomId: string,
    syllabusId: string,
  ): Promise<{ id: string; status: ProcessingStatus }> {
    const syllabus = await this.prisma.syllabusDocument.findFirst({
      where: { id: syllabusId, institutionId },
      select: { status: true },
    });
    const syllabusStatus = syllabus?.status ?? ProcessingStatus.UPLOADED;
    const existing = await this.prisma.aiChatbot.findUnique({
      where: { classroomId },
      select: { id: true, status: true, syllabusId: true },
    });
    if (existing) {
      if (
        existing.syllabusId !== syllabusId ||
        existing.status !== syllabusStatus
      ) {
        const updated = await this.prisma.aiChatbot.update({
          where: { id: existing.id },
          data: { syllabusId, status: syllabusStatus },
          select: { id: true, status: true },
        });
        return updated;
      }
      return { id: existing.id, status: existing.status };
    }
    const created = await this.prisma.aiChatbot.create({
      data: {
        institutionId,
        classroomId,
        syllabusId,
        status: syllabusStatus,
        vectorCollectionId: RagService.buildNamespace(
          institutionId,
          syllabusId,
        ),
        modelName: 'claude-sonnet-4-5',
        enabledForStudents: false,
      },
      select: { id: true, status: true },
    });
    return created;
  }

  /**
   * Loads the most recent HISTORY_WINDOW user/assistant messages for the
   * session, in chronological order (oldest first), so they can be passed
   * straight to Anthropic's `messages` array.
   *
   * System and tool messages are filtered out — Anthropic expects only
   * user/assistant in `messages`; the system prompt is set separately.
   */
  private async loadHistory(
    institutionId: string,
    sessionId: string,
  ): Promise<ChatHistoryMessage[]> {
    const rows = await this.prisma.aiChatMessage.findMany({
      where: {
        institutionId,
        sessionId,
        role: { in: ['user', 'assistant'] },
      },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_WINDOW,
    });
    return rows
      .reverse()
      .map((m): ChatHistoryMessage => {
        const role = m.role === 'assistant' ? 'assistant' : 'user';
        return { role, content: m.content };
      });
  }

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
   * Atomically persists the assistant message and writes the AiUsageLog
   * row. Subscription credit increments are delegated to the @Global
   * SubscriptionsService (Sprint 8.1) and run AFTER the transaction so a
   * partial usage row never blocks the transcript persistence.
   */
  private async persistAssistantResponse(args: {
    institutionId: string;
    sessionId: string;
    classroomId: string;
    actorId: string;
    content: string;
    citations: Citation[];
    safetyStatus: 'passed' | 'flagged';
    usage: { promptTokens: number; completionTokens: number; model: string } | null;
    ragTokens: number;
    ragModel: string;
  }): Promise<void> {
    const tokenCount =
      (args.usage?.promptTokens ?? 0) + (args.usage?.completionTokens ?? 0);
    const chatCostUsd = args.usage
      ? computeChatCostUsd(
          args.usage.model,
          args.usage.promptTokens,
          args.usage.completionTokens,
        )
      : 0;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.aiChatMessage.create({
          data: {
            institutionId: args.institutionId,
            sessionId: args.sessionId,
            role: 'assistant',
            content: args.content,
            citations: args.citations as unknown as Prisma.InputJsonValue,
            safetyStatus: args.safetyStatus,
            tokenCount,
            modelName: args.usage?.model ?? null,
          },
        });

        // Bump the parent session's updatedAt so list ordering reflects the
        // newest reply (orderBy: updatedAt desc).
        await tx.aiChatSession.update({
          where: { id: args.sessionId },
          data: { updatedAt: new Date() },
        });

        // AiUsageLog row — chat_completion.
        if (args.usage) {
          await tx.aiUsageLog.create({
            data: {
              institutionId: args.institutionId,
              userId: args.actorId,
              classroomId: args.classroomId,
              operation: 'chat_completion',
              provider: 'anthropic',
              modelName: args.usage.model,
              promptTokens: args.usage.promptTokens,
              completionTokens: args.usage.completionTokens,
              totalTokens: tokenCount,
              costUsd: chatCostUsd,
              metadata: {
                sessionId: args.sessionId,
                citationCount: args.citations.length,
                safetyStatus: args.safetyStatus,
              },
            },
          });
        }

        // AiUsageLog row — embedding (RAG retrieval).
        if (args.ragTokens > 0) {
          await tx.aiUsageLog.create({
            data: {
              institutionId: args.institutionId,
              userId: args.actorId,
              classroomId: args.classroomId,
              operation: 'embedding',
              provider: 'openai',
              modelName: args.ragModel,
              promptTokens: args.ragTokens,
              completionTokens: 0,
              totalTokens: args.ragTokens,
              costUsd: (args.ragTokens / 1_000_000) * 0.02,
              metadata: {
                sessionId: args.sessionId,
                phase: 'rag_query',
              },
            },
          });
        }

      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to persist assistant response for session ${args.sessionId}: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      // Do NOT rethrow — the SSE stream has already finished from the
      // client's perspective. The transcript will simply be missing the
      // assistant reply, which the UI handles as a transient failure.
    }

    // Sprint 8.1 — increment subscription credits atomically through the
    // shared SubscriptionsService. No-ops when no subscription row exists.
    // Soft-over-the-limit policy: this can push usage past the cap; the
    // NEXT call's `ensureAiCreditsAvailable` will fail closed.
    const totalTokens = tokenCount + args.ragTokens;
    if (totalTokens > 0) {
      try {
        await this.subscriptions.incrementAiCredits(
          args.institutionId,
          totalTokens,
        );
      } catch (incErr) {
        this.logger.warn(
          `incrementAiCredits failed for institution ${args.institutionId}: ` +
            (incErr instanceof Error ? incErr.message : String(incErr)),
        );
      }
    }

    // Sprint 6 — see whether usage just crossed 80%. Idempotent within a
    // calendar month, safe to call on every chat completion.
    await this.notifications.maybeNotifyCreditsLow(args.institutionId);
  }

  private async writeAuditLog(
    actor: User,
    action: string,
    sessionId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          institutionId: actor.institutionId,
          actorId: actor.id,
          action,
          entityType: 'AiChatSession',
          entityId: sessionId,
          metadata: metadata as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Audit log write failed (${action}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /* ------------------------------------------------------------------------ */
  /* View projections                                                          */
  /* ------------------------------------------------------------------------ */

  private toSessionView(
    session: AiChatSession,
    messagesCount: number,
  ): ChatSessionView {
    return {
      id: session.id,
      title: session.title,
      classroomId: session.classroomId ?? '',
      chatbotId: session.chatbotId,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messagesCount,
    };
  }

  private toMessageView(m: {
    id: string;
    sessionId: string;
    role: string;
    content: string;
    citations: Prisma.JsonValue;
    safetyStatus: string | null;
    tokenCount: number | null;
    modelName: string | null;
    createdAt: Date;
  }): ChatMessageView {
    return {
      id: m.id,
      sessionId: m.sessionId,
      role: m.role,
      content: m.content,
      citations: Array.isArray(m.citations)
        ? (m.citations as unknown as Citation[])
        : [],
      safetyStatus: m.safetyStatus,
      tokenCount: m.tokenCount,
      modelName: m.modelName,
      createdAt: m.createdAt,
    };
  }
}
