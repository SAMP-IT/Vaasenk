import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { NotificationType, ProcessingStatus } from '@prisma/client';
import {
  EmbeddingsService,
  RagService,
  VectorStoreService,
  computeEmbeddingCostUsd,
} from '@vaasenk/ai';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SyllabusStorageService } from './syllabus-storage.service';

/**
 * Sprint 3 — Syllabus PDF processor.
 *
 * Pipeline per job:
 *   1. Re-fetch the row (scoped by institutionId) and confirm it still exists.
 *   2. Download the PDF bytes from storage.
 *   3. Run `pdf-parse` to extract a single text blob + page count.
 *   4. Chunk the text into ~500-token windows with 200-char overlap, biased
 *      toward sentence/paragraph boundaries when one is within ±100 chars.
 *   5. Persist chunks with createMany (single round trip).
 *   6. Sprint 4 — generate OpenAI embeddings, upsert into pgvector, log
 *      AiUsageLog for the batch.
 *   7. Flip status to AI_READY and record extraction metadata.
 *
 * On any failure the row is marked FAILED with a user-friendly errorMessage
 * (the raw stack lives in logger output, never in the API surface). If
 * chunk extraction succeeds but embedding fails, the chunks remain in the
 * DB — an admin can re-trigger embedding via the reprocess endpoint.
 */

interface SyllabusProcessJobData {
  syllabusId: string;
  institutionId: string;
  filePath: string;
  fileSizeBytes: number | null;
}

interface PdfParseResult {
  text: string;
  numpages?: number;
  numrender?: number;
  info?: unknown;
  metadata?: unknown;
  version?: string;
}

// Chunking knobs. ~500 tokens ≈ 2000 chars at the English heuristic of
// 1 token ≈ 4 chars. We respect sentence/paragraph boundaries within a
// ±100-char window of the target; fall back to a hard cut when none fits.
const CHUNK_TARGET_CHARS = 2000;
const CHUNK_OVERLAP_CHARS = 200;
const CHUNK_BOUNDARY_WINDOW = 100;
const CHARS_PER_TOKEN = 4;

@Processor('syllabus')
export class SyllabusWorker extends WorkerHost {
  private readonly logger = new Logger(SyllabusWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SyllabusStorageService,
    private readonly embeddings: EmbeddingsService,
    private readonly vectors: VectorStoreService,
    private readonly notifications: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<SyllabusProcessJobData>): Promise<void> {
    if (job.name !== 'process') {
      this.logger.warn(
        `Unhandled job name "${job.name}" on syllabus queue; skipping.`,
      );
      return;
    }

    const { syllabusId, institutionId, filePath } = job.data;
    this.logger.log(
      `Syllabus processing started for ${syllabusId} (institution ${institutionId})`,
    );

    try {
      const row = await this.prisma.syllabusDocument.findFirst({
        where: { id: syllabusId, institutionId },
        select: { id: true, institutionId: true, status: true },
      });
      if (!row) {
        this.logger.warn(
          `Syllabus ${syllabusId} not found (institution ${institutionId}) — skipping.`,
        );
        return;
      }

      const buffer = await this.storage.downloadObject(filePath);
      if (!buffer) {
        await this.markFailed(
          syllabusId,
          institutionId,
          'Could not download the uploaded PDF from storage.',
        );
        return;
      }

      const parsed = await this.parsePdf(buffer);
      const text = (parsed.text ?? '').trim();
      if (text.length === 0) {
        await this.markFailed(
          syllabusId,
          institutionId,
          'Could not extract text from the PDF. The file may be scanned/image-only or password-protected.',
        );
        return;
      }

      const chunks = this.chunkText(text);
      if (chunks.length === 0) {
        await this.markFailed(
          syllabusId,
          institutionId,
          'Extracted text was too short to chunk. Please verify the PDF contains a syllabus body.',
        );
        return;
      }

      const wordCount = this.countWords(text);

      // Step 1 — persist chunks. We do this BEFORE embedding so partial
      // failures (rare OpenAI 5xx) still leave a recoverable state.
      await this.prisma.syllabusChunk.createMany({
        data: chunks.map((c) => ({
          institutionId,
          syllabusId,
          chunkIndex: c.index,
          content: c.content,
          tokenCount: c.tokenCount,
          // Page numbers per-chunk require per-page text from pdf-parse —
          // the default API only returns a flat string. Sprint 4 may swap to
          // a per-page parser. Leave null for now.
          pageNumber: null,
          chapter: null,
          topic: null,
          metadata: {
            startOffset: c.startOffset,
            endOffset: c.endOffset,
            charCount: c.content.length,
          },
        })),
      });

      // Step 2 — generate embeddings for every chunk and upsert vectors.
      // If this fails the row is marked FAILED but the chunks remain so an
      // admin can fix the OpenAI configuration and re-trigger via reprocess.
      try {
        await this.embedAndStoreChunks(syllabusId, institutionId);
      } catch (embedErr) {
        const message =
          embedErr instanceof Error ? embedErr.message : String(embedErr);
        this.logger.error(
          `Embedding generation failed for syllabus ${syllabusId}: ${message}`,
          embedErr instanceof Error ? embedErr.stack : undefined,
        );
        await this.markFailed(
          syllabusId,
          institutionId,
          `Embedding generation failed: ${this.userFacingEmbeddingError(message)}`,
        );
        return;
      }

      const updatedRow = await this.prisma.syllabusDocument.update({
        where: { id: syllabusId },
        data: {
          status: ProcessingStatus.AI_READY,
          pageCount: parsed.numpages ?? null,
          errorMessage: null,
          metadata: {
            wordCount,
            chunkCount: chunks.length,
            charCount: text.length,
            pdfVersion: parsed.version ?? null,
            extractedAt: new Date().toISOString(),
          },
        },
        select: { id: true, name: true },
      });

      this.logger.log(
        `Syllabus ${syllabusId} processed: ${chunks.length} chunks, ` +
          `${wordCount} words, ${parsed.numpages ?? 'unknown'} pages.`,
      );

      // Sprint 6 — notify every institution admin that the syllabus is
      // ready for AI use. Multi-admin tenants get every admin in the bell;
      // failures are logged, never thrown.
      await this.notifyAdmins(
        institutionId,
        NotificationType.SYLLABUS_READY,
        `Syllabus ready for AI: ${updatedRow.name}`,
        `Embeddings completed for "${updatedRow.name}". Teachers can now use the AI assistant for this syllabus.`,
        { syllabusId },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(
        `Syllabus ${syllabusId} processing failed: ${message}`,
        stack,
      );
      // Translate provider-specific exceptions into user-friendly messages.
      await this.markFailed(
        syllabusId,
        institutionId,
        this.userFacingError(message),
      );
    }
  }

  /**
   * Loads the chunks we just persisted, embeds them in batches via OpenAI,
   * upserts the resulting vectors into pgvector, and writes a single
   * `AiUsageLog` row capturing the batch's token usage + cost.
   *
   * Idempotent w.r.t. re-runs: VectorStoreService.upsert ON CONFLICT updates
   * the existing row. Reprocess paths additionally delete the namespace
   * first so vector counts stay aligned with chunk counts.
   */
  private async embedAndStoreChunks(
    syllabusId: string,
    institutionId: string,
  ): Promise<void> {
    const chunks = await this.prisma.syllabusChunk.findMany({
      where: { syllabusId, institutionId },
      orderBy: { chunkIndex: 'asc' },
      select: { id: true, content: true },
    });
    if (chunks.length === 0) {
      this.logger.warn(
        `Syllabus ${syllabusId}: no chunks found at embedding time — skipping.`,
      );
      return;
    }

    const texts = chunks.map((c) => c.content);
    const result = await this.embeddings.embedBatch(institutionId, texts);

    if (result.embeddings.length !== chunks.length) {
      throw new Error(
        `Embedding count mismatch: expected ${chunks.length}, got ${result.embeddings.length}`,
      );
    }

    const namespace = RagService.buildNamespace(institutionId, syllabusId);
    const items = chunks.map((c, idx) => {
      const embedding = result.embeddings[idx];
      if (!embedding) {
        throw new Error(
          `Embedding missing at index ${idx} (chunk ${c.id}) — provider returned a sparse result.`,
        );
      }
      return {
        syllabusId,
        chunkId: c.id,
        namespace,
        embedding,
        modelName: result.model,
        metadata: { chunkIndex: idx },
      };
    });

    const upsertResult = await this.vectors.upsert(institutionId, items);

    const costUsd = computeEmbeddingCostUsd(result.totalTokens);

    // Single AiUsageLog row per syllabus batch — Sprint 4 quality gate #8.
    // We omit `userId` (no actor — this is background work). The classroom
    // is also omitted since a syllabus may be mapped to many classrooms.
    await this.prisma.aiUsageLog.create({
      data: {
        institutionId,
        operation: 'embedding',
        provider: 'openai',
        modelName: result.model,
        promptTokens: result.promptTokens,
        completionTokens: 0,
        totalTokens: result.totalTokens,
        costUsd,
        metadata: {
          syllabusId,
          chunkCount: chunks.length,
          vectorCount: upsertResult.inserted,
          namespace,
        },
      },
    });

    this.logger.log(
      `Syllabus ${syllabusId}: embedded ${chunks.length} chunks, ` +
        `upserted ${upsertResult.inserted} vectors, ` +
        `${result.totalTokens} tokens, $${costUsd.toFixed(6)}.`,
    );
  }

  /**
   * Dynamically import `pdf-parse` so the worker file doesn't pull a binary
   * dependency at module-load time. This keeps lint/typecheck green even
   * when the optional dependency is missing in a hermetic sandbox.
   */
  private async parsePdf(buffer: Buffer): Promise<PdfParseResult> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (
      data: Buffer,
    ) => Promise<PdfParseResult>;
    return pdfParse(buffer);
  }

  private async markFailed(
    syllabusId: string,
    institutionId: string,
    message: string,
  ): Promise<void> {
    await this.prisma.syllabusDocument.updateMany({
      where: { id: syllabusId, institutionId },
      data: {
        status: ProcessingStatus.FAILED,
        errorMessage: message,
      },
    });
    this.logger.warn(`Syllabus ${syllabusId} marked FAILED: ${message}`);

    // Sprint 6 — fan-out SYLLABUS_FAILED to every institution admin so
    // someone investigates instead of the row sitting stuck.
    const row = await this.prisma.syllabusDocument.findFirst({
      where: { id: syllabusId, institutionId },
      select: { name: true },
    });
    await this.notifyAdmins(
      institutionId,
      NotificationType.SYLLABUS_FAILED,
      `Syllabus AI processing failed: ${row?.name ?? 'untitled'}`,
      message,
      { syllabusId },
    );
  }

  /**
   * Helper — fan-out a notification to every ADMIN/SUPER_ADMIN in the
   * institution. Used for SYLLABUS_READY and SYLLABUS_FAILED triggers in
   * Sprint 6. Best-effort: failures log but never throw, so the syllabus
   * row's status flip stays consistent regardless.
   */
  private async notifyAdmins(
    institutionId: string,
    type: NotificationType,
    title: string,
    body: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      const adminIds =
        await this.notifications.getInstitutionAdminIds(institutionId);
      if (adminIds.length === 0) return;
      await this.notifications.notifyMany({
        institutionId,
        userIds: adminIds,
        type,
        title,
        body,
        metadata,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to fan-out ${type} for institution ${institutionId}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  /**
   * Translate raw library errors to user-friendly text. Anything that
   * mentions encryption / password / "stream" / scanned content is mapped
   * to the same advice; everything else falls back to a generic message.
   */
  private userFacingError(message: string): string {
    const lower = message.toLowerCase();
    if (
      lower.includes('password') ||
      lower.includes('encrypted') ||
      lower.includes('encryption')
    ) {
      return 'The PDF appears to be password-protected. Please upload an unprotected copy.';
    }
    if (lower.includes('scan') || lower.includes('image')) {
      return 'The PDF appears to be image-only (scanned). Please upload a text-based PDF.';
    }
    if (lower.includes('corrupt') || lower.includes('invalid pdf')) {
      return 'The PDF file appears to be corrupt or invalid. Please re-export and re-upload.';
    }
    return 'Could not extract text from the PDF. The file may be scanned/image-only or password-protected.';
  }

  /**
   * Translates embedding-provider errors to messages an admin can act on.
   * Keeps OpenAI-specific stack traces out of the syllabus row.
   */
  private userFacingEmbeddingError(message: string): string {
    const lower = message.toLowerCase();
    if (lower.includes('not configured') || lower.includes('api key')) {
      return 'OpenAI API key is not configured. Set OPENAI_API_KEY and reprocess.';
    }
    if (lower.includes('quota') || lower.includes('insufficient')) {
      return 'OpenAI quota exceeded. Top up the API plan and reprocess.';
    }
    if (lower.includes('rate limit') || lower.includes('429')) {
      return 'OpenAI rate limit hit. Wait a minute and reprocess.';
    }
    return 'AI provider error. Please retry shortly.';
  }

  /**
   * Splits `text` into overlapping chunks. Each chunk targets
   * CHUNK_TARGET_CHARS characters, biased toward a sentence/paragraph
   * boundary within ±CHUNK_BOUNDARY_WINDOW chars of the cut. Adjacent
   * chunks overlap by CHUNK_OVERLAP_CHARS chars so retrieval-time
   * boundary effects don't drop context.
   *
   * Returns chunks in order with character offsets relative to the input.
   */
  private chunkText(text: string): Array<{
    index: number;
    content: string;
    tokenCount: number;
    startOffset: number;
    endOffset: number;
  }> {
    const chunks: Array<{
      index: number;
      content: string;
      tokenCount: number;
      startOffset: number;
      endOffset: number;
    }> = [];
    const len = text.length;
    if (len === 0) return chunks;

    let cursor = 0;
    let index = 0;
    while (cursor < len) {
      const targetEnd = Math.min(cursor + CHUNK_TARGET_CHARS, len);
      let cutAt = targetEnd;

      if (targetEnd < len) {
        cutAt = this.findBoundary(text, targetEnd);
      }

      const startOffset = cursor;
      const endOffset = cutAt;
      const content = text.slice(startOffset, endOffset).trim();
      if (content.length > 0) {
        chunks.push({
          index,
          content,
          tokenCount: Math.max(1, Math.round(content.length / CHARS_PER_TOKEN)),
          startOffset,
          endOffset,
        });
        index += 1;
      }

      if (endOffset >= len) break;
      // Step forward by (target - overlap). Guard against pathological
      // boundary detection that returned a cut earlier than `cursor` —
      // never go backwards.
      const next = endOffset - CHUNK_OVERLAP_CHARS;
      cursor = next > cursor ? next : cursor + 1;
    }

    return chunks;
  }

  /**
   * Finds the best break point within ±CHUNK_BOUNDARY_WINDOW of `target`.
   * Preference order: paragraph break ("\n\n"), sentence end (`.`/`!`/`?` +
   * whitespace), then any whitespace. Falls back to `target` if nothing is
   * within the window.
   */
  private findBoundary(text: string, target: number): number {
    const lo = Math.max(0, target - CHUNK_BOUNDARY_WINDOW);
    const hi = Math.min(text.length, target + CHUNK_BOUNDARY_WINDOW);
    const window = text.slice(lo, hi);

    // Paragraph break — scan backwards from the end of the window so we
    // prefer cuts closer to the target without going past it more than
    // CHUNK_BOUNDARY_WINDOW chars.
    const paragraph = window.lastIndexOf('\n\n');
    if (paragraph !== -1) return lo + paragraph + 2;

    // Sentence boundary — find the rightmost `[.!?]` followed by whitespace.
    const sentenceMatches = [...window.matchAll(/[.!?](\s|$)/g)];
    if (sentenceMatches.length > 0) {
      const last = sentenceMatches[sentenceMatches.length - 1];
      // matchAll returns RegExpMatchArray with `index` set.
      const idx = (last?.index ?? 0) + 1; // include the punctuation
      return lo + idx;
    }

    // Any whitespace fallback.
    const whitespace = window.lastIndexOf(' ');
    if (whitespace !== -1) return lo + whitespace + 1;

    return target;
  }

  private countWords(text: string): number {
    return text.split(/\s+/).filter((w) => w.length > 0).length;
  }
}
