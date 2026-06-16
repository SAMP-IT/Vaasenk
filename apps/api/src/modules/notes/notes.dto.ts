import { NoteStatus, NoteTag } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Notes DTOs — Sprint 2 PROMPT 11. See CLAUDE.md §5 (class-validator on
 * every property, `@MaxLength` on free text). Multi-tenant scoping is
 * enforced at the service layer; DTOs never accept `institutionId`.
 *
 * NoteStatus / NoteTag enums come from `@prisma/client` so the DTO and the
 * database stay in lockstep — adding a new tag to the schema flows here
 * automatically.
 */

/**
 * Multipart form-data sends `tags` as either a comma-separated string
 * ("IMPORTANT,HOMEWORK") or repeated fields. Normalize both to a NoteTag[]
 * before validation runs.
 */
const TAG_TRANSFORM = ({ value }: { value: unknown }): NoteTag[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v))
      .filter((v) => typeof v === 'string' && v.length > 0) as NoteTag[];
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0) as NoteTag[];
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// POST /classrooms/:id/notes — upload a note (multipart)
// ---------------------------------------------------------------------------

export class UploadNoteDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** Server caps at 6 tags per note. Sent as comma-separated form-data. */
  @IsOptional()
  @Transform(TAG_TRANSFORM)
  @IsArray()
  @ArrayMaxSize(6)
  @IsEnum(NoteTag, { each: true })
  tags?: NoteTag[];

  /**
   * Only DRAFT | PUBLISHED is settable here. ARCHIVED is reached via
   * DELETE /notes/:id (soft delete).
   */
  @IsOptional()
  @IsEnum(NoteStatus)
  @IsIn([NoteStatus.DRAFT, NoteStatus.PUBLISHED])
  status?: NoteStatus;
}

// ---------------------------------------------------------------------------
// GET /classrooms/:id/notes — list
// ---------------------------------------------------------------------------

export type NoteSort =
  | 'publishedAt:desc'
  | 'publishedAt:asc'
  | 'createdAt:desc';

const NOTE_SORT_VALUES: readonly NoteSort[] = [
  'publishedAt:desc',
  'publishedAt:asc',
  'createdAt:desc',
];

export class ListNotesDto {
  @IsOptional()
  @IsEnum(NoteTag)
  tag?: NoteTag;

  @IsOptional()
  @IsEnum(NoteStatus)
  status?: NoteStatus;

  @IsOptional()
  @IsString()
  @MaxLength(200)
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
  @IsIn(NOTE_SORT_VALUES)
  sort?: NoteSort = 'publishedAt:desc';
}

// ---------------------------------------------------------------------------
// PATCH /notes/:id — update
// ---------------------------------------------------------------------------

export class UpdateNoteDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsEnum(NoteTag, { each: true })
  tags?: NoteTag[];

  @IsOptional()
  @IsEnum(NoteStatus)
  status?: NoteStatus;
}

// ---------------------------------------------------------------------------
// GET /bookmarks — list current user's bookmarks
// ---------------------------------------------------------------------------

export class ListBookmarksDto {
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
