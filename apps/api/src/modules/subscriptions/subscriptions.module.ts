import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module';
import { InstitutionStatsService } from './institution-stats.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

/**
 * Subscriptions module — Sprint 8.1.
 *
 * Marked `@Global()` so any downstream module (users, notes, syllabus,
 * sample-papers, question-papers, ai-chat) can inject `SubscriptionsService`
 * without re-importing the module. Mirrors the pattern used by
 * NotificationsModule.
 *
 * Bootstrapping order — registered in AppModule BEFORE every consumer:
 *   users, notes, syllabus, sample-papers, ai-chat, question-papers.
 *
 * The InstitutionStatsService (which backs /stats and /activity) lives here
 * rather than under InstitutionsModule because it shares the same multi-
 * tenant guard surface and is only consumed by the same admin-dashboard
 * frontend that consumes /subscription.
 */
@Global()
@Module({
  imports: [AuditModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, InstitutionStatsService],
  exports: [SubscriptionsService, InstitutionStatsService],
})
export class SubscriptionsModule {}
