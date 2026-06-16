import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * AuditModule — Sprint 8.1.
 *
 * Marked `@Global()` so any module can inject `AuditService` without a
 * re-import. The service wraps `prisma.auditLog.create` with sane defaults
 * (best-effort, log-on-fail) and is the single ingest point for the admin
 * activity feed.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
