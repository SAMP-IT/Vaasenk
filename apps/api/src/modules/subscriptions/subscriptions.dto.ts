import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SubscriptionPlan } from '@prisma/client';

/**
 * PATCH /institutions/:id/subscription
 *
 * All fields optional. Sent by an admin (or super-admin) when manually
 * tracking billing. When `plan` changes, the service applies plan defaults
 * for userLimit / storageLimitGb / aiCreditsMonthly — observed usage
 * counters (currentUsers, storageUsedGb, aiCreditsUsed) are NEVER reset.
 */
export class UpdateSubscriptionDto {
  @IsOptional()
  @IsEnum(SubscriptionPlan)
  plan?: SubscriptionPlan;

  @IsOptional()
  @IsIn(['monthly', 'yearly'])
  billingCycle?: 'monthly' | 'yearly';

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  priceInr?: number;

  /** ISO date string — `null` clears the expiry. */
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  /** Free-form admin notes / external payment identifiers. */
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  // Manual override knobs (optional). Useful when ops wants to bump a
  // single tenant above its plan tier without inventing a new plan.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  userLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000)
  storageLimitGb?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  aiCreditsMonthly?: number;
}

/**
 * Query params for GET /institutions/:id/activity
 *
 *   limit  — number of recent rows to return (default 10, max 50)
 */
export class ListActivityDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
