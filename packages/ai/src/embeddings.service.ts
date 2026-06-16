import { Injectable, Logger } from '@nestjs/common';
import { OpenAIClient } from './clients/openai.client';
import { DEFAULT_EMBEDDING_MODEL } from './pricing';
import type { EmbedBatchResult, EmbedQueryResult } from './types';

/**
 * OpenAI text-embedding-3-small wrapper.
 *
 * Sprint 4 — Playbook PROMPT 17.
 *
 * Every public method takes `institutionId` as the mandatory first parameter
 * (CLAUDE.md §3 / AI Engineer's directive) even though OpenAI itself is
 * institution-agnostic. The parameter exists so:
 *   1. Future per-tenant key rotation or rate-limit quotas have a hook here.
 *   2. Audit logs can attribute every embedding call to a tenant.
 *
 * Usage logging is NOT performed here — the caller decides whether to record
 * a row per chunk or aggregate the batch. See `SyllabusWorker` for the
 * batch-aggregation pattern and `RagService` for the per-query pattern.
 */
@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);

  /**
   * OpenAI's embedding endpoint accepts up to 2048 inputs per request, but
   * we cap at 96 to (a) keep payloads under 1MB even on long syllabus chunks
   * and (b) limit blast radius of a single 429/5xx — a syllabus with 800
   * chunks fails 96 at a time, not 800 at a time.
   */
  private static readonly DEFAULT_BATCH_SIZE = 96;

  constructor(private readonly openai: OpenAIClient) {}

  /**
   * Embeds an arbitrary number of texts in chunks of `opts.batchSize`
   * (default 96). Returns the full vector array in input order.
   *
   * Rejects with whatever the OpenAI SDK throws (HTTP errors propagate as
   * `OpenAI.APIError` subclasses). Callers translate those to NestJS
   * exceptions at the controller boundary.
   */
  async embedBatch(
    _institutionId: string,
    texts: string[],
    opts: { model?: string; batchSize?: number } = {},
  ): Promise<EmbedBatchResult> {
    if (texts.length === 0) {
      return {
        embeddings: [],
        promptTokens: 0,
        totalTokens: 0,
        model: opts.model ?? DEFAULT_EMBEDDING_MODEL,
      };
    }

    const model = opts.model ?? DEFAULT_EMBEDDING_MODEL;
    const batchSize = opts.batchSize ?? EmbeddingsService.DEFAULT_BATCH_SIZE;
    const sdk = this.openai.client;

    const embeddings: number[][] = new Array(texts.length);
    let promptTokens = 0;
    let totalTokens = 0;

    for (let i = 0; i < texts.length; i += batchSize) {
      const slice = texts.slice(i, i + batchSize);
      const response = await sdk.embeddings.create({
        model,
        input: slice,
      });

      response.data.forEach((row, j) => {
        embeddings[i + j] = row.embedding;
      });
      promptTokens += response.usage?.prompt_tokens ?? 0;
      totalTokens += response.usage?.total_tokens ?? 0;
    }

    this.logger.debug(
      `Embedded ${texts.length} texts with ${model} ` +
        `(${promptTokens} prompt / ${totalTokens} total tokens)`,
    );

    return { embeddings, promptTokens, totalTokens, model };
  }

  /**
   * Single-text convenience wrapper. Used by RagService for query embedding.
   */
  async embedQuery(
    institutionId: string,
    text: string,
    opts: { model?: string } = {},
  ): Promise<EmbedQueryResult> {
    const passthrough: { model?: string } = {};
    if (opts.model !== undefined) passthrough.model = opts.model;
    const batch = await this.embedBatch(institutionId, [text], passthrough);
    const embedding = batch.embeddings[0];
    if (!embedding) {
      throw new Error(
        'EmbeddingsService.embedQuery: OpenAI returned no embedding for the query.',
      );
    }
    return {
      embedding,
      tokens: batch.totalTokens,
      model: batch.model,
    };
  }
}
