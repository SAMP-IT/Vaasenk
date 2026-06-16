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
  CreateStudentDto,
  InviteTeacherDto,
  ListUsersDto,
  RegisterDeviceDto,
  UpdateUserStatusDto,
} from './users.dto';
import { UsersService } from './users.service';

/**
 * Admin user management — institution-scoped at the service layer via
 * `actor.institutionId` (NEVER trusted from path/body — CLAUDE.md §3).
 */
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // -------------------------------------------------------------------------
  // POST /users/me/devices  — Sprint 7.4 mobile push registration
  //
  // Declared first so the literal `me` segment is matched before any future
  // `:id`-prefixed route on this controller. Any authenticated role may
  // call — devices are per-user (CLAUDE.md §3: institutionId is derived
  // from the JWT, never trusted from path/body).
  // -------------------------------------------------------------------------

  @Post('me/devices')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary:
      'Register (or re-register) a mobile device for push notifications. Idempotent — same expoPushToken upserts.',
    description:
      'The Expo push token is globally unique. If the token already exists for a different user (e.g. user A signed out, user B signed in on the same device), ownership is transferred to the current actor. Returns the device row.',
  })
  registerDevice(
    @CurrentUser() user: User,
    @Body() dto: RegisterDeviceDto,
  ) {
    return this.users.registerDevice(user, dto);
  }

  @Delete('me/devices/:deviceId')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Unregister a mobile device for the current user',
    description:
      'Returns 404 (not 403) when the device does not belong to the actor — we deliberately avoid leaking the existence of foreign devices.',
  })
  deleteDevice(
    @CurrentUser() user: User,
    @Param('deviceId', new ParseUUIDPipe()) deviceId: string,
  ) {
    return this.users.deleteDevice(user, deviceId);
  }

  // -------------------------------------------------------------------------
  // POST /users/teachers — invite a teacher
  // -------------------------------------------------------------------------

  @Post('teachers')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Invite a teacher by email — creates a pending invite (not a user)',
    description:
      'The teacher account is materialized only when they accept the invite via /auth/invite/accept. ' +
      'The `name` from the request is captured on the invite metadata for the accept flow.',
  })
  inviteTeacher(@CurrentUser() user: User, @Body() dto: InviteTeacherDto) {
    return this.users.inviteTeacher(user, dto);
  }

  // -------------------------------------------------------------------------
  // POST /users/students — admin creates a student directly
  // -------------------------------------------------------------------------

  @Post('students')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Create a student profile directly (no invite required)',
    description:
      'Creates a User row (role=STUDENT) + Student profile in a single transaction. ' +
      'Students are admin-provisioned and may not have email — admissionNo is the canonical identifier within the institution.',
  })
  createStudent(@CurrentUser() user: User, @Body() dto: CreateStudentDto) {
    return this.users.createStudent(user, dto);
  }

  // -------------------------------------------------------------------------
  // POST /users/students/import — bulk CSV import
  // -------------------------------------------------------------------------

  @Post('students/import')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('supabase-jwt')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiOperation({
    summary: 'Bulk-import students from a CSV file',
    description:
      'Expected columns (case-insensitive): name, admissionNo, email?, phone?, className, sectionName?, ' +
      'rollNo?, dateOfBirth?, parentName?, parentPhone?. Returns per-row errors; failed rows do not block successful ones. ' +
      'Hard cap of 1000 rows per upload.',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    }),
  )
  importStudents(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.users.importStudentsCsv(user, file);
  }

  // -------------------------------------------------------------------------
  // GET /users — paginated list with filters + search
  // -------------------------------------------------------------------------

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'List users in the institution with filters, search, and pagination',
  })
  list(@CurrentUser() user: User, @Query() query: ListUsersDto) {
    return this.users.list(user, query);
  }

  // -------------------------------------------------------------------------
  // PATCH /users/:id/status — activate / deactivate
  // -------------------------------------------------------------------------

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({ summary: 'Activate or deactivate a user' })
  updateStatus(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.users.updateStatus(user, id, dto);
  }

  // -------------------------------------------------------------------------
  // DELETE /users/:id — soft delete
  // -------------------------------------------------------------------------

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({ summary: 'Soft-delete a user (sets deletedAt; preserves audit trail)' })
  async delete(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.users.softDelete(user, id);
  }
}
