/**
 * Public types for @vaasenk/ai.
 *
 * Every type that escapes the package surfaces here. Internal types stay in
 * the file that owns them. Each type is institution-scoped at the call site
 * (CLAUDE.md §3): the consumer passes `institutionId` and we never trust
 * client-supplied scoping.
 */

/* -------------------------------------------------------------------------- */
/* Embeddings                                                                 */
/* -------------------------------------------------------------------------- */

export interface EmbedBatchResult {
  /** One embedding vector per input text, same order as the input array. */
  embeddings: number[][];
  /** Tokens billed by the provider for the request input. */
  promptTokens: number;
  /** Total tokens billed (embeddings have no completion side, so == prompt). */
  totalTokens: number;
  /** Model name actually used (e.g. "text-embedding-3-small"). */
  model: string;
}

export interface EmbedQueryResult {
  embedding: number[];
  tokens: number;
  model: string;
}

/* -------------------------------------------------------------------------- */
/* Vector store                                                               */
/* -------------------------------------------------------------------------- */

export interface VectorUpsertItem {
  /** UUID of the parent SyllabusDocument. */
  syllabusId: string;
  /** UUID of the SyllabusChunk this vector represents. */
  chunkId: string;
  /** Namespace string — must be `inst_{institutionId}_syl_{syllabusId}`. */
  namespace: string;
  /** 1536-dimensional embedding vector. */
  embedding: number[];
  /** Provider model name (e.g. "text-embedding-3-small"). */
  modelName: string;
  /** Free-form metadata persisted alongside the vector. */
  metadata?: Record<string, unknown>;
}

export interface VectorSearchQuery {
  /** Tenant-scoped namespace. */
  namespace: string;
  /** Query embedding (must match the embedding-model dimension). */
  embedding: number[];
  /** How many nearest neighbours to return. Default 5. */
  topK?: number;
  /**
   * Minimum cosine similarity (1 - distance). Results below this are
   * dropped. Default 0 (return everything).
   */
  similarityThreshold?: number;
}

export interface VectorSearchResultChunk {
  id: string;
  content: string;
  chapter: string | null;
  topic: string | null;
  pageNumber: number | null;
  metadata: Record<string, unknown> | null;
}

export interface VectorSearchResultSyllabus {
  id: string;
  name: string;
  version: string;
}

export interface VectorSearchResult {
  chunkId: string;
  /** Cosine similarity in [0, 1]; 1 == identical. */
  similarity: number;
  /** Raw cosine distance in [0, 2]; lower == closer. */
  distance: number;
  chunk: VectorSearchResultChunk;
  syllabus: VectorSearchResultSyllabus;
}

/* -------------------------------------------------------------------------- */
/* RAG                                                                        */
/* -------------------------------------------------------------------------- */

export interface Citation {
  syllabusId: string;
  syllabusName: string;
  syllabusVersion: string;
  chapter: string | null;
  topic: string | null;
  pageNumber: number | null;
}

export interface RagChunk {
  /** Body text of the chunk. Truncated to keep context windows manageable. */
  content: string;
  /** Cosine similarity to the query. */
  similarity: number;
  /** Citation payload mirroring `AiChatMessage.citations`. */
  citation: Citation;
}

export interface RagContext {
  chunks: RagChunk[];
  /** Tokens billed for the query embedding. */
  promptTokens: number;
  totalTokens: number;
  namespace: string;
  /** Model used for the query embedding. */
  embeddingModel: string;
}

/* -------------------------------------------------------------------------- */
/* Chat                                                                       */
/* -------------------------------------------------------------------------- */

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatBaseParams {
  /** System prompt — built by the caller (use buildTeacherAssistantSystemPrompt). */
  systemPrompt: string;
  /** Latest user message. */
  userMessage: string;
  /** Prior turns (oldest first). Capped by the caller. */
  history?: ChatHistoryMessage[];
  /** RAG chunks already formatted into the system prompt — surfaced here so
   *  the assistant message persistence step can attach citations. */
  contextChunks?: RagChunk[];
  /** Override the default model. */
  model?: string;
  /** Override the default max completion tokens. */
  maxTokens?: number;
}

export type ChatCompleteParams = ChatBaseParams;
export type ChatStreamParams = ChatBaseParams;

export interface ChatCompleteResult {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  /** Optional citations extracted from the model's `[n]` references. */
  citations: Citation[];
}

export type ChatStreamEvent =
  | { type: 'token'; content: string }
  | {
      type: 'usage';
      promptTokens: number;
      completionTokens: number;
      model: string;
      /** Aggregated assistant text — convenient for callers that want the
       *  full reply without joining tokens themselves. */
      content: string;
      /** Citations extracted from `[n]` references in `content`. */
      citations: Citation[];
    }
  | { type: 'error'; code: string; message: string };
