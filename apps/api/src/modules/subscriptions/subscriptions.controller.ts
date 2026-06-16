import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole, type User } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ListActivityDto, UpdateSubscriptionDto } from './subscriptions.dto';
import { SubscriptionsService } from './subscriptions.service';
import { InstitutionStatsService } from './institution-stats.service';

/**
 * Subscriptions controller — Sprint 8.1.
 *
 * Owns the `/institutions/:id/subscription`, `/institutions/:id/stats`, and
 * `/institutions/:id/activity` endpoints. Lives in its own controller (not
 * appended to InstitutionsController) so the @Roles + visibility checks
 * cluster together and the service can stay focused.
 *
 * Path-id vs. JWT institution: the service's `assertCanReach` enforces that
 * the URL :id matches the actor's JWT institutionId unless the actor is
 * SUPER_ADMIN. CLAUDE.md §3 — we never trust client-sent identifiers.
 */
@ApiTags('subscriptions')
@Controller('institutions/:id')
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly stats: InstitutionStatsService,
  ) {}

  /* ------------------------------------------------------------------------ */
  /* Subscription                                                              */
  /* ------------------------------------------------------------------------ */

  @Get('subscription')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Get the active subscription + computed usage for an institution',
  })
  getSubscription(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.subscriptions.getForInstitution(user, id);
  }

  @Patch('subscription')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary:
      'Update the subscription. Changing `plan` applies plan-default caps; observed usage is never reset.',
  })
  updateSubscription(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.subscriptions.updatePlan(user, id, dto);
  }

  /* ------------------------------------------------------------------------ */
  /* Stats                                                                     */
  /* ------------------------------------------------------------------------ */

  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary:
      'Aggregate counts for the admin dashboard (teachers, students, classrooms, notes, AI generations, syllabus, sample papers).',
  })
  getStats(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.stats.getStats(user, id);
  }

  /* ------------------------------------------------------------------------ */
  /* Activity                                                                  */
  /* ------------------------------------------------------------------------ */

  @Get('activity')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary:
      'Most recent audit-log entries with human-readable summary lines for the admin activity feed.',
  })
  getActivity(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query() _query: ListActivityDto,
  ) {
    return this.stats.getActivity(user, id, limit);
  }
}
