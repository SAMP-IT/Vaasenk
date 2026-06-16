import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  NoteStatus,
  NoteTag,
  NotificationType,
  Prisma,
  Status,
  UserRole,
  type User,
} from '@prisma/client';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClassroomsService } from '../classrooms/classrooms.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import {
  ListBookmarksDto,
  ListNotesDto,
  UpdateNoteDto,
  UploadNoteDto,
} from './notes.dto';
import { NotesStorageService } from './notes-storage.service';

/** MIME types accepted by the upload endpoint — validated server-side. */
const ALLOWED_NOTE_MIMES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
]);

/** Threshold above which images are downscaled + recompressed. */
const IMAGE_COMPRESS_THRESHOLD_BYTES = 5 * 1024 * 1024;

const NOTE_LIST_INCLUDE = {
  teacher: { select: { id: true, name: true, email: true, avatarUrl: true } },
  classroom: { select: { id: true, name: true } },
  bookmarks: { select: { userId: true } },
} satisfies Prisma.NoteInclude;

type NoteRow = Prisma.NoteGetPayload<{ include: typeof NOTE_LIST_INCLUDE }>;

export type NoteView = Omit<NoteRow, 'fileUrl' | 'thumbnailUrl' | 'bookmarks'> & {
  /** Raw storage path (kept for admin tooling / debugging). */
  filePath: string | null;
  thumbnailPath: string | null;
  /** Per-request signed URLs (1h expiry). */
  fileSignedUrl: string | null;
  thumbnailSignedUrl: string | null;
  bookmarkedByMe: boolean;
};

@Injectable()
export class NotesService {
  private readonly logger = new Logger(NotesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: NotesStorageService,
    private readonly classrooms: ClassroomsService,
    private readonly notifications: NotificationsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly audit: AuditService,
    @InjectQueue('notes') private readonly notesQueue: Queue,
  ) {}

  // ---------------------------------------------------------------------------
  // POST /classrooms/:id/notes — upload
  // ---------------------------------------------------------------------------

  async upload(
    actor: User,
    classroomId: string,
    dto: UploadNoteDto,
    file: Express.Multer.File | undefined,
  ): Promise<{ note: NoteView }> {
    if (!file) {
      throw new BadRequestException(
        'File is required (multipart field "file")',
      );
    }
    if (!ALLOWED_NOTE_MIMES.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type "${file.mimetype}". ` +
          `Allowed: ${[...ALLOWED_NOTE_MIMES].join(', ')}`,
      );
    }

    // Verify the actor can act on this classroom. Admins of the institution
    // and teachers (assigned or member) may upload. Students cannot.
    const classroom = await this.classrooms.assertVisible(actor, classroomId);
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }
    if (
      actor.role !== UserRole.ADMIN &&
      actor.role !== UserRole.SUPER_ADMIN &&
      actor.role !== UserRole.TEACHER
    ) {
      throw new ForbiddenException('Only teachers and admins can upload notes');
    }

    const institutionId = classroom.institutionId;

    // Sprint 8.1 — pre-flight storage cap check. Use file.size (raw upload
    // bytes); thumbnails generated server-side aren't counted.
    await this.subscriptions.ensureStorageAvailable(institutionId, file.size);

    const noteId = randomUUID();
    const isImage = file.mimetype.startsWith('image/');

    // Compress images > 5 MB. Preserve PDFs/text untouched.
    let bodyBuffer = file.buffer;
    let storedMime = file.mimetype;
    let storedExt = NotesStorageService.sanitizeFilename(
      file.originalname || 'upload',
    );
    if (isImage && file.size > IMAGE_COMPRESS_THRESHOLD_BYTES) {
      try {
        bodyBuffer = await sharp(file.buffer)
          .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
        storedMime = 'image/jpeg';
        // Replace any prior extension with .jpg to match the recompressed bytes.
        storedExt = storedExt.replace(/\.[A-Za-z0-9]{1,5}$/, '') + '.jpg';
      } catch (err) {
        this.logger.warn(
          `sharp compression failed for note ${noteId}; falling back to original buffer: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    const filePath = `${institutionId}/${classroomId}/${noteId}/${storedExt}`;
    await this.storage.uploadObject(filePath, bodyBuffer, storedMime);

    // Generate thumbnail for images.
    let thumbnailPath: string | null = null;
    if (isImage) {
      try {
        const thumb = await sharp(file.buffer)
          .resize(400, 400, { fit: 'cover' })
          .jpeg({ quality: 75 })
          .toBuffer();
        thumbnailPath = `${institutionId}/${classroomId}/${noteId}/thumb.jpg`;
        await this.storage.uploadObject(thumbnailPath, thumb, 'image/jpeg');
      } catch (err) {
        this.logger.warn(
          `Thumbnail generation failed for note ${noteId}: ` +
            (err instanceof Error ? err.message : String(err)),
        );
        thumbnailPath = null;
      }
    }

    const status = dto.status ?? NoteStatus.DRAFT;
    const publishedAt = status === NoteStatus.PUBLISHED ? new Date() : null;

    const created = await this.prisma.note.create({
      data: {
        id: noteId,
        institutionId,
        classroomId,
        teacherId: actor.id,
        title: dto.title.trim(),
        ...(dto.description !== undefined && {
          description: dto.description.trim(),
        }),
        fileUrl: filePath,
        fileType: storedMime,
        fileSizeBytes: BigInt(bodyBuffer.length),
        ...(thumbnailPath && { thumbnailUrl: thumbnailPath }),
        tags: this.normalizeTags(dto.tags),
        status,
        publishedAt,
      },
      include: NOTE_LIST_INCLUDE,
    });

    if (status === NoteStatus.PUBLISHED) {
      await this.fanoutPublishNotifications(created);
      await this.enqueueOcrJob(created);
    }

    // Sprint 8.1 — track storage usage. Counts the bytes actually stored
    // (after server-side compression). Approximate — server-generated
    // thumbnails are NOT included in the count.
    await this.subscriptions.incrementStorageUsed(institutionId, bodyBuffer.length);

    await this.audit.write({
      institutionId,
      actorId: actor.id,
      action: 'note.create',
      entityType: 'Note',
      entityId: created.id,
      metadata: {
        classroomId,
        title: dto.title.trim(),
        fileSizeBytes: bodyBuffer.length,
        status,
      },
    });

    return { note: await this.toView(created, actor.id) };
  }

  // ---------------------------------------------------------------------------
  // GET /classrooms/:id/notes — list
  // ---------------------------------------------------------------------------

  async listInClassroom(
    actor: User,
    classroomId: string,
    query: ListNotesDto,
  ): Promise<{
    data: NoteView[];
    meta: { page: number; limit: number; total: number };
  }> {
    const classroom = await this.classrooms.assertVisible(actor, classroomId);
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.NoteWhereInput = {
      institutionId: classroom.institutionId,
      classroomId: classroom.id,
    };

    // Status defaults differ by role:
    //   STUDENT  → PUBLISHED only (never sees DRAFTs)
    //   TEACHER/ADMIN → any-status except ARCHIVED unless explicitly requested
    if (actor.role === UserRole.STUDENT) {
      where.status = NoteStatus.PUBLISHED;
    } else if (query.status) {
      where.status = query.status;
    } else {
      where.status = { not: NoteStatus.ARCHIVED };
    }

    if (query.tag) {
      where.tags = { has: query.tag };
    }
    if (query.search) {
      const needle = query.search.trim();
      if (needle.length > 0) {
        where.OR = [
          { title: { contains: needle, mode: 'insensitive' } },
          { description: { contains: needle, mode: 'insensitive' } },
        ];
      }
    }

    const orderBy = this.buildOrderBy(query.sort);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.note.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: NOTE_LIST_INCLUDE,
      }),
      this.prisma.note.count({ where }),
    ]);

    const data = await Promise.all(rows.map((r) => this.toView(r, actor.id)));
    return { data, meta: { page, limit, total } };
  }

  // ---------------------------------------------------------------------------
  // GET /notes/:id
  // ---------------------------------------------------------------------------

  async detail(actor: User, id: string): Promise<{ note: NoteView }> {
    const note = await this.loadNoteForActor(actor, id);
    return { note: await this.toView(note, actor.id) };
  }

  // ---------------------------------------------------------------------------
  // PATCH /notes/:id
  // ---------------------------------------------------------------------------

  async update(
    actor: User,
    id: string,
    dto: UpdateNoteDto,
  ): Promise<{ note: NoteView }> {
    const existing = await this.loadNoteForActor(actor, id);

    // Only the note's teacher OR admins can mutate.
    const isOwner =
      actor.role === UserRole.TEACHER && existing.teacherId === actor.id;
    const isAdmin =
      actor.role === UserRole.ADMIN || actor.role === UserRole.SUPER_ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Only the note author or an admin can edit this note',
      );
    }

    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('No fields supplied for update');
    }

    const transitionToPublished =
      dto.status === NoteStatus.PUBLISHED &&
      existing.status !== NoteStatus.PUBLISHED;

    const data: Prisma.NoteUpdateInput = {
      ...(dto.title !== undefined && { title: dto.title.trim() }),
      ...(dto.description !== undefined && {
        description: dto.description.trim(),
      }),
      ...(dto.tags !== undefined && { tags: { set: this.normalizeTags(dto.tags) } }),
      ...(dto.status !== undefined && { status: dto.status }),
      ...(transitionToPublished && { publishedAt: new Date() }),
    };

    const updated = await this.prisma.note.update({
      where: { id: existing.id },
      data,
      include: NOTE_LIST_INCLUDE,
    });

    if (transitionToPublished) {
      await this.fanoutPublishNotifications(updated);
      await this.enqueueOcrJob(updated);
    }

    return { note: await this.toView(updated, actor.id) };
  }

  // ---------------------------------------------------------------------------
  // DELETE /notes/:id — soft delete (status → ARCHIVED)
  // ---------------------------------------------------------------------------

  async softDelete(actor: User, id: string): Promise<void> {
    const existing = await this.loadNoteForActor(actor, id);

    const isOwner =
      actor.role === UserRole.TEACHER && existing.teacherId === actor.id;
    const isAdmin =
      actor.role === UserRole.ADMIN || actor.role === UserRole.SUPER_ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Only the note author or an admin can delete this note',
      );
    }

    if (existing.status === NoteStatus.ARCHIVED) {
      return;
    }

    await this.prisma.note.update({
      where: { id: existing.id },
      data: { status: NoteStatus.ARCHIVED },
    });

    // Sprint 8.1 — release the storage allocation. The bucket object stays
    // (admin restore is still possible) but the accounting reflects that
    // the file is no longer surface-area for students/teachers.
    if (existing.fileSizeBytes !== null && existing.fileSizeBytes > 0n) {
      await this.subscriptions.decrementStorageUsed(
        existing.institutionId,
        Number(existing.fileSizeBytes),
      );
    }

    await this.audit.write({
      institutionId: existing.institutionId,
      actorId: actor.id,
      action: 'note.delete',
      entityType: 'Note',
      entityId: existing.id,
      metadata: { classroomId: existing.classroomId },
    });
  }

  // ---------------------------------------------------------------------------
  // POST /notes/:id/bookmark — toggle
  // ---------------------------------------------------------------------------

  async toggleBookmark(
    actor: User,
    noteId: string,
  ): Promise<{ bookmarked: boolean }> {
    const note = await this.loadNoteForActor(actor, noteId);

    const existing = await this.prisma.bookmark.findUnique({
      where: { userId_noteId: { userId: actor.id, noteId: note.id } },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.bookmark.delete({ where: { id: existing.id } });
      return { bookmarked: false };
    }

    await this.prisma.bookmark.create({
      data: {
        institutionId: note.institutionId,
        userId: actor.id,
        noteId: note.id,
      },
    });
    return { bookmarked: true };
  }

  // ---------------------------------------------------------------------------
  // GET /bookmarks — current user's bookmarks
  // ---------------------------------------------------------------------------

  async listBookmarks(
    actor: User,
    query: ListBookmarksDto,
  ): Promise<{
    data: NoteView[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.BookmarkWhereInput = {
      institutionId: actor.institutionId,
      userId: actor.id,
      // Hide notes that have been ARCHIVED since the bookmark was created.
      note: { status: { not: NoteStatus.ARCHIVED } },
    };

    const [bookmarks, total] = await this.prisma.$transaction([
      this.prisma.bookmark.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { note: { include: NOTE_LIST_INCLUDE } },
      }),
      this.prisma.bookmark.count({ where }),
    ]);

    const data = await Promise.all(
      bookmarks.map((b) => this.toView(b.note, actor.id)),
    );
    return { data, meta: { page, limit, total } };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Loads a note enforcing visibility through the classroom. Returns 404
   * if the actor cannot see the parent classroom — non-disclosure per
   * CLAUDE.md §3.
   */
  private async loadNoteForActor(actor: User, id: string): Promise<NoteRow> {
    const note = await this.prisma.note.findFirst({
      where: { id, institutionId: actor.institutionId },
      include: NOTE_LIST_INCLUDE,
    });
    if (!note) {
      throw new NotFoundException('Note not found');
    }

    // Verify the actor can see the parent classroom.
    const classroom = await this.classrooms.assertVisible(
      actor,
      note.classroomId,
    );
    if (!classroom) {
      throw new NotFoundException('Note not found');
    }

    // Students never see DRAFT notes; flag as not-found rather than 403.
    if (actor.role === UserRole.STUDENT && note.status !== NoteStatus.PUBLISHED) {
      throw new NotFoundException('Note not found');
    }

    return note;
  }

  private buildOrderBy(
    sort: ListNotesDto['sort'],
  ): Prisma.NoteOrderByWithRelationInput[] {
    switch (sort) {
      case 'publishedAt:asc':
        return [{ publishedAt: 'asc' }, { createdAt: 'asc' }];
      case 'createdAt:desc':
        return [{ createdAt: 'desc' }];
      case 'publishedAt:desc':
      default:
        return [{ publishedAt: 'desc' }, { createdAt: 'desc' }];
    }
  }

  /**
   * Deduplicates and uppercases tag input. The Prisma column is `NoteTag[]`
   * (Postgres enum array) so anything non-enum will fail at insertion —
   * the DTO already validates via `@IsEnum(NoteTag, { each: true })`.
   */
  private normalizeTags(tags: NoteTag[] | undefined): NoteTag[] {
    if (!tags || tags.length === 0) return [];
    return Array.from(new Set(tags));
  }

  /**
   * Fan-out notifications via NotificationsService (Sprint 6). The service
   * persists rows AND pushes Socket.IO events to every connected student,
   * so the bell + toast on the student app updates within ~100ms.
   */
  private async fanoutPublishNotifications(note: NoteRow): Promise<void> {
    const members = await this.prisma.classroomMember.findMany({
      where: {
        institutionId: note.institutionId,
        classroomId: note.classroomId,
        role: UserRole.STUDENT,
        status: Status.ACTIVE,
      },
      select: { userId: true },
    });

    if (members.length === 0) return;

    const classroomName = note.classroom?.name ?? 'your classroom';
    const teacherName = note.teacher?.name ?? 'A teacher';

    const result = await this.notifications.notifyMany({
      institutionId: note.institutionId,
      userIds: members.map((m) => m.userId),
      type: NotificationType.NOTE_PUBLISHED,
      title: `New note: ${note.title}`,
      body: `${teacherName} published a new note in ${classroomName}`,
      metadata: {
        noteId: note.id,
        classroomId: note.classroomId,
      },
    });

    this.logger.log(
      `Notified ${result.count} student(s) of new note ${note.id} in classroom ${note.classroomId}`,
    );
  }

  /**
   * Enqueues a stub OCR job. The processor logs receipt and exits —
   * Sprint 4 wires actual OCR. Payload carries institutionId so the
   * worker can re-scope all downstream Prisma queries (CLAUDE.md §3 +
   * vaasenk-api skill §9).
   */
  private async enqueueOcrJob(note: NoteRow): Promise<void> {
    try {
      await this.notesQueue.add(
        'ocr',
        {
          noteId: note.id,
          institutionId: note.institutionId,
          classroomId: note.classroomId,
          filePath: note.fileUrl,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 100,
          removeOnFail: 500,
          jobId: `notes:ocr:${note.id}`,
        },
      );
    } catch (err) {
      // Don't fail the publish path if Redis is unavailable — OCR is
      // best-effort enrichment, not a blocker for student visibility.
      this.logger.warn(
        `Failed to enqueue OCR job for note ${note.id}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  /**
   * Projects a Prisma Note row to the public view with fresh signed URLs
   * and a `bookmarkedByMe` flag computed from the bookmarks include.
   */
  private async toView(row: NoteRow, viewerId: string): Promise<NoteView> {
    const [fileSignedUrl, thumbnailSignedUrl] = await Promise.all([
      this.storage.getSignedUrl(row.fileUrl),
      this.storage.getSignedUrl(row.thumbnailUrl),
    ]);
    const bookmarkedByMe = row.bookmarks.some((b) => b.userId === viewerId);
    const {
      fileUrl: _filePath,
      thumbnailUrl: _thumbnailPath,
      bookmarks: _bookmarks,
      ...rest
    } = row;
    return {
      ...rest,
      filePath: row.fileUrl,
      thumbnailPath: row.thumbnailUrl,
      fileSignedUrl,
      thumbnailSignedUrl,
      bookmarkedByMe,
    };
  }
}
