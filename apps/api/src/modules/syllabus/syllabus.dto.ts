import { ProcessingStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
 * Syllabus DTOs — Sprint 3 PROMPT 15. See CLAUDE.md §5 (class-validator on
 * every property, `@MaxLength` on free text) and vaasenk-api skill §4.
 *
 * Multi-tenant scoping is enforced at the service layer; DTOs never accept
 * `institutionId` — it's always derived from the JWT (CLAUDE.md §3 rule 4).
 *
 * Multipart form bodies coerce booleans/integers as strings. `@Type(() =>
 * Number)` and the `BOOL_TRANSFORM` cover both JSON and multipart inputs.
 */

const BOOL_TRANSFORM = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === '1') return true;
    if (v === 'false' || v === '0') return false;
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// POST /syllabus — upload PDF (multipart)
// ---------------------------------------------------------------------------

export class UploadSyllabusDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  /** Free-text for now — e.g., "samacheer_kalvi", "cbse", "icse". */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  boardType?: string;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  language?: string;

  /** Defaults to "v1" if absent (handled in the service). */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  version?: string;
}

// ---------------------------------------------------------------------------
// GET /syllabus — list with filters
// ---------------------------------------------------------------------------

export type SyllabusSort = 'createdAt:desc' | 'createdAt:asc' | 'name:asc';

const SYLLABUS_SORT_VALUES: readonly SyllabusSort[] = [
  'createdAt:desc',
  'createdAt:asc',
  'name:asc',
];

export class ListSyllabusDto {
  @IsOptional()
  @IsEnum(ProcessingStatus)
  status?: ProcessingStatus;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  boardType?: string;

  /**
   * `true` → only active versions, `false` → only archived, absent → both.
   * Multipart sends booleans as strings; transform first so `@IsBoolean`
   * accepts them.
   */
  @IsOptional()
  @Transform(BOOL_TRANSFORM)
  @IsBoolean()
  isActive?: boolean;

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
  @IsIn(SYLLABUS_SORT_VALUES)
  sort?: SyllabusSort = 'createdAt:desc';
}

// ---------------------------------------------------------------------------
// PATCH /syllabus/:id — metadata-only OR file replacement
// ---------------------------------------------------------------------------

/**
 * Dual-shape endpoint:
 *   • If `file` is absent → metadata update (PATCHes the existing row).
 *   • If `file` is present → file replacement: creates a NEW row, marks the
 *     old `isActive: false`. The new row inherits unspecified metadata.
 *
 * All fields are optional. The controller branches on `file !== undefined`.
 */
export class UpdateSyllabusDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  boardType?: string;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  version?: string;

  /**
   * Toggles the "live" version flag. Note: the file-replacement path
   * sets the OLD row's `isActive` to false automatically — callers should
   * only set this on metadata-only updates.
   */
  @IsOptional()
  @Transform(BOOL_TRANSFORM)
  @IsBoolean()
  isActive?: boolean;
}

// ---------------------------------------------------------------------------
// POST /syllabus/:id/map — map syllabus to one or more classrooms
// ---------------------------------------------------------------------------

export class MapSyllabusDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  classroomIds!: string[];
}

// ---------------------------------------------------------------------------
// GET /syllabus/:id/classrooms — list mapped classrooms (pagination only)
// ---------------------------------------------------------------------------

export class ListMappedClassroomsDto {
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
}
