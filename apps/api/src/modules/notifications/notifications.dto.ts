import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { NotificationType } from '@prisma/client';

/**
 * Query DTO for `GET /api/v1/notifications`.
 *
 * All filters are optional. Pagination defaults match the platform-wide
 * convention from CLAUDE.md §7 (page=1, limit=20, max 100). `read` is a
 * tri-state: absent → both, true → only read, false → only unread.
 */
export class ListNotificationsDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  read?: boolean;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

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
