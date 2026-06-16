import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole, type User } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CreateClassroomDto,
  JoinClassroomDto,
  ListClassroomsDto,
  ListMembersDto,
  RefreshCodeDto,
} from './classrooms.dto';
import { ClassroomsService } from './classrooms.service';

/**
 * Classrooms — Sprint 2 PROMPT 10.
 *
 * Multi-tenant scoping is performed in the service layer via
 * `actor.institutionId` (NEVER trusted from path/body — CLAUDE.md §3).
 *
 * Visibility rules (see ClassroomsService.buildVisibilityWhere):
 *   ADMIN / SUPER_ADMIN — every classroom in the institution
 *   TEACHER            — classrooms where they are assigned OR a member
 *   STUDENT            — classrooms where they are an ACTIVE member
 */
@ApiTags('classrooms')
@Controller('classrooms')
export class ClassroomsController {
  constructor(private readonly classrooms: ClassroomsService) {}

  // -------------------------------------------------------------------------
  // POST /classrooms — create
  // -------------------------------------------------------------------------

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Create a classroom (admin) and allocate a 6-character invite code',
    description:
      'If `academicYearId` is omitted, the institution\'s currently-active year is used. ' +
      'If `name` is omitted, it is derived from class + section + subject.',
  })
  create(@CurrentUser() user: User, @Body() dto: CreateClassroomDto) {
    return this.classrooms.create(user, dto);
  }

  // -------------------------------------------------------------------------
  // POST /classrooms/join — student joins via invite code (BEFORE /:id routes)
  // -------------------------------------------------------------------------

  /**
   * Mounted at `/classrooms/join` (no `:id`) — see classrooms.dto.ts for the
   * rationale. NestJS routes match in declaration order; this MUST be declared
   * before the `:id` group so `join` is never interpreted as a UUID.
   */
  @Post('join')
  @Roles(UserRole.STUDENT)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Student joins a classroom using its invite code',
    description:
      'Idempotent: re-submitting the same code returns the classroom view ' +
      'without erroring. Reactivates a previously-INACTIVE membership.',
  })
  join(@CurrentUser() user: User, @Body() dto: JoinClassroomDto) {
    return this.classrooms.joinByInviteCode(user, dto);
  }

  // -------------------------------------------------------------------------
  // GET /classrooms — list (role-filtered)
  // -------------------------------------------------------------------------

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'List classrooms visible to the current user (paginated)',
  })
  list(@CurrentUser() user: User, @Query() query: ListClassroomsDto) {
    return this.classrooms.list(user, query);
  }

  // -------------------------------------------------------------------------
  // GET /classrooms/:id — detail
  // -------------------------------------------------------------------------

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({ summary: 'Get classroom detail (404 if not visible to caller)' })
  detail(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.classrooms.detail(user, id);
  }

  // -------------------------------------------------------------------------
  // POST /classrooms/:id/refresh-code — regenerate invite
  // -------------------------------------------------------------------------

  @Post(':id/refresh-code')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary:
      'Regenerate the invite code (admins and the assigned teacher). Optionally set an expiry in days.',
  })
  refreshCode(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RefreshCodeDto,
  ) {
    return this.classrooms.refreshCode(user, id, dto);
  }

  // -------------------------------------------------------------------------
  // GET /classrooms/:id/members — list enrolled members
  // -------------------------------------------------------------------------

  @Get(':id/members')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({ summary: 'List enrolled members (paginated, role-filterable)' })
  members(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ListMembersDto,
  ) {
    return this.classrooms.listMembers(user, id, query);
  }
}
