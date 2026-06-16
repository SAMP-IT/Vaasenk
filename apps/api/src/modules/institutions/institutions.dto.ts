import { SubscriptionPlan } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * Institutions DTOs — every property carries a class-validator decorator
 * and free text strings are bounded by @MaxLength (DoS defense, CLAUDE.md §5).
 *
 * Setup DTOs use nested validation via @Type so class-transformer hydrates
 * the inner classes for class-validator to walk.
 */

export class CreateInstitutionDto {
  @IsString() @MinLength(2) @MaxLength(160)
  name!: string;

  @IsString() @MinLength(2) @MaxLength(40)
  type!: string;

  @IsOptional() @IsString() @MaxLength(60)
  boardType?: string;

  @IsOptional() @IsString() @MaxLength(500)
  address?: string;

  @IsOptional() @IsString() @MaxLength(120)
  contactPerson?: string;

  @IsOptional() @IsEmail() @MaxLength(254)
  contactEmail?: string;

  @IsOptional() @IsString() @MaxLength(40)
  contactPhone?: string;

  @IsOptional() @IsString() @MaxLength(2048)
  websiteUrl?: string;

  @IsOptional() @IsString() @MaxLength(2048)
  logoUrl?: string;

  @IsOptional() @IsString() @MaxLength(20)
  locale?: string;

  @IsOptional() @IsString() @MaxLength(60)
  timezone?: string;

  @IsOptional() @IsEnum(SubscriptionPlan)
  subscriptionPlan?: SubscriptionPlan;
}

export class UpdateInstitutionDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160)
  name?: string;

  @IsOptional() @IsString() @MinLength(2) @MaxLength(40)
  type?: string;

  @IsOptional() @IsString() @MaxLength(60)
  boardType?: string;

  @IsOptional() @IsString() @MaxLength(500)
  address?: string;

  @IsOptional() @IsString() @MaxLength(120)
  contactPerson?: string;

  @IsOptional() @IsEmail() @MaxLength(254)
  contactEmail?: string;

  @IsOptional() @IsString() @MaxLength(40)
  contactPhone?: string;

  @IsOptional() @IsString() @MaxLength(2048)
  websiteUrl?: string;

  @IsOptional() @IsString() @MaxLength(2048)
  logoUrl?: string;

  @IsOptional() @IsString() @MaxLength(20)
  locale?: string;

  @IsOptional() @IsString() @MaxLength(60)
  timezone?: string;
}

// ---------------------------------------------------------------------------
// Step-based setup (POST /institutions/:id/setup)
// ---------------------------------------------------------------------------

export class SetupAcademicYearInput {
  @IsString() @MinLength(2) @MaxLength(40)
  name!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class SetupSectionInput {
  @IsString() @MinLength(1) @MaxLength(20)
  name!: string;
}

export class SetupClassInput {
  @IsString() @MinLength(2) @MaxLength(60)
  name!: string;

  @IsOptional() @IsString() @MaxLength(60)
  boardType?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20)
  gradeLevel?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SetupSectionInput)
  sections!: SetupSectionInput[];
}

export class SetupSubjectInput {
  @IsString() @MinLength(2) @MaxLength(60)
  name!: string;

  @IsOptional() @IsString() @MaxLength(10)
  code?: string;
}

export class SetupInstitutionDto {
  @ValidateNested()
  @Type(() => SetupAcademicYearInput)
  academicYear!: SetupAcademicYearInput;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SetupClassInput)
  classes!: SetupClassInput[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SetupSubjectInput)
  subjects!: SetupSubjectInput[];
}
