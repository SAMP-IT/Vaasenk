import { Status } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Classrooms DTOs — see CLAUDE.md §5 (class-validator on every property,
 * `@MaxLength` on free text as DoS defense) and vaasenk-api skill §4.
 *
 * Sprint 2 — PROMPT 10. Multi-tenant scoping is enforced at the service
 * layer; DTOs never accept `institutionId` (CLAUDE.md §3 rule 4 —
 * derived-from-token only).
 */

// ---------------------------------------------------------------------------
// POST /classrooms — create
// ---------------------------------------------------------------------------

export class CreateClassroomDto {
  /**
   * Optional display name. If omitted, the service derives one from
   * class + section + subject (e.g. "Grade 10 · Section A · Mathematics").
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsUUID()
  classId!: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsUUID()
  subjectId!: string;

  /** Must reference a TEACHER role user in the same institution. */
  @IsUUID()
  teacherId!: string;

  /** Defaults to the institution's active academic year if omitted. */
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  syllabusId?: string;
}

// ---------------------------------------------------------------------------
// GET /classrooms — list
// ---------------------------------------------------------------------------

export class ListClassroomsDto {
  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsUUID()
  academicYearId?: string;
}

// ---------------------------------------------------------------------------
// POST /classrooms/join — student joins via invite code
// ---------------------------------------------------------------------------

/**
 * Decision: the join endpoint is mounted at `/classrooms/join` (no `:id`)
 * rather than `/classrooms/:id/join`. Rationale: students discover a
 * classroom BY its invite code — they don't know the UUID until after they
 * join. Putting the UUID in the URL would force the frontend to do a
 * pre-flight lookup first. This is a defensible deviation from the
 * Playbook prompt phrasing.
 */
export class JoinClassroomDto {
  @IsString()
  @MinLength(6)
  @MaxLength(40)
  inviteCode!: string;
}

// ---------------------------------------------------------------------------
// POST /classrooms/:id/refresh-code — regenerate invite
// ---------------------------------------------------------------------------

export class RefreshCodeDto {
  /**
   * If supplied, the new code expires `expiresInDays` from now. If omitted
   * the code never expires (`inviteExpiresAt = null`).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  expiresInDays?: number;
}

// ---------------------------------------------------------------------------
// GET /classrooms/:id/members — list members
// ---------------------------------------------------------------------------

export type ClassroomMemberRoleFilter = 'STUDENT' | 'TEACHER';

const MEMBER_ROLE_VALUES: readonly ClassroomMemberRoleFilter[] = [
  'STUDENT',
  'TEACHER',
];

export class ListMembersDto {
  @IsOptional()
  @IsIn(MEMBER_ROLE_VALUES)
  role?: ClassroomMemberRoleFilter;

  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}
