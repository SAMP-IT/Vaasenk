import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type User } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ListNotificationsDto } from './notifications.dto';
import { NotificationsService } from './notifications.service';

/**
 * Notifications REST controller — Sprint 6 PROMPT 22.
 *
 * Three endpoints power the in-app bell:
 *
 *   GET   /api/v1/notifications              — paginated list + unread total
 *   PATCH /api/v1/notifications/:id/read     — mark one read
 *   PATCH /api/v1/notifications/read-all     — mark every unread read
 *
 * All three require an authenticated user. The default `@Roles` policy
 * (no decorator → "any authenticated user") is intentional — every role
 * has a notification inbox. Tenant + recipient scoping happens in the
 * service via `(institutionId, userId)`.
 *
 * The realtime push path lives in `NotificationsGateway`. The REST surface
 * is the "catch up" — clients call it on reconnect to backfill anything
 * the WS missed.
 */
@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary:
      'List notifications for the current user with optional filters and unread counter',
  })
  list(@CurrentUser() user: User, @Query() query: ListNotificationsDto) {
    return this.service.list(user, query);
  }

  /**
   * Mass mark-as-read. Declared BEFORE `:id/read` so Nest's path matcher
   * binds the literal segment before the param. `:id/read` is two
   * segments, so they don't actually collide, but ordering keeps the
   * router's behaviour predictable across NestJS versions.
   */
  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Mark every unread notification for the current user as read',
  })
  markAllRead(@CurrentUser() user: User) {
    return this.service.markAllRead(user);
  }

  @Patch(':id/read')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({ summary: 'Mark a single notification as read (idempotent)' })
  markRead(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.markRead(user, id);
  }
}
