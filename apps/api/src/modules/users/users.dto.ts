import { DevicePlatform, Status, UserRole } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Users DTOs — see CLAUDE.md §5 (class-validator on every property,
 * `@MaxLength` on free text as DoS defense) and the vaasenk-api skill §4.
 *
 * The admin-facing surface has two creation paths:
 *   • Teachers are invited by email (defers materialization to the accept flow).
 *   • Students are created directly because they're admin-provisioned and may
 *     not have email addresses (admission_no is the canonical identifier).
 */

// ---------------------------------------------------------------------------
// Teacher invite — POST /users/teachers
// ---------------------------------------------------------------------------

export class InviteTeacherDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  /** Optional time-to-live in days (forwarded to InvitesService default 7). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  expiresInDays?: number;
}

// ---------------------------------------------------------------------------
// Student create — POST /users/students
// ---------------------------------------------------------------------------

export class CreateStudentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  admissionNo!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsUUID()
  classId!: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  rollNo?: string;

  /** ISO `yyyy-mm-dd` accepted; converted to Date in the service. */
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  parentName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  parentPhone?: string;
}

// ---------------------------------------------------------------------------
// User list — GET /users
// ---------------------------------------------------------------------------

export type ListUsersSort =
  | 'createdAt:desc'
  | 'createdAt:asc'
  | 'name:asc'
  | 'name:desc';

const LIST_USERS_SORT_VALUES: readonly ListUsersSort[] = [
  'createdAt:desc',
  'createdAt:asc',
  'name:asc',
  'name:desc',
];

export class ListUsersDto {
  /** Filter by role; unset = all roles. */
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  /** Filter by user.status. Defaults to ACTIVE in the service. */
  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  /** Case-insensitive substring across name, email, phone. */
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
  @IsIn(LIST_USERS_SORT_VALUES)
  sort?: ListUsersSort = 'createdAt:desc';
}

// ---------------------------------------------------------------------------
// User status — PATCH /users/:id/status
// ---------------------------------------------------------------------------

export type ToggleableStatus = Extract<Status, 'ACTIVE' | 'INACTIVE'>;

export class UpdateUserStatusDto {
  /**
   * Only ACTIVE | INACTIVE are toggleable from this endpoint.
   * ARCHIVED is set elsewhere (institution archive) and not user-toggleable.
   */
  @IsEnum(Status)
  @IsIn([Status.ACTIVE, Status.INACTIVE])
  status!: ToggleableStatus;
}

// ---------------------------------------------------------------------------
// Device registration — POST /users/me/devices  (Sprint 7.4)
// ---------------------------------------------------------------------------

/**
 * Wire-level platform string accepted from mobile clients. We lowercase it
 * on receipt; the canonical Prisma enum is uppercase (IOS|ANDROID|WEB).
 *
 * Kept as a separate string union (not the Prisma enum) so the JSON the
 * mobile agent posts matches the frozen contract exactly:
 *
 *   { "platform": "ios" | "android" | "web" }
 */
export type DevicePlatformInput = 'ios' | 'android' | 'web';

const DEVICE_PLATFORM_INPUTS: readonly DevicePlatformInput[] = [
  'ios',
  'android',
  'web',
];

export class RegisterDeviceDto {
  /**
   * Expo-issued push token. Validation is a shape check (the prefix and the
   * bracketed body) — Expo's API will perform the real DeviceNotRegistered /
   * MessageTooBig validation at send time. The shape gate keeps obvious junk
   * (FCM tokens, APNs hex, empty strings) out of the table.
   *
   * Accepted prefixes: `ExponentPushToken[...]` (current) and
   * `ExpoPushToken[...]` (older SDKs that still ship in production).
   */
  @IsString()
  @MaxLength(200)
  @Matches(/^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/, {
    message:
      'expoPushToken must look like "ExponentPushToken[...]" or "ExpoPushToken[...]"',
  })
  expoPushToken!: string;

  @IsString()
  @IsIn(DEVICE_PLATFORM_INPUTS)
  platform!: DevicePlatformInput;

  /** Human-readable label shown in account settings (e.g. "Anil's iPhone 15"). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  osVersion?: string;
}

/**
 * Maps the wire-level platform string to the Prisma enum stored in the row.
 * Centralized so any new platform value only requires one edit here.
 */
export const DEVICE_PLATFORM_INPUT_TO_ENUM: Record<
  DevicePlatformInput,
  DevicePlatform
> = {
  ios: DevicePlatform.IOS,
  android: DevicePlatform.ANDROID,
  web: DevicePlatform.WEB,
};
