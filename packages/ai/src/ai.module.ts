import { Global, Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AnthropicClient } from './clients/anthropic.client';
import { ChatService } from './chat.service';
import { OpenAIClient } from './clients/openai.client';
import { EmbeddingsService } from './embeddings.service';
import { RagService } from './rag.service';
import { VectorStoreService } from './vector-store.service';

/**
 * NestJS module exposing every @vaasenk/ai service.
 *
 * Marked `@Global()` so consumers (apps/api workers + ai-chat controllers)
 * can inject services without re-importing the module in every feature
 * module.
 *
 * The single tricky piece is `VectorStoreService` — it depends on a
 * `PrismaClient`. Because `packages/ai/` cannot import the API's
 * `PrismaService`, we declare the dependency on the abstract `PrismaClient`
 * and let consumers register the concrete instance:
 *
 *   AiModule.register({ prismaToken: PrismaService })
 *
 * In Sprint 4 the API simply re-uses the already-global PrismaService
 * provider by exporting `PrismaClient` as an alias from PrismaModule. See
 * the AppModule wiring for the exact alias provider.
 */
@Global()
@Module({
  providers: [
    OpenAIClient,
    AnthropicClient,
    EmbeddingsService,
    {
      // We can't `inject: [PrismaService]` here because @vaasenk/ai doesn't
      // know about it. Consumers register a `PrismaClient` provider that
      // aliases their PrismaService instance — see app.module.ts.
      provide: VectorStoreService,
      useFactory: (prisma: PrismaClient) => new VectorStoreService(prisma),
      inject: [PrismaClient],
    },
    RagService,
    ChatService,
  ],
  exports: [
    OpenAIClient,
    AnthropicClient,
    EmbeddingsService,
    VectorStoreService,
    RagService,
    ChatService,
  ],
})
export class AiModule {}
