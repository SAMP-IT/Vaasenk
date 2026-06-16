import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import type {
  VectorSearchQuery,
  VectorSearchResult,
  VectorUpsertItem,
} from './types';

/**
 * pgvector chokepoint.
 *
 * EVERY vector query in the codebase MUST go through this service. The class
 * hard-codes the `institution_id` + `namespace` WHERE filter in every query
 * (CLAUDE.md §3 + AI Engineer's directive) so it is structurally impossible
 * to fan out across tenants by mistake.
 *
 * The service is provider-agnostic: it stores arbitrary 1536-dimensional
 * vectors. Embedding generation lives in `EmbeddingsService`.
 *
 * We accept `PrismaClient` (rather than the API's `PrismaService`) as the
 * `prisma` argument because `packages/ai/` is a sibling library — it cannot
 * import `apps/api`. NestJS DI hands us the `PrismaService` instance at
 * runtime; the type relationship "PrismaService extends PrismaClient" makes
 * the substitution safe.
 */
@Injectable()
export class VectorStoreService {
  private readonly logger = new Logger(VectorStoreService.name);

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Bulk-inserts embeddings. Each item is keyed by `chunkId` (unique
   * constraint in the schema), so re-running the worker on the same
   * syllabus is safe IFF the caller deletes by namespace first (see
   * `deleteByNamespace`).
   *
   * Uses a parameterised raw INSERT — Prisma cannot natively write the
   * `Unsupported("vector(1536)")` column. The embedding is bound as a
   * `'[1,2,3]'::vector` literal which pgvector parses without issue.
   *
   * Returns the count of rows inserted (== items.length on success).
   */
  async upsert(
    institutionId: string,
    items: VectorUpsertItem[],
  ): Promise<{ inserted: number }> {
    if (items.length === 0) {
      return { inserted: 0 };
    }

    // Validate every item carries the same institution-scoped namespace —
    // defence in depth against a worker that constructs the wrong namespace.
    const expectedNamespacePrefix = `inst_${institutionId}_`;
    for (const item of items) {
      if (!item.namespace.startsWith(expectedNamespacePrefix)) {
        throw new Error(
          `VectorStoreService.upsert: namespace "${item.namespace}" does not ` +
            `match institutionId ${institutionId}.`,
        );
      }
    }

    let inserted = 0;

    // We run one INSERT per item to keep the SQL simple and parameter-safe.
    // Vector packets are small (1536 floats ≈ 12KB) so a few hundred round
    // trips per syllabus is acceptable — single-syllabus indexing is offline
    // batch work, not a user-facing latency path. If this becomes a hot
    // path, switch to a single INSERT with unnest() of arrays.
    for (const item of items) {
      const vectorLiteral = this.toVectorLiteral(item.embedding);
      const metadata = item.metadata
        ? (item.metadata as Prisma.InputJsonValue)
        : Prisma.JsonNull;
      try {
        const rows = await this.prisma.$executeRaw`
          INSERT INTO vector_embeddings (
            id, institution_id, syllabus_id, chunk_id, namespace,
            embedding, model_name, metadata, created_at, updated_at
          ) VALUES (
            gen_random_uuid(),
            ${institutionId}::uuid,
            ${item.syllabusId}::uuid,
            ${item.chunkId}::uuid,
            ${item.namespace},
            ${vectorLiteral}::vector,
            ${item.modelName},
            ${metadata}::jsonb,
            NOW(),
            NOW()
          )
          ON CONFLICT (chunk_id) DO UPDATE SET
            embedding = EXCLUDED.embedding,
            namespace = EXCLUDED.namespace,
            model_name = EXCLUDED.model_name,
            metadata = EXCLUDED.metadata,
            updated_at = NOW();
        `;
        inserted += rows;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Failed to upsert embedding for chunk ${item.chunkId}: ${message}`,
        );
        throw err;
      }
    }

    return { inserted };
  }

  /**
   * Removes every embedding in the given namespace. Used by the reprocess
   * path before re-running the worker so a re-processed syllabus does not
   * accumulate stale vectors.
   *
   * The institution filter is redundant (a namespace already encodes the
   * institutionId by construction) but kept for defence in depth.
   */
  async deleteByNamespace(
    institutionId: string,
    namespace: string,
  ): Promise<{ deleted: number }> {
    const deleted = await this.prisma.vectorEmbedding.deleteMany({
      where: { institutionId, namespace },
    });
    return { deleted: deleted.count };
  }

  /**
   * Performs an ANN cosine-distance search constrained to the given
   * institution + namespace. Returns the top-K nearest chunks with full
   * citation metadata joined.
   *
   * The generated SQL ALWAYS includes:
   *     WHERE ve.institution_id = $1 AND ve.namespace = $2
   * If you find yourself wanting to bypass this — stop. The whole point of
   * routing every query through this method is that the constraint is
   * un-bypassable. Add the new constraint to this method, don't fork it.
   */
  async search(
    institutionId: string,
    query: VectorSearchQuery,
  ): Promise<VectorSearchResult[]> {
    if (query.embedding.length === 0) {
      return [];
    }
    const topK = Math.min(Math.max(query.topK ?? 5, 1), 50);
    const threshold = query.similarityThreshold ?? 0;
    const vectorLiteral = this.toVectorLiteral(query.embedding);

    // Use $queryRaw (tagged template) so all values are properly
    // parameterised — never $queryRawUnsafe.
    const rows = await this.prisma.$queryRaw<
      Array<{
        chunk_id: string;
        distance: number;
        content: string;
        chapter: string | null;
        topic: string | null;
        page_number: number | null;
        chunk_metadata: Prisma.JsonValue | null;
        syllabus_id: string;
        syllabus_name: string;
        syllabus_version: string;
      }>
    >`
      SELECT
        ve.chunk_id,
        (ve.embedding <=> ${vectorLiteral}::vector)::float AS distance,
        sc.content,
        sc.chapter,
        sc.topic,
        sc.page_number,
        sc.metadata AS chunk_metadata,
        sd.id AS syllabus_id,
        sd.name AS syllabus_name,
        sd.version AS syllabus_version
      FROM vector_embeddings ve
      JOIN syllabus_chunks sc ON sc.id = ve.chunk_id
      JOIN syllabus_documents sd ON sd.id = ve.syllabus_id
      WHERE ve.institution_id = ${institutionId}::uuid
        AND ve.namespace = ${query.namespace}
      ORDER BY ve.embedding <=> ${vectorLiteral}::vector
      LIMIT ${topK};
    `;

    const results: VectorSearchResult[] = [];
    for (const r of rows) {
      const distance = Number(r.distance);
      const similarity = 1 - distance;
      if (similarity < threshold) continue;
      results.push({
        chunkId: r.chunk_id,
        similarity,
        distance,
        chunk: {
          id: r.chunk_id,
          content: r.content,
          chapter: r.chapter,
          topic: r.topic,
          pageNumber: r.page_number,
          metadata:
            r.chunk_metadata && typeof r.chunk_metadata === 'object'
              ? (r.chunk_metadata as Record<string, unknown>)
              : null,
        },
        syllabus: {
          id: r.syllabus_id,
          name: r.syllabus_name,
          version: r.syllabus_version,
        },
      });
    }
    return results;
  }

  /**
   * Renders a JS number array as the pgvector text literal form
   * `[v1,v2,...,vn]`. We pass it as a regular string parameter and let
   * pgvector parse it via the explicit `::vector` cast in the SQL.
   *
   * Non-finite values (NaN / Infinity) would corrupt the index — throw
   * loudly so the worker fails the syllabus rather than silently writing
   * garbage rows.
   */
  private toVectorLiteral(embedding: number[]): string {
    const parts: string[] = new Array(embedding.length);
    for (let i = 0; i < embedding.length; i++) {
      const v = embedding[i];
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new Error(
          `VectorStoreService: embedding[${i}] is not a finite number (${v}).`,
        );
      }
      parts[i] = v.toString();
    }
    return `[${parts.join(',')}]`;
  }
}
