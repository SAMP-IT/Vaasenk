import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole, type User } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  EditQuestionPaperDto,
  GenerateQuestionPaperDto,
  RegenerateQuestionDto,
} from './question-papers.dto';
import { QuestionPapersService } from './question-papers.service';

/**
 * Question Papers controller — Sprint 5 PROMPT 20.
 *
 * URL surface (CLAUDE.md §7):
 *   POST   /classrooms/:id/question-papers/generate        — create generation job
 *   GET    /question-papers/jobs/:id                       — poll job status
 *   PATCH  /question-papers/:id                            — edit paper
 *   POST   /question-papers/:id/regenerate-question        — regenerate one question
 *   POST   /question-papers/:id/export                     — render + upload PDF
 *   POST   /question-papers/:id/publish                    — publish to classroom
 *
 * The "create" handler lives on a separate controller so it can be nested
 * under `/classrooms/:id/question-papers` while everything else stays on
 * `/question-papers/...`. Both forward to the same QuestionPapersService.
 */

@ApiTags('question-papers')
@Controller('classrooms')
export class ClassroomQuestionPapersController {
  constructor(private readonly papers: QuestionPapersService) {}

  /* ------------------------------------------------------------------------ */
  /* POST /classrooms/:id/question-papers/generate                            */
  /* ------------------------------------------------------------------------ */

  @Post(':id/question-papers/generate')
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Create a generation job for a question paper',
    description:
      'Enqueues a BullMQ generate job. The classroom\'s mapped syllabus must ' +
      'be AI_READY. Returns the job row in RUNNING state — clients poll ' +
      'GET /question-papers/jobs/:id for progress.',
  })
  generate(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) classroomId: string,
    @Body() dto: GenerateQuestionPaperDto,
  ) {
    return this.papers.createJob(user, classroomId, dto);
  }
}

@ApiTags('question-papers')
@Controller('question-papers')
export class QuestionPapersController {
  constructor(private readonly papers: QuestionPapersService) {}

  /* ------------------------------------------------------------------------ */
  /* GET /question-papers/jobs/:id                                            */
  /* ------------------------------------------------------------------------ */

  @Get('jobs/:id')
  @Roles(
    UserRole.STUDENT,
    UserRole.TEACHER,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  )
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Fetch a paper generation job — status, progress, and result',
    description:
      'Polled by the frontend every ~2s while RUNNING. When COMPLETED, the ' +
      '`paper` field is populated with a summary of the generated paper.',
  })
  getJob(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.papers.getJob(user, id);
  }

  /* ------------------------------------------------------------------------ */
  /* PATCH /question-papers/:id                                               */
  /* ------------------------------------------------------------------------ */

  @Patch(':id')
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Edit a generated paper (title, duration, structured content)',
    description:
      'Stale PDF URLs are cleared when `structuredContent` is replaced. ' +
      '412 if the paper is already PUBLISHED.',
  })
  edit(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: EditQuestionPaperDto,
  ) {
    return this.papers.editPaper(user, id, dto);
  }

  /* ------------------------------------------------------------------------ */
  /* POST /question-papers/:id/regenerate-question                            */
  /* ------------------------------------------------------------------------ */

  @Post(':id/regenerate-question')
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Regenerate a single question in the paper',
    description:
      'Replaces sections[sectionIndex].questions[questionIndex] with a fresh ' +
      'question of the SAME type and marks. Stale PDF URLs are cleared.',
  })
  regenerateQuestion(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RegenerateQuestionDto,
  ) {
    return this.papers.regenerateQuestion(user, id, dto);
  }

  /* ------------------------------------------------------------------------ */
  /* POST /question-papers/:id/export                                         */
  /* ------------------------------------------------------------------------ */

  @Post(':id/export')
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Render the paper (and answer key, if applicable) as PDF(s)',
    description:
      'Idempotent — if a freshly-exported PDF already exists for this paper, ' +
      'the existing signed URL is returned instead of re-rendering.',
  })
  export(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.papers.exportPdf(user, id);
  }

  /* ------------------------------------------------------------------------ */
  /* POST /question-papers/:id/publish                                        */
  /* ------------------------------------------------------------------------ */

  @Post(':id/publish')
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Publish the paper to the classroom (fans out student notifications)',
    description:
      'Requires a previously-exported PDF (412 otherwise). Idempotent — ' +
      'publishing an already-published paper is a no-op.',
  })
  publish(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.papers.publish(user, id);
  }
}
