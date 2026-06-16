import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * NestJS-injectable Prisma client.
 *
 * Connects on module init, disconnects on module destroy so connection
 * pooling is deterministic and graceful shutdown actually releases sockets.
 *
 * Note (CLAUDE.md §3): query helpers in product modules MUST always filter
 * by institutionId. This service does NOT silently inject that filter — it
 * is the caller's responsibility to scope queries via the
 * InstitutionScopeInterceptor's stored institutionId.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Prisma client connected');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Boot behavior is environment-aware.
      //
      // Fail-SOFT only in explicit development: this preserves the deliberate
      // DX win (the API boots even when Docker/Postgres isn't running, so local
      // sessions don't die on a cold machine).
      //
      // Everywhere else — production, test, staging, or an UNSET NODE_ENV — we
      // fail HARD and refuse to start. A server that boots against a missing or
      // unreachable database passes a load-balancer health check while failing
      // every request one by one; refusing to start makes a misconfigured
      // deploy alert loudly instead of lying about being healthy. "Unset" is
      // treated as non-development on purpose: fail-closed is the safe default.
      const isDevelopment = process.env.NODE_ENV === 'development';
      if (isDevelopment) {
        this.logger.warn(
          `Prisma failed to connect at boot: ${message}. ` +
            'NODE_ENV=development → starting anyway; queries will retry on first use.',
        );
        return;
      }

      this.logger.error(
        `Prisma failed to connect at boot: ${message}. ` +
          `NODE_ENV=${process.env.NODE_ENV ?? '(unset)'} → refusing to start ` +
          'so a misconfigured deployment fails loudly instead of serving errors.',
      );
      throw err;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma client disconnected');
  }
}
