import { Global, Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from './prisma.service';

/**
 * PrismaModule.
 *
 * Exports two providers that resolve to the SAME instance:
 *   • `PrismaService` — preferred token inside `apps/api` (has Nest lifecycle).
 *   • `PrismaClient`  — alias for sibling packages that cannot import the
 *                       PrismaService class (e.g. `@vaasenk/ai`).
 *
 * The alias is what lets `AiModule.VectorStoreService` `inject: [PrismaClient]`
 * without taking a dependency on `apps/api`. Both tokens resolve to the same
 * underlying instance, so connections, transactions, and observability all
 * share a single client.
 */
@Global()
@Module({
  providers: [
    PrismaService,
    {
      provide: PrismaClient,
      useExisting: PrismaService,
    },
  ],
  exports: [PrismaService, PrismaClient],
})
export class PrismaModule {}
