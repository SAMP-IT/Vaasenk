import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ExamType,
  Prisma,
  ProcessingStatus,
  type User,
} from '@prisma/client';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import {
  ListSamplePapersDto,
  UpdateSamplePaperDto,
  UploadSamplePaperDto,
} from './sample-papers.dto';
import { SamplePapersStorageService } from './sample-papers-storage.service';

/** Sample papers only accept PDFs in Sprint 3. */
const ALLOWED_SAMPLE_PAPER_MIMES: ReadonlySet<string> = new Set([
  'application/pdf',
]);

const SAMPLE_PAPER_INCLUDE = {
  class: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true } },
  syllabus: { select: { id: true, name: true, version: true, status: true } },
} satisfies Prisma.SampleQuestionPaperInclude;

type SamplePaperRow = Prisma.SampleQuestionPaperGetPayload<{
  include: typeof SAMPLE_PAPER_INCLUDE;
}>;

export type SamplePaperView = Omit<
  SamplePaperRow,
  'fileUrl' | 'fileSizeBytes'
> & {
  filePath: string;
  fileSizeBytes: number | null;
};

export type SamplePaperDetailView = SamplePaperView & {
  fileSignedUrl: string | null;
  processingTimeline: Array<{ status: ProcessingStatus; at: Date }>;
  errorMessage: string | null;
};

interface SamplePaperProcessJobData {
  samplePaperId: string;
  institutionId: string;
  filePath: string;
  fileSizeBytes: number | null;
}

/**
 * `SampleQuestionPaper.status` is typed as `ProcessingStatus` (UPLOADED,
 * PROCESSING, AI_READY, FAILED) — there's no ARCHIVED enum value available
 * without a schema migration. Soft-delete is therefore encoded as a flag
 * on `extractionMeta.deletedAt` and filtered out of list responses. Sprint
 * 4+ may add a dedicated column if archival behavior becomes more
 * sophisticated (e.g., audit-grade trail).
 */
const DELETED_META_KEY = 'deletedAt';

@Injectable()
export class SamplePapersService {
  private readonly logger = new Logger(SamplePapersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SamplePapersStorageService,
    private readonly subscriptions: SubscriptionsService,
    @InjectQueue('sample-papers') private readonly samplePapersQueue: Queue,
  ) {}

  // ---------------------------------------------------------------------------
  // POST /sample-papers — upload
  // ---------------------------------------------------------------------------

  async upload(
    actor: User,
    dto: UploadSamplePaperDto,
    file: Express.Multer.File | undefined,
  ): Promise<{ samplePaper: SamplePaperView }> {
    if (!file) {
      throw new BadRequestException('File is required (multipart field "file")');
    }
    if (!ALLOWED_SAMPLE_PAPER_MIMES.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type "${file.mimetype}". Only application/pdf is accepted.`,
      );
    }

    const institutionId = actor.institutionId;
    await this.assertReferences(
      institutionId,
      dto.classId,
      dto.subjectId,
      dto.syllabusId,
    );

    // Sprint 8.1 — pre-flight storage cap check.
    await this.subscriptions.ensureStorageAvailable(institutionId, file.size);

    const samplePaperId = randomUUID();
    const filename = SamplePapersStorageService.sanitizeFilename(
      file.originalname || 'sample-paper.pdf',
    );
    const filePath = `${institutionId}/sample-papers/${samplePaperId}/${filename}`;

    // Upload BEFORE creating the row (no orphan DB rows on storage failure).
    await this.storage.uploadObject(filePath, file.buffer, file.mimetype);
    await this.subscriptions.incrementStorageUsed(institutionId, file.size);

    const created = await this.prisma.sampleQuestionPaper.create({
      data: {
        id: samplePaperId,
        institutionId,
        ...(dto.classId !== undefined && { classId: dto.classId }),
        ...(dto.subjectId !== undefined && { subjectId: dto.subjectId }),
        ...(dto.syllabusId !== undefined && { syllabusId: dto.syllabusId }),
        ...(dto.boardType !== undefined && { boardType: dto.boardType }),
        name: dto.name.trim(),
        examType: dto.examType,
        ...(dto.year !== undefined && { year: dto.year }),
        ...(dto.term !== undefined && { term: dto.term }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        fileUrl: filePath,
        fileSizeBytes: BigInt(file.size),
        status: ProcessingStatus.UPLOADED,
      },
      include: SAMPLE_PAPER_INCLUDE,
    });

    await this.enqueueProcessJob({
      samplePaperId: created.id,
      institutionId,
      filePath,
      fileSizeBytes: file.size,
    });

    const advanced = await this.prisma.sampleQuestionPaper.update({
      where: { id: created.id },
      data: { status: ProcessingStatus.PROCESSING },
      include: SAMPLE_PAPER_INCLUDE,
    });

    await this.prisma.auditLog.create({
      data: {
        institutionId,
        actorId: actor.id,
        action: 'sample_paper.create',
        entityType: 'SampleQuestionPaper',
        entityId: created.id,
        metadata: {
          name: dto.name,
          examType: dto.examType,
          year: dto.year ?? null,
          fileSizeBytes: file.size,
        },
      },
    });

    return { samplePaper: this.toView(advanced) };
  }

  // ---------------------------------------------------------------------------
  // GET /sample-papers — list with filters
  // ---------------------------------------------------------------------------

  async list(
    actor: User,
    query: ListSamplePapersDto,
  ): Promise<{
    data: SamplePaperView[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.SampleQuestionPaperWhereInput = {
      institutionId: actor.institutionId,
      // Exclude soft-deleted rows (extractionMeta.deletedAt is non-null).
      NOT: {
        extractionMeta: {
          path: [DELETED_META_KEY],
          not: Prisma.AnyNull,
        },
      },
    };
    if (query.examType) where.examType = query.examType;
    if (query.status) where.status = query.status;
    if (query.classId) where.classId = query.classId;
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.syllabusId) where.syllabusId = query.syllabusId;
    if (query.search) {
      const needle = query.search.trim();
      if (needle.length > 0) {
        where.name = { contains: needle, mode: 'insensitive' };
      }
    }

    const orderBy = this.buildOrderBy(query.sort);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.sampleQuestionPaper.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: SAMPLE_PAPER_INCLUDE,
      }),
      this.prisma.sampleQuestionPaper.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.toView(r)),
      meta: { page, limit, total },
    };
  }

  // ---------------------------------------------------------------------------
  // GET /sample-papers/:id — detail
  // ---------------------------------------------------------------------------

  async detail(
    actor: User,
    id: string,
  ): Promise<{ samplePaper: SamplePaperDetailView }> {
    const row = await this.loadForActor(actor, id);
    const fileSignedUrl = await this.storage.getSignedUrl(row.fileUrl);

    const detail: SamplePaperDetailView = {
      ...this.toView(row),
      fileSignedUrl,
      processingTimeline: this.buildProcessingTimeline(row),
      errorMessage: row.errorMessage,
    };

    return { samplePaper: detail };
  }

  // ---------------------------------------------------------------------------
  // PATCH /sample-papers/:id — metadata OR file replacement
  // ---------------------------------------------------------------------------

  async update(
    actor: User,
    id: string,
    dto: UpdateSamplePaperDto,
    file: Express.Multer.File | undefined,
  ): Promise<{ samplePaper: SamplePaperView }> {
    const existing = await this.loadForActor(actor, id);

    if (file) {
      return this.replaceFile(actor, existing, dto, file);
    }

    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('No fields supplied for update');
    }

    await this.assertReferences(
      actor.institutionId,
      dto.classId,
      dto.subjectId,
      dto.syllabusId,
    );

    const data: Prisma.SampleQuestionPaperUpdateInput = {
      ...(dto.name !== undefined && { name: dto.name.trim() }),
      ...(dto.examType !== undefined && { examType: dto.examType }),
      ...(dto.year !== undefined && { year: dto.year }),
      ...(dto.term !== undefined && { term: dto.term }),
      ...(dto.boardType !== undefined && { boardType: dto.boardType }),
      ...(dto.classId !== undefined && {
        class: { connect: { id: dto.classId } },
      }),
      ...(dto.subjectId !== undefined && {
        subject: { connect: { id: dto.subjectId } },
      }),
      ...(dto.syllabusId !== undefined && {
        syllabus: { connect: { id: dto.syllabusId } },
      }),
      ...(dto.priority !== undefined && { priority: dto.priority }),
    };

    const updated = await this.prisma.sampleQuestionPaper.update({
      where: { id: existing.id },
      data,
      include: SAMPLE_PAPER_INCLUDE,
    });

    await this.prisma.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        actorId: actor.id,
        action: 'sample_paper.update',
        entityType: 'SampleQuestionPaper',
        entityId: existing.id,
        metadata: { fields: Object.keys(dto) },
      },
    });

    return { samplePaper: this.toView(updated) };
  }

  /**
   * Replaces the underlying PDF in-place. Unlike syllabus, sample papers
   * don't have an `isActive` versioning concept — admins typically replace
   * the file when fixing a botched upload, so we update the existing row,
   * upload the new bytes, and re-enqueue. The old storage object is left
   * in place (admin tooling can clean it up out-of-band).
   */
  private async replaceFile(
    actor: User,
    existing: SamplePaperRow,
    dto: UpdateSamplePaperDto,
    file: Express.Multer.File,
  ): Promise<{ samplePaper: SamplePaperView }> {
    if (!ALLOWED_SAMPLE_PAPER_MIMES.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type "${file.mimetype}". Only application/pdf is accepted.`,
      );
    }

    await this.assertReferences(
      actor.institutionId,
      dto.classId,
      dto.subjectId,
      dto.syllabusId,
    );

    const institutionId = actor.institutionId;

    // Sprint 8.1 — pre-flight on the new bytes. The old object stays in
    // place for audit-restore so the new bytes count as additional storage.
    await this.subscriptions.ensureStorageAvailable(institutionId, file.size);

    // Use a fresh sub-key so the old object stays addressable on the same
    // entity for retrieval / audit.
    const subKey = randomUUID();
    const filename = SamplePapersStorageService.sanitizeFilename(
      file.originalname || 'sample-paper.pdf',
    );
    const filePath = `${institutionId}/sample-papers/${existing.id}/${subKey}-${filename}`;
    await this.storage.uploadObject(filePath, file.buffer, file.mimetype);
    await this.subscriptions.incrementStorageUsed(institutionId, file.size);

    // Single write: update metadata + reset processing state at once. We
    // then fire the job + flip to PROCESSING in a second write so the API
    // response reflects the queued state.
    await this.prisma.sampleQuestionPaper.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.examType !== undefined && { examType: dto.examType }),
        ...(dto.year !== undefined && { year: dto.year }),
        ...(dto.term !== undefined && { term: dto.term }),
        ...(dto.boardType !== undefined && { boardType: dto.boardType }),
        ...(dto.classId !== undefined && { classId: dto.classId }),
        ...(dto.subjectId !== undefined && { subjectId: dto.subjectId }),
        ...(dto.syllabusId !== undefined && { syllabusId: dto.syllabusId }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        fileUrl: filePath,
        fileSizeBytes: BigInt(file.size),
        status: ProcessingStatus.UPLOADED,
        errorMessage: null,
        extractionMeta: Prisma.DbNull,
      },
    });

    await this.enqueueProcessJob({
      samplePaperId: existing.id,
      institutionId,
      filePath,
      fileSizeBytes: file.size,
    });

    const advanced = await this.prisma.sampleQuestionPaper.update({
      where: { id: existing.id },
      data: { status: ProcessingStatus.PROCESSING },
      include: SAMPLE_PAPER_INCLUDE,
    });

    await this.prisma.auditLog.create({
      data: {
        institutionId,
        actorId: actor.id,
        action: 'sample_paper.replace_file',
        entityType: 'SampleQuestionPaper',
        entityId: existing.id,
        metadata: { previousFilePath: existing.fileUrl },
      },
    });

    return { samplePaper: this.toView(advanced) };
  }

  // ---------------------------------------------------------------------------
  // POST /sample-papers/:id/reprocess
  // ---------------------------------------------------------------------------

  async reprocess(
    actor: User,
    id: string,
  ): Promise<{ samplePaper: SamplePaperView }> {
    const existing = await this.loadForActor(actor, id);

    if (
      existing.status !== ProcessingStatus.FAILED &&
      existing.status !== ProcessingStatus.AI_READY
    ) {
      throw new ConflictException(
        `Cannot reprocess a sample paper in status ${existing.status}. ` +
          'Only FAILED or AI_READY sample papers can be reprocessed.',
      );
    }

    const reset = await this.prisma.sampleQuestionPaper.update({
      where: { id: existing.id },
      data: {
        status: ProcessingStatus.PROCESSING,
        errorMessage: null,
      },
      include: SAMPLE_PAPER_INCLUDE,
    });

    await this.enqueueProcessJob({
      samplePaperId: existing.id,
      institutionId: existing.institutionId,
      filePath: existing.fileUrl,
      fileSizeBytes:
        existing.fileSizeBytes !== null ? Number(existing.fileSizeBytes) : null,
    });

    await this.prisma.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        actorId: actor.id,
        action: 'sample_paper.reprocess',
        entityType: 'SampleQuestionPaper',
        entityId: existing.id,
        metadata: { previousStatus: existing.status },
      },
    });

    return { samplePaper: this.toView(reset) };
  }

  // ---------------------------------------------------------------------------
  // DELETE /sample-papers/:id — soft delete (extractionMeta.deletedAt)
  // ---------------------------------------------------------------------------

  async softDelete(actor: User, id: string): Promise<void> {
    const existing = await this.loadForActor(actor, id);

    // Preserve any prior extractionMeta; merge in the deletion marker.
    const prior =
      existing.extractionMeta &&
      typeof existing.extractionMeta === 'object' &&
      !Array.isArray(existing.extractionMeta)
        ? (existing.extractionMeta as Prisma.JsonObject)
        : {};

    const nextMeta: Prisma.JsonObject = {
      ...prior,
      [DELETED_META_KEY]: new Date().toISOString(),
      deletedBy: actor.id,
    };

    await this.prisma.sampleQuestionPaper.update({
      where: { id: existing.id },
      data: { extractionMeta: nextMeta },
    });

    // Sprint 8.1 — release storage allocation for the deleted file.
    if (existing.fileSizeBytes !== null && existing.fileSizeBytes > 0n) {
      await this.subscriptions.decrementStorageUsed(
        existing.institutionId,
        Number(existing.fileSizeBytes),
      );
    }

    await this.prisma.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        actorId: actor.id,
        action: 'sample_paper.delete',
        entityType: 'SampleQuestionPaper',
        entityId: existing.id,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async loadForActor(
    actor: User,
    id: string,
  ): Promise<SamplePaperRow> {
    const row = await this.prisma.sampleQuestionPaper.findFirst({
      where: {
        id,
        institutionId: actor.institutionId,
        NOT: {
          extractionMeta: {
            path: [DELETED_META_KEY],
            not: Prisma.AnyNull,
          },
        },
      },
      include: SAMPLE_PAPER_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException('Sample paper not found');
    }
    return row;
  }

  /**
   * Verifies optional class/subject/syllabus FKs all belong to the actor's
   * institution. Run inside a `Promise.all` for slightly fewer round trips
   * — each lookup is bounded by a unique index.
   */
  private async assertReferences(
    institutionId: string,
    classId?: string,
    subjectId?: string,
    syllabusId?: string,
  ): Promise<void> {
    const checks: Array<Promise<void>> = [];
    if (classId) {
      checks.push(
        (async () => {
          const klass = await this.prisma.class.findFirst({
            where: { id: classId, institutionId },
            select: { id: true },
          });
          if (!klass) {
            throw new BadRequestException(
              'Class not found in this institution',
            );
          }
        })(),
      );
    }
    if (subjectId) {
      checks.push(
        (async () => {
          const subject = await this.prisma.subject.findFirst({
            where: { id: subjectId, institutionId },
            select: { id: true },
          });
          if (!subject) {
            throw new BadRequestException(
              'Subject not found in this institution',
            );
          }
        })(),
      );
    }
    if (syllabusId) {
      checks.push(
        (async () => {
          const syllabus = await this.prisma.syllabusDocument.findFirst({
            where: { id: syllabusId, institutionId },
            select: { id: true },
          });
          if (!syllabus) {
            throw new BadRequestException(
              'Syllabus not found in this institution',
            );
          }
        })(),
      );
    }
    await Promise.all(checks);
  }

  private async enqueueProcessJob(
    payload: SamplePaperProcessJobData,
  ): Promise<void> {
    try {
      await this.samplePapersQueue.add('process', payload, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
        jobId: `sample-papers:${payload.samplePaperId}`,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to enqueue sample paper process job for ${payload.samplePaperId}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  private buildOrderBy(
    sort: ListSamplePapersDto['sort'],
  ): Prisma.SampleQuestionPaperOrderByWithRelationInput[] {
    switch (sort) {
      case 'createdAt:asc':
        return [{ createdAt: 'asc' }];
      case 'year:desc':
        return [{ year: 'desc' }, { createdAt: 'desc' }];
      case 'createdAt:desc':
      default:
        return [{ createdAt: 'desc' }];
    }
  }

  private buildProcessingTimeline(
    row: SamplePaperRow,
  ): Array<{ status: ProcessingStatus; at: Date }> {
    const timeline: Array<{ status: ProcessingStatus; at: Date }> = [
      { status: ProcessingStatus.UPLOADED, at: row.createdAt },
    ];
    if (row.status === ProcessingStatus.UPLOADED) return timeline;

    timeline.push({
      status: ProcessingStatus.PROCESSING,
      at: row.status === ProcessingStatus.PROCESSING ? row.updatedAt : row.createdAt,
    });

    if (
      row.status === ProcessingStatus.AI_READY ||
      row.status === ProcessingStatus.FAILED
    ) {
      timeline.push({ status: row.status, at: row.updatedAt });
    }
    return timeline;
  }

  /** Re-export the ExamType enum so callers don't need a separate import. */
  static readonly ExamType = ExamType;

  private toView(row: SamplePaperRow): SamplePaperView {
    const { fileUrl, fileSizeBytes, ...rest } = row;
    return {
      ...rest,
      filePath: fileUrl,
      fileSizeBytes: fileSizeBytes !== null ? Number(fileSizeBytes) : null,
    };
  }
}
