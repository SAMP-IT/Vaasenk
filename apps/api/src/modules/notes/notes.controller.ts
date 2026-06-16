import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole, type User } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  ListBookmarksDto,
  ListNotesDto,
  UpdateNoteDto,
  UploadNoteDto,
} from './notes.dto';
import { NotesService } from './notes.service';

/**
 * Notes — Sprint 2 PROMPT 11.
 *
 * Hosts three URL spaces:
 *   • /classrooms/:id/notes  (POST upload, GET list — nested per CLAUDE.md §7)
 *   • /notes/:id             (GET detail, PATCH update, DELETE soft-delete,
 *                             POST bookmark toggle)
 *   • /bookmarks             (GET current user's bookmarks)
 *
 * Visibility is enforced via ClassroomsService.assertVisible — anyone who
 * can see the parent classroom can read its notes (with the STUDENT-sees-only-
 * PUBLISHED filter applied in the service).
 */

// ---------------------------------------------------------------------------
// Nested controller — /classrooms/:id/notes
// ---------------------------------------------------------------------------

@ApiTags('notes')
@Controller('classrooms/:classroomId/notes')
export class ClassroomNotesController {
  constructor(private readonly notes: NotesService) {}

  @Post()
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('supabase-jwt')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string', minLength: 2, maxLength: 200 },
        description: { type: 'string', maxLength: 2000 },
        tags: {
          type: 'string',
          description:
            'Comma-separated NoteTag values, e.g. "IMPORTANT,HOMEWORK". Max 6.',
        },
        status: {
          type: 'string',
          enum: ['DRAFT', 'PUBLISHED'],
          default: 'DRAFT',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Upload a note file to the classroom (25 MB max; images > 5 MB are compressed)',
    description:
      'Accepts image/jpeg, image/png, image/webp, application/pdf, text/plain. ' +
      'Storage path: {institutionId}/{classroomId}/{noteId}/{filename}. ' +
      'If status=PUBLISHED, fans out NOTE_PUBLISHED notifications to all ACTIVE student members.',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB, per CLAUDE.md §5
    }),
  )
  upload(
    @CurrentUser() user: User,
    @Param('classroomId', new ParseUUIDPipe()) classroomId: string,
    @Body() dto: UploadNoteDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.notes.upload(user, classroomId, dto, file);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'List notes in the classroom (paginated; students see PUBLISHED only)',
  })
  list(
    @CurrentUser() user: User,
    @Param('classroomId', new ParseUUIDPipe()) classroomId: string,
    @Query() query: ListNotesDto,
  ) {
    return this.notes.listInClassroom(user, classroomId, query);
  }
}

// ---------------------------------------------------------------------------
// Flat controller — /notes/:id + /bookmarks
// ---------------------------------------------------------------------------

@ApiTags('notes')
@Controller()
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get('notes/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Get a note detail with a fresh 1h signed URL',
  })
  detail(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.notes.detail(user, id);
  }

  @Patch('notes/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Update note title/description/tags/status (author or admin)',
  })
  update(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.notes.update(user, id, dto);
  }

  @Delete('notes/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Soft-delete a note (status → ARCHIVED; storage retained)',
  })
  async delete(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.notes.softDelete(user, id);
  }

  @Post('notes/:id/bookmark')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Toggle a bookmark on this note for the current user',
  })
  toggleBookmark(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.notes.toggleBookmark(user, id);
  }

  @Get('bookmarks')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'List notes bookmarked by the current user (paginated)',
  })
  bookmarks(
    @CurrentUser() user: User,
    @Query() query: ListBookmarksDto,
  ) {
    return this.notes.listBookmarks(user, query);
  }
}
