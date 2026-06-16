import { UserRole } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Auth DTOs (CLAUDE.md §5: validation via class-validator on every endpoint).
 *
 * All string lengths bounded to defend against client-side abuse — long
 * payloads are an inexpensive DoS vector via Supabase Auth's per-request
 * rate limits.
 */

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  /**
   * Required for ADMIN / TEACHER / STUDENT roles. Optional only when the
   * caller is a SUPER_ADMIN provisioning a new institution out-of-band.
   */
  @IsOptional()
  @IsUUID()
  institutionId?: string;
}

export class AcceptInviteDto {
  @IsString()
  @MinLength(8)
  @MaxLength(256)
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
