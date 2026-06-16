/**
 * Question Papers DTOs — Sprint 5 PROMPT 20.
 *
 * See CLAUDE.md §5 (class-validator on every property + `@MaxLength` on free
 * text). Multi-tenant scoping is derived at the service layer from the JWT;
 * DTOs never accept `institutionId`.
 *
 * Naming: input types ending in `Input` are TypeScript shapes used inside the
 * service / worker (so we don't pass class instances around the worker).
 */

import { ExamType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateNested,
  type ValidationArguments,
  type ValidatorConstraintInterface,
  ValidatorConstraint,
} from 'class-validator';

// ---------------------------------------------------------------------------
// Sub-DTO: question type config
// ---------------------------------------------------------------------------

export class QuestionTypeConfigDto {
  /**
   * Free string — MCQ, 2-mark, 5-mark, Short Answer, Long Answer, etc.
   * Capped at 60 chars to keep prompt bloat bounded (CLAUDE.md §5).
   */
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  type!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  count!: number;

  @IsInt()
  @Min(1)
  @Max(50)
  marksEach!: number;
}

export type QuestionTypeConfigInput = {
  type: string;
  count: number;
  marksEach: number;
};

// ---------------------------------------------------------------------------
// Sub-DTO: difficulty split
// ---------------------------------------------------------------------------

@ValidatorConstraint({ name: 'SumsTo100', async: false })
export class SumsTo100Constraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const v = value as { easy?: number; medium?: number; hard?: number };
    if (
      typeof v.easy !== 'number' ||
      typeof v.medium !== 'number' ||
      typeof v.hard !== 'number'
    ) {
      return false;
    }
    return v.easy + v.medium + v.hard === 100;
  }
  defaultMessage(_args: ValidationArguments): string {
    return 'difficulty.easy + difficulty.medium + difficulty.hard must sum to 100';
  }
}

export class DifficultyDto {
  @IsInt()
  @Min(0)
  @Max(100)
  easy!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  medium!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  hard!: number;
}

// ---------------------------------------------------------------------------
// POST /classrooms/:id/question-papers/generate
// ---------------------------------------------------------------------------

export class GenerateQuestionPaperDto {
  /** Optional override — defaults to the classroom's mapped syllabus. */
  @IsOptional()
  @IsUUID()
  syllabusId?: string;

  /** Chapter / topic names from the syllabus. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(120, { each: true })
  portions!: string[];

  @IsEnum(ExamType)
  examType!: ExamType;

  @IsInt()
  @Min(10)
  @Max(500)
  totalMarks!: number;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(360)
  durationMinutes?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => QuestionTypeConfigDto)
  questionTypes!: QuestionTypeConfigDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => DifficultyDto)
  @Validate(SumsTo100Constraint)
  difficulty?: DifficultyDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID('4', { each: true })
  samplePaperIds?: string[];

  @IsBoolean()
  includeAnswerKey!: boolean;
}

/**
 * Service-layer shape (no class metadata). The DTO is JSON-serialized as the
 * `inputConfig` column on QuestionPaperJob; the worker reads this back out
 * as a plain object, so we type it explicitly to avoid `any`.
 */
export type GenerateQuestionPaperInput = {
  syllabusId?: string;
  portions: string[];
  examType: ExamType;
  totalMarks: number;
  durationMinutes?: number;
  questionTypes: QuestionTypeConfigInput[];
  difficulty?: { easy: number; medium: number; hard: number };
  samplePaperIds?: string[];
  includeAnswerKey: boolean;
};

// ---------------------------------------------------------------------------
// PATCH /question-papers/:id
// ---------------------------------------------------------------------------

class StructuredQuestionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  type!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text!: string;

  @IsInt()
  @Min(1)
  @Max(50)
  marks!: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  options?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  answer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  difficulty?: string;
}

class StructuredSectionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  instructions?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => StructuredQuestionDto)
  questions!: StructuredQuestionDto[];
}

export class StructuredContentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(2000)
  instructions!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => StructuredSectionDto)
  sections!: StructuredSectionDto[];
}

export class EditQuestionPaperDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(360)
  durationMinutes?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => StructuredContentDto)
  structuredContent?: StructuredContentDto;
}

// ---------------------------------------------------------------------------
// POST /question-papers/:id/regenerate-question
// ---------------------------------------------------------------------------

export class RegenerateQuestionDto {
  @IsInt()
  @Min(0)
  sectionIndex!: number;

  @IsInt()
  @Min(0)
  questionIndex!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  hint?: string;
}
