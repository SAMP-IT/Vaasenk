import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';
import type { RagChunk, RagContext, VectorSearchResult } from './types';
import { VectorStoreService } from './vector-store.service';

/**
 * RAG retrieval — Sprint 4 PROMPT 17.
 *
 * Orchestrates query-embedding → vector search → citation assembly. The
 * namespace is constructed here in ONE place (`inst_{institutionId}_syl_
 * {syllabusId}`) and is the only namespace string this layer ever produces,
 * so the rest of the codebase can never accidentally form a malformed one.
 */
@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  /** Soft cap so we never blow the LLM's context window with a single chunk. */
  private static readonly MAX_CHUNK_CONTENT_CHARS = 1500;

  constructor(
    private readonly embeddings: EmbeddingsService,
    private readonly vectors: VectorStoreService,
  ) {}

  /**
   * Builds the namespace string that scopes vector queries.
   *
   * Format: `inst_{institutionId}_syl_{syllabusId}` (CLAUDE.md §3 rule 6).
   * The format is checked by VectorStoreService.upsert as a defence-in-depth
   * invariant — keep this method as the canonical builder.
   */
  static buildNamespace(institutionId: string, syllabusId: string): string {
    return `inst_${institutionId}_syl_${syllabusId}`;
  }

  /**
   * Retrieves the top-K most relevant chunks for `query` within the syllabus
   * mapped to a classroom. The `classroomId` is currently advisory metadata
   * (Sprint 4 maps syllabus → classroom 1:1) but is reserved for Sprint 5+
   * when sample papers add a second namespace component.
   */
  async retrieve(
    institutionId: string,
    _classroomId: string,
    syllabusId: string,
    query: string,
    opts: { topK?: number; threshold?: number } = {},
  ): Promise<RagContext> {
    const namespace = RagService.buildNamespace(institutionId, syllabusId);

    const { embedding, tokens, model } = await this.embeddings.embedQuery(
      institutionId,
      query,
    );

    const searchOpts: {
      namespace: string;
      embedding: number[];
      topK?: number;
      similarityThreshold?: number;
    } = { namespace, embedding };
    if (opts.topK !== undefined) searchOpts.topK = opts.topK;
    if (opts.threshold !== undefined) {
      searchOpts.similarityThreshold = opts.threshold;
    }
    const results: VectorSearchResult[] = await this.vectors.search(
      institutionId,
      searchOpts,
    );

    const chunks: RagChunk[] = results.map((r) => ({
      content:
        r.chunk.content.length > RagService.MAX_CHUNK_CONTENT_CHARS
          ? `${r.chunk.content.slice(0, RagService.MAX_CHUNK_CONTENT_CHARS)}…`
          : r.chunk.content,
      similarity: r.similarity,
      citation: {
        syllabusId: r.syllabus.id,
        syllabusName: r.syllabus.name,
        syllabusVersion: r.syllabus.version,
        chapter: r.chunk.chapter,
        topic: r.chunk.topic,
        pageNumber: r.chunk.pageNumber,
      },
    }));

    this.logger.debug(
      `RAG retrieve: institution=${institutionId} syllabus=${syllabusId} ` +
        `retrieved=${chunks.length} embeddingTokens=${tokens}`,
    );

    return {
      chunks,
      promptTokens: tokens,
      totalTokens: tokens,
      namespace,
      embeddingModel: model,
    };
  }
}
