import { Module } from '@nestjs/common';
import { AiChatController } from './ai-chat.controller';
import { AiChatService } from './ai-chat.service';

/**
 * AI Chat module — Sprint 4 PROMPT 18.
 *
 * Depends on the global AiModule (registered in AppModule) for:
 *   - RagService — query embedding + vector search
 *   - ChatService — Anthropic streaming completions
 *   - VectorStoreService (indirect via RagService)
 *
 * No queue registration here — chat is a synchronous SSE path, no BullMQ.
 */
@Module({
  controllers: [AiChatController],
  providers: [AiChatService],
  exports: [AiChatService],
})
export class AiChatModule {}
