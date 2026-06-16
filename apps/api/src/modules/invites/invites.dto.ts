import { UserRole } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Invites DTOs — see CLAUDE.md §5 (class-validator on every property,
 * @MaxLength on free text as DoS defense).
 *
 * The unique constraint @@unique([institutionId, email]) at the schema
 * level guards against duplicates within a tenant; the service layer
 * adds finer-grained checks (existing user, expired invite, etc).
 */

export class CreateInviteDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  /** Only ADMIN | TEACHER | STUDENT are invitable. SUPER_ADMIN is provisioned out-of-band. */
  @IsEnum(UserRole)
  role!: UserRole;

  /** Optional time-to-live in days. Defaults to 7 in the service. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  expiresInDays?: number;
}

export class ListInvitesDto {
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

  /** Filter by status: "pending" | "accepted" | "revoked" | "expired" | "all" (default pending). */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: 'pending' | 'accepted' | 'revoked' | 'expired' | 'all';
}
