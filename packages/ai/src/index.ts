/**
 * @vaasenk/ai
 *
 * AI service layer for Vaasenk. All AI calls from apps MUST go through this
 * package (per CLAUDE.md §6 + AI Engineer's directive). Wraps embeddings, RAG
 * retrieval, and chat behind an institution-scoped interface; every method
 * takes `institutionId` as the mandatory first parameter and every vector
 * query is filtered by institution + namespace in `VectorStoreService`.
 *
 * Sprint 4 — PROMPTS 17 + 18.
 */

export const AI_PACKAGE_VERSION = '0.1.0';

// Module
export { AiModule } from './ai.module';

// Clients
export { AnthropicClient } from './clients/anthropic.client';
export { OpenAIClient } from './clients/openai.client';

// Services
export { ChatService } from './chat.service';
export { EmbeddingsService } from './embeddings.service';
export { RagService } from './rag.service';
export { VectorStoreService } from './vector-store.service';

// Pricing helpers
export {
  ANTHROPIC_CHAT_PRICES_USD_PER_1M_TOKENS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_EMBEDDING_MODEL,
  EMBEDDING_PRICE_USD_PER_1M_TOKENS,
  computeChatCostUsd,
  computeEmbeddingCostUsd,
} from './pricing';

// Prompts
export {
  buildTeacherAssistantSystemPrompt,
  extractCitations,
} from './prompts/teacher-assistant.prompt';

// Token helpers
export { countTokens } from './utils/tokens';

// Types
export type {
  ChatCompleteParams,
  ChatCompleteResult,
  ChatHistoryMessage,
  ChatStreamEvent,
  ChatStreamParams,
  Citation,
  EmbedBatchResult,
  EmbedQueryResult,
  RagChunk,
  RagContext,
  VectorSearchQuery,
  VectorSearchResult,
  VectorSearchResultChunk,
  VectorSearchResultSyllabus,
  VectorUpsertItem,
} from './types';
