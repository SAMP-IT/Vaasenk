import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * AuditService — Sprint 8.1.
 *
 * Thin wrapper around `prisma.auditLog.create`. Centralized so the activity
 * feed in the admin dashboard has a single ingest point and the
 * `actorId: null` "system action" path is uniformly handled.
 *
 * Audit writes are ADDITIVE — they should never break a parent flow if the
 * insert fails. Errors are logged and swallowed.
 *
 * Multi-tenant scoping (CLAUDE.md §3): every write requires `institutionId`.
 * Callers MUST pass the JWT-trusted value, never a client-sent one.
 */
export interface AuditWriteParams {
  institutionId: string;
  /** Null for system actions (workers, fan-outs). */
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Write a single audit row. Returns the row id on success, or `null` on
   * failure (logged at warn level — never throws to the caller).
   */
  async write(params: AuditWriteParams): Promise<string | null> {
    try {
      const row = await this.prisma.auditLog.create({
        data: {
          institutionId: params.institutionId,
          ...(params.actorId !== undefined &&
            params.actorId !== null && { actorId: params.actorId }),
          action: params.action,
          entityType: params.entityType,
          ...(params.entityId !== undefined &&
            params.entityId !== null && { entityId: params.entityId }),
          ...(params.metadata !== undefined &&
            params.metadata !== null && {
              metadata: params.metadata as Prisma.InputJsonValue,
            }),
          ...(params.ipAddress !== undefined &&
            params.ipAddress !== null && { ipAddress: params.ipAddress }),
          ...(params.userAgent !== undefined &&
            params.userAgent !== null && { userAgent: params.userAgent }),
        },
        select: { id: true },
      });
      return row.id;
    } catch (err) {
      this.logger.warn(
        `Audit write failed (${params.entityType}:${params.action}): ` +
          (err instanceof Error ? err.message : String(err)),
      );
      return null;
    }
  }
}
