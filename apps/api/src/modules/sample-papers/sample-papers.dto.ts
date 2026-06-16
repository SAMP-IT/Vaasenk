import { ExamType, ProcessingStatus } from '@prisma/client';
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
 * Sample question papers DTOs — Sprint 3 PROMPT 15.
 *
 * Conceptually parallel to SyllabusDocument:
 *   • Same multi-tenant scoping rules (institutionId derived from JWT).
 *   • Same dual-shape PATCH (metadata-only or file replacement).
 *   • Different domain fields: ExamType, year, term, priority.
 *
 * No `isActive` column on this entity — soft-delete uses
 * `status = ARCHIVED` (the existing ProcessingStatus enum has no ARCHIVED;
 * we represent archival via the status flow described in the service).
 */

const PRIORITY_VALUES = ['high', 'normal', 'archive'] as const;
type SamplePaperPriority = (typeof PRIORITY_VALUES)[number];

// ---------------------------------------------------------------------------
// POST /sample-papers — upload (multipart)
// ---------------------------------------------------------------------------

export class UploadSamplePaperDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsEnum(ExamType)
  examType!: ExamType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  term?: string;

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
  @IsUUID()
  syllabusId?: string;

  @IsOptional()
  @IsIn(PRIORITY_VALUES)
  priority?: SamplePaperPriority;
}

// ---------------------------------------------------------------------------
// GET /sample-papers — list with filters
// ---------------------------------------------------------------------------

export type SamplePaperSort = 'createdAt:desc' | 'createdAt:asc' | 'year:desc';

const SAMPLE_PAPER_SORT_VALUES: readonly SamplePaperSort[] = [
  'createdAt:desc',
  'createdAt:asc',
  'year:desc',
];

export class ListSamplePapersDto {
  @IsOptional()
  @IsEnum(ExamType)
  examType?: ExamType;

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
  @IsUUID()
  syllabusId?: string;

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
  @IsIn(SAMPLE_PAPER_SORT_VALUES)
  sort?: SamplePaperSort = 'createdAt:desc';
}

// ---------------------------------------------------------------------------
// PATCH /sample-papers/:id — metadata-only OR file replacement
// ---------------------------------------------------------------------------

export class UpdateSamplePaperDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsEnum(ExamType)
  examType?: ExamType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  term?: string;

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
  @IsUUID()
  syllabusId?: string;

  @IsOptional()
  @IsIn(PRIORITY_VALUES)
  priority?: SamplePaperPriority;
}
