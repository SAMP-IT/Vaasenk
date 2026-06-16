import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole, type User } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CreateChatSessionDto,
  ListChatSessionsDto,
  SendChatMessageDto,
} from './ai-chat.dto';
import { AiChatService } from './ai-chat.service';

/**
 * AI Chat — Sprint 4 PROMPT 18.
 *
 * URL surface (Playbook §7 naming conventions):
 *   POST   /classrooms/:id/ai/sessions                       create a new session
 *   GET    /classrooms/:id/ai/sessions                       list sessions
 *   GET    /classrooms/:id/ai/sessions/:sessionId            get messages
 *   POST   /classrooms/:id/ai/sessions/:sessionId/chat       send message + stream SSE
 *
 * RBAC: TEACHER + ADMIN + SUPER_ADMIN. Students are explicitly rejected by
 * the service layer (404 / 403). Sprint 5+ enables a separate
 * student-doubt endpoint with stricter limits.
 *
 * Streaming design — we use POST + manual SSE write (not @Sse()) because:
 *   1. The user's prompt is in the body — @Sse() is GET-only on the Express
 *      adapter.
 *   2. Manual writes give us precise control over `event:`/`data:` framing
 *      and the lifecycle (we close the connection cleanly via res.end()).
 *   3. The frontend uses fetch() + ReadableStream() to consume SSE over
 *      POST — well-supported by Next.js 15 / React 19.
 *
 * The streaming endpoint bypasses the global ResponseInterceptor (we set the
 * status code + headers ourselves and never return a value from the handler).
 */
@ApiTags('ai-chat')
@Controller('classrooms')
export class AiChatController {
  private readonly logger = new Logger(AiChatController.name);

  constructor(private readonly aiChat: AiChatService) {}

  /* ------------------------------------------------------------------------ */
  /* POST /classrooms/:id/ai/sessions                                          */
  /* ------------------------------------------------------------------------ */

  @Post(':id/ai/sessions')
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Create a new AI chat session for this classroom',
    description:
      'Lazily creates the per-classroom AiChatbot row on first session. ' +
      'Returns 412 if the mapped syllabus is not AI_READY.',
  })
  createSession(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) classroomId: string,
    @Body() dto: CreateChatSessionDto,
  ) {
    return this.aiChat.createSession(user, classroomId, dto);
  }

  /* ------------------------------------------------------------------------ */
  /* GET /classrooms/:id/ai/sessions                                           */
  /* ------------------------------------------------------------------------ */

  @Get(':id/ai/sessions')
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'List AI chat sessions visible to the current user (paginated)',
    description:
      'TEACHER: only their own sessions. ADMIN / SUPER_ADMIN: every session in the classroom.',
  })
  listSessions(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) classroomId: string,
    @Query() query: ListChatSessionsDto,
  ) {
    return this.aiChat.listSessions(user, classroomId, query);
  }

  /* ------------------------------------------------------------------------ */
  /* GET /classrooms/:id/ai/sessions/:sessionId                                */
  /* ------------------------------------------------------------------------ */

  @Get(':id/ai/sessions/:sessionId')
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Get a chat session with its messages (latest 100, chronological)',
  })
  getSession(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) classroomId: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ) {
    return this.aiChat.getSessionWithMessages(user, classroomId, sessionId);
  }

  /* ------------------------------------------------------------------------ */
  /* POST /classrooms/:id/ai/sessions/:sessionId/chat                          */
  /* ------------------------------------------------------------------------ */

  @Post(':id/ai/sessions/:sessionId/chat')
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Send a message and stream the assistant response over SSE',
    description:
      'Returns text/event-stream with events: token (incremental text), ' +
      'usage (final totals + citations), and error (provider failures). ' +
      'On HTTP-level errors (412, 402, 404, 403, 401) the response is a ' +
      'normal JSON error envelope — the stream never opens.',
  })
  async chat(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) classroomId: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() dto: SendChatMessageDto,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    // We need to invoke the service ONCE — pre-flight checks (auth, status,
    // credits) may throw before the stream opens. Pre-await one event so we
    // surface those as normal HTTP errors, then write SSE headers + the rest.
    let iterator: AsyncIterator<
      Awaited<
        ReturnType<typeof this.aiChat.streamChat> extends AsyncGenerator<
          infer E
        >
          ? E
          : never
      >
    >;
    try {
      iterator = this.aiChat.streamChat(user, classroomId, sessionId, dto)[
        Symbol.asyncIterator
      ]();
    } catch (err) {
      // Sync errors from generator setup are rare; fall back to a thrown
      // HttpException so the global filter wraps it normally.
      if (err instanceof HttpException) throw err;
      throw err;
    }

    // Peek the first event so pre-stream errors materialize as HttpException.
    let firstEvent: IteratorResult<unknown>;
    try {
      firstEvent = await iterator.next();
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw err;
    }

    // From here on we're committed to an SSE response.
    res.status(HttpStatus.OK);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable Nginx buffering
    res.flushHeaders();

    const writeEvent = (event: { type: string } & Record<string, unknown>) => {
      const payload = JSON.stringify(event);
      res.write(`event: ${event.type}\ndata: ${payload}\n\n`);
    };

    try {
      if (!firstEvent.done && firstEvent.value) {
        writeEvent(firstEvent.value as { type: string } & Record<string, unknown>);
      }
      while (true) {
        const next = await iterator.next();
        if (next.done) break;
        if (next.value) {
          writeEvent(
            next.value as { type: string } & Record<string, unknown>,
          );
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `SSE stream interrupted for session ${sessionId}: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      try {
        writeEvent({
          type: 'error',
          code: 'STREAM_ERROR',
          message: 'Stream interrupted. Please retry.',
        });
      } catch {
        // Headers might already be in a bad state; ignore.
      }
    } finally {
      res.end();
    }
  }
}
