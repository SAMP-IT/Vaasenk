import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProcessingStatus, type User } from '@prisma/client';
import { RagService, VectorStoreService } from '@vaasenk/ai';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import {
  ListMappedClassroomsDto,
  ListSyllabusDto,
  MapSyllabusDto,
  UpdateSyllabusDto,
  UploadSyllabusDto,
} from './syllabus.dto';
import { SyllabusStorageService } from './syllabus-storage.service';

/** Only PDFs are accepted in Sprint 3 (per Playbook PROMPT 15). */
const ALLOWED_SYLLABUS_MIMES: ReadonlySet<string> = new Set(['application/pdf']);

const SYLLABUS_LIST_INCLUDE = {
  class: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true } },
  _count: { select: { chunks: true, classrooms: true } },
} satisfies Prisma.SyllabusDocumentInclude;

type SyllabusRow = Prisma.SyllabusDocumentGetPayload<{
  include: typeof SYLLABUS_LIST_INCLUDE;
}>;

export type SyllabusView = Omit<SyllabusRow, 'fileUrl' | 'fileSizeBytes'> & {
  /** Raw storage path (kept for admin tooling). */
  filePath: string;
  /** Bytes; serialized as a JS number (safe under the 25MB upload cap). */
  fileSizeBytes: number | null;
};

const MAPPED_CLASSROOM_SELECT = {
  id: true,
  name: true,
  status: true,
  inviteCode: true,
  createdAt: true,
  class: { select: { id: true, name: true } },
  section: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true } },
  teacher: { select: { id: true, name: true, email: true, avatarUrl: true } },
  _count: { select: { members: true, notes: true } },
} satisfies Prisma.ClassroomSelect;

export type MappedClassroomView = Prisma.ClassroomGetPayload<{
  select: typeof MAPPED_CLASSROOM_SELECT;
}>;

export type SyllabusDetailView = SyllabusView & {
  fileSignedUrl: string | null;
  processingTimeline: Array<{ status: ProcessingStatus; at: Date }>;
  chunksCount: number;
  mappedClassrooms: MappedClassroomView[];
  errorMessage: string | null;
};

interface SyllabusProcessJobData {
  syllabusId: string;
  institutionId: string;
  filePath: string;
  fileSizeBytes: number | null;
}

@Injectable()
export class SyllabusService {
  private readonly logger = new Logger(SyllabusService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SyllabusStorageService,
    private readonly vectors: VectorStoreService,
    private readonly subscriptions: SubscriptionsService,
    @InjectQueue('syllabus') private readonly syllabusQueue: Queue,
  ) {}

  // ---------------------------------------------------------------------------
  // POST /syllabus — upload
  // ---------------------------------------------------------------------------

  async upload(
    actor: User,
    dto: UploadSyllabusDto,
    file: Express.Multer.File | undefined,
  ): Promise<{ syllabus: SyllabusView }> {
    if (!file) {
      throw new BadRequestException('File is required (multipart field "file")');
    }
    if (!ALLOWED_SYLLABUS_MIMES.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type "${file.mimetype}". Only application/pdf is accepted.`,
      );
    }

    const institutionId = actor.institutionId;
    await this.assertClassAndSubject(institutionId, dto.classId, dto.subjectId);

    // Sprint 8.1 — pre-flight storage cap check.
    await this.subscriptions.ensureStorageAvailable(institutionId, file.size);

    const syllabusId = randomUUID();
    const filename = SyllabusStorageService.sanitizeFilename(
      file.originalname || 'syllabus.pdf',
    );
    const filePath = `${institutionId}/syllabus/${syllabusId}/${filename}`;

    // Upload BEFORE creating the DB row so storage failures don't leave
    // orphan rows. ServiceUnavailableException bubbles up cleanly.
    await this.storage.uploadObject(filePath, file.buffer, file.mimetype);

    // Sprint 8.1 — track storage usage (raw upload bytes).
    await this.subscriptions.incrementStorageUsed(institutionId, file.size);

    const created = await this.prisma.syllabusDocument.create({
      data: {
        id: syllabusId,
        institutionId,
        ...(dto.classId !== undefined && { classId: dto.classId }),
        ...(dto.subjectId !== undefined && { subjectId: dto.subjectId }),
        ...(dto.boardType !== undefined && { boardType: dto.boardType }),
        name: dto.name.trim(),
        ...(dto.language !== undefined && { language: dto.language }),
        version: dto.version?.trim() || 'v1',
        fileUrl: filePath,
        fileSizeBytes: BigInt(file.size),
        status: ProcessingStatus.UPLOADED,
        isActive: false,
      },
      include: SYLLABUS_LIST_INCLUDE,
    });

    await this.enqueueProcessJob({
      syllabusId: created.id,
      institutionId,
      filePath,
      fileSizeBytes: file.size,
    });

    // Flip to PROCESSING immediately so the UI doesn't show a stale UPLOADED.
    const advanced = await this.prisma.syllabusDocument.update({
      where: { id: created.id },
      data: { status: ProcessingStatus.PROCESSING },
      include: SYLLABUS_LIST_INCLUDE,
    });

    await this.prisma.auditLog.create({
      data: {
        institutionId,
        actorId: actor.id,
        action: 'syllabus.create',
        entityType: 'SyllabusDocument',
        entityId: created.id,
        metadata: {
          name: dto.name,
          classId: dto.classId ?? null,
          subjectId: dto.subjectId ?? null,
          fileSizeBytes: file.size,
        },
      },
    });

    return { syllabus: this.toView(advanced) };
  }

  // ---------------------------------------------------------------------------
  // GET /syllabus — list with filters
  // ---------------------------------------------------------------------------

  async list(
    actor: User,
    query: ListSyllabusDto,
  ): Promise<{
    data: SyllabusView[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.SyllabusDocumentWhereInput = {
      institutionId: actor.institutionId,
    };
    if (query.status) where.status = query.status;
    if (query.classId) where.classId = query.classId;
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.boardType) where.boardType = query.boardType;
    if (typeof query.isActive === 'boolean') where.isActive = query.isActive;
    if (query.search) {
      const needle = query.search.trim();
      if (needle.length > 0) {
        where.name = { contains: needle, mode: 'insensitive' };
      }
    }

    const orderBy = this.buildOrderBy(query.sort);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.syllabusDocument.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: SYLLABUS_LIST_INCLUDE,
      }),
      this.prisma.syllabusDocument.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.toView(r)),
      meta: { page, limit, total },
    };
  }

  // ---------------------------------------------------------------------------
  // GET /syllabus/:id — detail
  // ---------------------------------------------------------------------------

  async detail(
    actor: User,
    id: string,
  ): Promise<{ syllabus: SyllabusDetailView }> {
    const row = await this.loadForActor(actor, id);

    const [fileSignedUrl, mappedClassrooms] = await Promise.all([
      this.storage.getSignedUrl(row.fileUrl),
      this.prisma.classroom.findMany({
        where: {
          institutionId: actor.institutionId,
          syllabusId: row.id,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: MAPPED_CLASSROOM_SELECT,
      }),
    ]);

    const detail: SyllabusDetailView = {
      ...this.toView(row),
      fileSignedUrl,
      processingTimeline: this.buildProcessingTimeline(row),
      chunksCount: row._count.chunks,
      mappedClassrooms,
      errorMessage: row.errorMessage,
    };

    return { syllabus: detail };
  }

  // ---------------------------------------------------------------------------
  // PATCH /syllabus/:id — metadata OR file replacement
  // ---------------------------------------------------------------------------

  async update(
    actor: User,
    id: string,
    dto: UpdateSyllabusDto,
    file: Express.Multer.File | undefined,
  ): Promise<{ syllabus: SyllabusView }> {
    const existing = await this.loadForActor(actor, id);

    if (file) {
      return this.replaceFile(actor, existing, dto, file);
    }

    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('No fields supplied for update');
    }

    await this.assertClassAndSubject(
      actor.institutionId,
      dto.classId,
      dto.subjectId,
    );

    const data: Prisma.SyllabusDocumentUpdateInput = {
      ...(dto.name !== undefined && { name: dto.name.trim() }),
      ...(dto.boardType !== undefined && { boardType: dto.boardType }),
      ...(dto.classId !== undefined && {
        class: { connect: { id: dto.classId } },
      }),
      ...(dto.subjectId !== undefined && {
        subject: { connect: { id: dto.subjectId } },
      }),
      ...(dto.language !== undefined && { language: dto.language }),
      ...(dto.version !== undefined && { version: dto.version.trim() || 'v1' }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    };

    const updated = await this.prisma.syllabusDocument.update({
      where: { id: existing.id },
      data,
      include: SYLLABUS_LIST_INCLUDE,
    });

    await this.prisma.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        actorId: actor.id,
        action: 'syllabus.update',
        entityType: 'SyllabusDocument',
        entityId: existing.id,
        metadata: { fields: Object.keys(dto) },
      },
    });

    return { syllabus: this.toView(updated) };
  }

  /**
   * File-replacement branch of PATCH. Creates a NEW SyllabusDocument row
   * with bumped version, marks the OLD row `isActive: false`, uploads the
   * new bytes, and kicks off processing. Preserves history so existing
   * classroom references to the old row keep working.
   */
  private async replaceFile(
    actor: User,
    existing: SyllabusRow,
    dto: UpdateSyllabusDto,
    file: Express.Multer.File,
  ): Promise<{ syllabus: SyllabusView }> {
    if (!ALLOWED_SYLLABUS_MIMES.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type "${file.mimetype}". Only application/pdf is accepted.`,
      );
    }

    await this.assertClassAndSubject(
      actor.institutionId,
      dto.classId,
      dto.subjectId,
    );

    const institutionId = actor.institutionId;

    // Sprint 8.1 — pre-flight storage cap check on the new version's bytes.
    // The previous version stays in the bucket (admin restore), so this
    // counts as additional storage.
    await this.subscriptions.ensureStorageAvailable(institutionId, file.size);

    const newId = randomUUID();
    const filename = SyllabusStorageService.sanitizeFilename(
      file.originalname || 'syllabus.pdf',
    );
    const filePath = `${institutionId}/syllabus/${newId}/${filename}`;
    await this.storage.uploadObject(filePath, file.buffer, file.mimetype);

    // Track the new version's bytes.
    await this.subscriptions.incrementStorageUsed(institutionId, file.size);

    const nextVersion =
      dto.version?.trim() || this.bumpVersion(existing.version);

    // Transactional: deactivate the old row + create the new row together
    // so the "exactly one active version" invariant can't be violated by a
    // mid-flight crash.
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.syllabusDocument.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
      return tx.syllabusDocument.create({
        data: {
          id: newId,
          institutionId,
          classId: dto.classId ?? existing.classId,
          subjectId: dto.subjectId ?? existing.subjectId,
          boardType: dto.boardType ?? existing.boardType,
          name: (dto.name ?? existing.name).trim(),
          language: dto.language ?? existing.language,
          version: nextVersion,
          fileUrl: filePath,
          fileSizeBytes: BigInt(file.size),
          status: ProcessingStatus.UPLOADED,
          // The new version starts inactive unless the caller explicitly
          // opts it in; admins typically test before promoting.
          isActive: dto.isActive ?? false,
        },
        include: SYLLABUS_LIST_INCLUDE,
      });
    });

    await this.enqueueProcessJob({
      syllabusId: created.id,
      institutionId,
      filePath,
      fileSizeBytes: file.size,
    });

    const advanced = await this.prisma.syllabusDocument.update({
      where: { id: created.id },
      data: { status: ProcessingStatus.PROCESSING },
      include: SYLLABUS_LIST_INCLUDE,
    });

    await this.prisma.auditLog.create({
      data: {
        institutionId,
        actorId: actor.id,
        action: 'syllabus.replace_file',
        entityType: 'SyllabusDocument',
        entityId: created.id,
        metadata: {
          previousId: existing.id,
          previousVersion: existing.version,
          newVersion: nextVersion,
        },
      },
    });

    return { syllabus: this.toView(advanced) };
  }

  // ---------------------------------------------------------------------------
  // POST /syllabus/:id/map — map syllabus to classroom(s)
  // ---------------------------------------------------------------------------

  async mapToClassrooms(
    actor: User,
    id: string,
    dto: MapSyllabusDto,
  ): Promise<{ mapped: number }> {
    const existing = await this.loadForActor(actor, id);

    // Verify ALL target classrooms belong to the same institution. We don't
    // disclose which classroom failed — generic 404 per CLAUDE.md §3.
    const uniqueIds = Array.from(new Set(dto.classroomIds));
    const found = await this.prisma.classroom.count({
      where: {
        id: { in: uniqueIds },
        institutionId: actor.institutionId,
      },
    });
    if (found !== uniqueIds.length) {
      throw new NotFoundException(
        'One or more classrooms not found in this institution',
      );
    }

    const result = await this.prisma.classroom.updateMany({
      where: {
        id: { in: uniqueIds },
        institutionId: actor.institutionId,
      },
      data: { syllabusId: existing.id },
    });

    await this.prisma.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        actorId: actor.id,
        action: 'syllabus.map_classrooms',
        entityType: 'SyllabusDocument',
        entityId: existing.id,
        metadata: { classroomIds: uniqueIds, mapped: result.count },
      },
    });

    return { mapped: result.count };
  }

  // ---------------------------------------------------------------------------
  // GET /syllabus/:id/classrooms — list mapped classrooms (paginated)
  // ---------------------------------------------------------------------------

  async listMappedClassrooms(
    actor: User,
    id: string,
    query: ListMappedClassroomsDto,
  ): Promise<{
    data: MappedClassroomView[];
    meta: { page: number; limit: number; total: number };
  }> {
    const existing = await this.loadForActor(actor, id);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.ClassroomWhereInput = {
      institutionId: actor.institutionId,
      syllabusId: existing.id,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.classroom.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: MAPPED_CLASSROOM_SELECT,
      }),
      this.prisma.classroom.count({ where }),
    ]);

    return { data, meta: { page, limit, total } };
  }

  // ---------------------------------------------------------------------------
  // POST /syllabus/:id/reprocess — re-run extraction
  // ---------------------------------------------------------------------------

  async reprocess(
    actor: User,
    id: string,
  ): Promise<{ syllabus: SyllabusView }> {
    const existing = await this.loadForActor(actor, id);

    if (
      existing.status !== ProcessingStatus.FAILED &&
      existing.status !== ProcessingStatus.AI_READY
    ) {
      throw new ConflictException(
        `Cannot reprocess a syllabus in status ${existing.status}. ` +
          'Only FAILED or AI_READY syllabi can be reprocessed.',
      );
    }

    // Clear vectors FIRST so we don't briefly leave stale embeddings
    // pointing at chunks that are about to be deleted (the vectors carry
    // chunkId FKs with ON DELETE CASCADE, but deleting in this order keeps
    // the namespace empty while the worker rebuilds it).
    const namespace = RagService.buildNamespace(
      actor.institutionId,
      existing.id,
    );
    await this.vectors.deleteByNamespace(actor.institutionId, namespace);

    // Clear chunks so the new extraction produces a clean set.
    await this.prisma.syllabusChunk.deleteMany({
      where: {
        syllabusId: existing.id,
        institutionId: actor.institutionId,
      },
    });

    const reset = await this.prisma.syllabusDocument.update({
      where: { id: existing.id },
      data: {
        status: ProcessingStatus.PROCESSING,
        errorMessage: null,
      },
      include: SYLLABUS_LIST_INCLUDE,
    });

    await this.enqueueProcessJob({
      syllabusId: existing.id,
      institutionId: existing.institutionId,
      filePath: existing.fileUrl,
      fileSizeBytes:
        existing.fileSizeBytes !== null ? Number(existing.fileSizeBytes) : null,
    });

    await this.prisma.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        actorId: actor.id,
        action: 'syllabus.reprocess',
        entityType: 'SyllabusDocument',
        entityId: existing.id,
        metadata: { previousStatus: existing.status },
      },
    });

    return { syllabus: this.toView(reset) };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Loads a syllabus row enforcing institution scope. Throws 404 if the
   * row doesn't exist OR belongs to another tenant — non-disclosure per
   * CLAUDE.md §3.
   */
  private async loadForActor(actor: User, id: string): Promise<SyllabusRow> {
    const row = await this.prisma.syllabusDocument.findFirst({
      where: { id, institutionId: actor.institutionId },
      include: SYLLABUS_LIST_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException('Syllabus not found');
    }
    return row;
  }

  /**
   * Verifies that optional class/subject FKs belong to the same institution.
   * Skipped when both are undefined.
   */
  private async assertClassAndSubject(
    institutionId: string,
    classId?: string,
    subjectId?: string,
  ): Promise<void> {
    if (classId) {
      const klass = await this.prisma.class.findFirst({
        where: { id: classId, institutionId },
        select: { id: true },
      });
      if (!klass) {
        throw new BadRequestException('Class not found in this institution');
      }
    }
    if (subjectId) {
      const subject = await this.prisma.subject.findFirst({
        where: { id: subjectId, institutionId },
        select: { id: true },
      });
      if (!subject) {
        throw new BadRequestException('Subject not found in this institution');
      }
    }
  }

  /**
   * Enqueues the syllabus PDF processing job. Carries `institutionId` in
   * the payload (CLAUDE.md §3 + skill §9). `jobId` dedupes concurrent
   * enqueues for the same syllabus.
   */
  private async enqueueProcessJob(
    payload: SyllabusProcessJobData,
  ): Promise<void> {
    try {
      await this.syllabusQueue.add('process', payload, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
        jobId: `syllabus:${payload.syllabusId}`,
      });
    } catch (err) {
      // Don't fail the HTTP path if Redis is unreachable in dev — the row
      // sits in PROCESSING until a worker drains it (or the admin reprocesses).
      this.logger.warn(
        `Failed to enqueue syllabus process job for ${payload.syllabusId}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  private buildOrderBy(
    sort: ListSyllabusDto['sort'],
  ): Prisma.SyllabusDocumentOrderByWithRelationInput[] {
    switch (sort) {
      case 'createdAt:asc':
        return [{ createdAt: 'asc' }];
      case 'name:asc':
        return [{ name: 'asc' }, { createdAt: 'desc' }];
      case 'createdAt:desc':
      default:
        return [{ createdAt: 'desc' }];
    }
  }

  /**
   * Derives a best-effort processing timeline from createdAt/updatedAt +
   * current status. Sprint 4+ will likely move this to a real audit table
   * with per-transition timestamps; for now the frontend just needs a
   * sensible 2-4 entry list to render the progress strip.
   */
  private buildProcessingTimeline(
    row: SyllabusRow,
  ): Array<{ status: ProcessingStatus; at: Date }> {
    const timeline: Array<{ status: ProcessingStatus; at: Date }> = [
      { status: ProcessingStatus.UPLOADED, at: row.createdAt },
    ];

    if (row.status === ProcessingStatus.UPLOADED) return timeline;

    // PROCESSING transition: best-effort placeholder between create/update.
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

  /**
   * Bumps a version string. Recognizes "v<integer>" patterns and increments
   * them; anything else gets "-r<timestamp>" appended so the new value is
   * guaranteed-different from the old.
   */
  private bumpVersion(current: string): string {
    const match = /^v(\d+)$/i.exec(current.trim());
    if (match) {
      const next = parseInt(match[1] ?? '1', 10) + 1;
      return `v${next}`;
    }
    return `${current.trim()}-r${Date.now()}`;
  }

  /**
   * Projects a Prisma row to the public view. BigInt fileSizeBytes coerces
   * to JS number (safe under the 25MB upload cap, well below 2^53).
   */
  private toView(row: SyllabusRow): SyllabusView {
    const { fileUrl, fileSizeBytes, ...rest } = row;
    return {
      ...rest,
      filePath: fileUrl,
      fileSizeBytes: fileSizeBytes !== null ? Number(fileSizeBytes) : null,
    };
  }
}
