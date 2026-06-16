import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ProcessingStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { SamplePapersStorageService } from './sample-papers-storage.service';

/**
 * Sprint 3 — Sample paper PDF processor.
 *
 * Pipeline per job:
 *   1. Re-fetch the row (institution-scoped) and confirm it still exists.
 *   2. Download the PDF bytes.
 *   3. Run `pdf-parse` to extract a single text blob + page count.
 *   4. Persist text + counts into `extractionMeta`. NO chunking and NO
 *      embedding — sample papers are referenced as whole documents when
 *      we generate question papers in Sprint 5.
 *   5. Flip status to AI_READY.
 *
 * On any failure the row is marked FAILED with a user-friendly errorMessage.
 *
 * Sprint 5 will extend this worker to extract question patterns
 * (question count, mark distribution, topic distribution) — out of scope
 * for Sprint 3.
 */

interface SamplePaperProcessJobData {
  samplePaperId: string;
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

@Processor('sample-papers')
export class SamplePapersWorker extends WorkerHost {
  private readonly logger = new Logger(SamplePapersWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SamplePapersStorageService,
  ) {
    super();
  }

  async process(job: Job<SamplePaperProcessJobData>): Promise<void> {
    if (job.name !== 'process') {
      this.logger.warn(
        `Unhandled job name "${job.name}" on sample-papers queue; skipping.`,
      );
      return;
    }

    const { samplePaperId, institutionId, filePath } = job.data;
    this.logger.log(
      `Sample paper processing started for ${samplePaperId} (institution ${institutionId})`,
    );

    try {
      const row = await this.prisma.sampleQuestionPaper.findFirst({
        where: { id: samplePaperId, institutionId },
        select: { id: true, institutionId: true, status: true, extractionMeta: true },
      });
      if (!row) {
        this.logger.warn(
          `Sample paper ${samplePaperId} not found (institution ${institutionId}) — skipping.`,
        );
        return;
      }

      const buffer = await this.storage.downloadObject(filePath);
      if (!buffer) {
        await this.markFailed(
          samplePaperId,
          institutionId,
          'Could not download the uploaded PDF from storage.',
        );
        return;
      }

      const parsed = await this.parsePdf(buffer);
      const text = (parsed.text ?? '').trim();
      if (text.length === 0) {
        await this.markFailed(
          samplePaperId,
          institutionId,
          'Could not extract text from the PDF. The file may be scanned/image-only or password-protected.',
        );
        return;
      }

      const wordCount = this.countWords(text);

      // Preserve any prior extractionMeta (e.g., the deletedAt marker is
      // never set when processing, but defensive merge keeps the contract
      // simple). Sprint 5 will add `questionPatterns`.
      const priorMeta =
        row.extractionMeta &&
        typeof row.extractionMeta === 'object' &&
        !Array.isArray(row.extractionMeta)
          ? (row.extractionMeta as Record<string, unknown>)
          : {};

      await this.prisma.sampleQuestionPaper.update({
        where: { id: samplePaperId },
        data: {
          status: ProcessingStatus.AI_READY,
          errorMessage: null,
          extractionMeta: {
            ...priorMeta,
            textContent: text,
            wordCount,
            charCount: text.length,
            pageCount: parsed.numpages ?? null,
            pdfVersion: parsed.version ?? null,
            extractedAt: new Date().toISOString(),
          },
        },
      });

      this.logger.log(
        `Sample paper ${samplePaperId} processed: ${wordCount} words, ` +
          `${parsed.numpages ?? 'unknown'} pages.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(
        `Sample paper ${samplePaperId} processing failed: ${message}`,
        stack,
      );
      await this.markFailed(
        samplePaperId,
        institutionId,
        this.userFacingError(message),
      );
    }
  }

  /**
   * Dynamically import `pdf-parse` so the worker file doesn't pull a binary
   * dependency at module-load time. Mirrors `SyllabusWorker.parsePdf`.
   */
  private async parsePdf(buffer: Buffer): Promise<PdfParseResult> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (
      data: Buffer,
    ) => Promise<PdfParseResult>;
    return pdfParse(buffer);
  }

  private async markFailed(
    samplePaperId: string,
    institutionId: string,
    message: string,
  ): Promise<void> {
    await this.prisma.sampleQuestionPaper.updateMany({
      where: { id: samplePaperId, institutionId },
      data: {
        status: ProcessingStatus.FAILED,
        errorMessage: message,
      },
    });
    this.logger.warn(
      `Sample paper ${samplePaperId} marked FAILED: ${message}`,
    );
  }

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

  private countWords(text: string): number {
    return text.split(/\s+/).filter((w) => w.length > 0).length;
  }
}
