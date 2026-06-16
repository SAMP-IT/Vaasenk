import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import {
  NotificationType,
  Prisma,
  Status,
  UserRole,
  type Classroom,
  type User,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateClassroomDto,
  JoinClassroomDto,
  ListClassroomsDto,
  ListMembersDto,
  RefreshCodeDto,
} from './classrooms.dto';

/**
 * Invite-code alphabet — uppercase alphanumeric minus the ambiguous
 * characters `0` (zero), `O` (oh), `1` (one), `I` (eye), `L` (ell).
 * 32 characters total → 6-char code gives 32^6 ≈ 1.07B combinations
 * per institution before we need to bump the length.
 */
const INVITE_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const INVITE_CODE_LENGTH = 6;
const INVITE_CODE_RETRY_LIMIT = 5;

const CLASSROOM_LIST_INCLUDE = {
  class: { select: { id: true, name: true } },
  section: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true } },
  teacher: { select: { id: true, name: true, email: true, avatarUrl: true } },
  academicYear: { select: { id: true, name: true, isActive: true } },
  syllabus: { select: { id: true, name: true, status: true } },
  _count: { select: { members: true, notes: true } },
} satisfies Prisma.ClassroomInclude;

const CLASSROOM_DETAIL_MEMBER_LIMIT = 20;

export type ClassroomView = Prisma.ClassroomGetPayload<{
  include: typeof CLASSROOM_LIST_INCLUDE;
}>;

const CLASSROOM_DETAIL_INCLUDE = {
  ...CLASSROOM_LIST_INCLUDE,
  members: {
    where: { status: Status.ACTIVE },
    take: CLASSROOM_DETAIL_MEMBER_LIMIT,
    orderBy: { joinedAt: 'desc' as const },
    include: {
      user: {
        select: { id: true, name: true, email: true, avatarUrl: true, role: true },
      },
    },
  },
  aiChatbot: {
    select: { id: true, status: true, enabledForStudents: true },
  },
} satisfies Prisma.ClassroomInclude;

export type ClassroomDetailView = Prisma.ClassroomGetPayload<{
  include: typeof CLASSROOM_DETAIL_INCLUDE;
}> & {
  setupSummary: {
    hasSyllabus: boolean;
    syllabusStatus: string | null;
    hasInviteCode: boolean;
    inviteExpiresAt: Date | null;
  };
};

const MEMBER_LIST_INCLUDE = {
  user: { select: { id: true, name: true, email: true, avatarUrl: true } },
} satisfies Prisma.ClassroomMemberInclude;

export type ClassroomMemberView = Prisma.ClassroomMemberGetPayload<{
  include: typeof MEMBER_LIST_INCLUDE;
}>;

@Injectable()
export class ClassroomsService {
  private readonly logger = new Logger(ClassroomsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------------------------------------------------------------------------
  // POST /classrooms — create
  // ---------------------------------------------------------------------------

  async create(
    actor: User,
    dto: CreateClassroomDto,
  ): Promise<{ classroom: ClassroomView }> {
    const institutionId = actor.institutionId;

    // 1) Validate every FK belongs to the actor's institution. Each lookup
    //    is institutionId-scoped — CLAUDE.md §3 rule 1 (no cross-tenant FKs).
    const [klass, subject, teacher] = await Promise.all([
      this.prisma.class.findFirst({
        where: { id: dto.classId, institutionId },
        select: { id: true, name: true },
      }),
      this.prisma.subject.findFirst({
        where: { id: dto.subjectId, institutionId },
        select: { id: true, name: true },
      }),
      this.prisma.user.findFirst({
        where: {
          id: dto.teacherId,
          institutionId,
          role: UserRole.TEACHER,
          deletedAt: null,
        },
        select: { id: true, name: true, status: true },
      }),
    ]);

    if (!klass) {
      throw new BadRequestException('Class not found in this institution');
    }
    if (!subject) {
      throw new BadRequestException('Subject not found in this institution');
    }
    if (!teacher) {
      throw new BadRequestException(
        'Teacher not found in this institution, or user is not a TEACHER',
      );
    }
    if (teacher.status !== Status.ACTIVE) {
      throw new BadRequestException('Teacher account is not active');
    }

    // 2) Section (optional) must belong to the supplied class + institution.
    let sectionName: string | null = null;
    if (dto.sectionId) {
      const section = await this.prisma.section.findFirst({
        where: {
          id: dto.sectionId,
          institutionId,
          classId: dto.classId,
        },
        select: { id: true, name: true },
      });
      if (!section) {
        throw new BadRequestException(
          'Section not found, or does not belong to the supplied class',
        );
      }
      sectionName = section.name;
    }

    // 3) Syllabus (optional) must belong to the actor's institution.
    if (dto.syllabusId) {
      const syllabus = await this.prisma.syllabusDocument.findFirst({
        where: { id: dto.syllabusId, institutionId },
        select: { id: true },
      });
      if (!syllabus) {
        throw new BadRequestException('Syllabus not found in this institution');
      }
    }

    // 4) Resolve the academic year — explicit param OR the currently-active one.
    let academicYearId = dto.academicYearId;
    if (!academicYearId) {
      const active = await this.prisma.academicYear.findFirst({
        where: { institutionId, isActive: true },
        select: { id: true },
        orderBy: { startDate: 'desc' },
      });
      if (!active) {
        throw new BadRequestException(
          'No active academic year. Set up an academic year first.',
        );
      }
      academicYearId = active.id;
    } else {
      const ay = await this.prisma.academicYear.findFirst({
        where: { id: academicYearId, institutionId },
        select: { id: true },
      });
      if (!ay) {
        throw new BadRequestException(
          'Academic year not found in this institution',
        );
      }
    }

    // 5) Derived name fallback if the admin didn't supply one.
    const name =
      dto.name?.trim() ||
      this.deriveClassroomName(klass.name, sectionName, subject.name);

    // 6) Allocate a unique invite code (retry on collision).
    const created = await this.createWithUniqueCode(async (inviteCode) =>
      this.prisma.classroom.create({
        data: {
          institutionId,
          academicYearId,
          classId: dto.classId,
          ...(dto.sectionId !== undefined && { sectionId: dto.sectionId }),
          subjectId: dto.subjectId,
          teacherId: dto.teacherId,
          ...(dto.syllabusId !== undefined && { syllabusId: dto.syllabusId }),
          name,
          inviteCode,
          status: Status.ACTIVE,
        },
        include: CLASSROOM_LIST_INCLUDE,
      }),
    ).catch((err: unknown) => {
      // Composite unique (class, section, subject, academicYear).
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new BadRequestException(
          'A classroom for this class/section/subject/academic-year already exists',
        );
      }
      throw err;
    });

    await this.prisma.auditLog.create({
      data: {
        institutionId,
        actorId: actor.id,
        action: 'classroom.create',
        entityType: 'Classroom',
        entityId: created.id,
        metadata: {
          classId: dto.classId,
          subjectId: dto.subjectId,
          teacherId: dto.teacherId,
          academicYearId,
        },
      },
    });

    this.logger.log(
      `Classroom ${created.id} ("${name}") created by ${actor.id} in institution ${institutionId}`,
    );
    return { classroom: created };
  }

  // ---------------------------------------------------------------------------
  // GET /classrooms — list with role-based visibility
  // ---------------------------------------------------------------------------

  async list(
    actor: User,
    query: ListClassroomsDto,
  ): Promise<{
    data: ClassroomView[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const status = query.status ?? Status.ACTIVE;

    const where = this.buildVisibilityWhere(actor, {
      status,
      ...(query.academicYearId !== undefined && {
        academicYearId: query.academicYearId,
      }),
    });

    if (query.search) {
      const needle = query.search.trim();
      if (needle.length > 0) {
        where.name = { contains: needle, mode: 'insensitive' };
      }
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.classroom.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: CLASSROOM_LIST_INCLUDE,
      }),
      this.prisma.classroom.count({ where }),
    ]);

    return { data, meta: { page, limit, total } };
  }

  // ---------------------------------------------------------------------------
  // GET /classrooms/:id — detail
  // ---------------------------------------------------------------------------

  async detail(
    actor: User,
    id: string,
  ): Promise<{ classroom: ClassroomDetailView }> {
    const where = this.buildVisibilityWhere(actor, { id });
    const classroom = await this.prisma.classroom.findFirst({
      where,
      include: CLASSROOM_DETAIL_INCLUDE,
    });
    if (!classroom) {
      // 404 (not 403) for cross-tenant / non-member access — non-disclosure.
      throw new NotFoundException('Classroom not found');
    }

    const setupSummary: ClassroomDetailView['setupSummary'] = {
      hasSyllabus: Boolean(classroom.syllabusId),
      syllabusStatus: classroom.syllabus?.status ?? null,
      hasInviteCode: Boolean(classroom.inviteCode),
      inviteExpiresAt: classroom.inviteExpiresAt,
    };

    return { classroom: { ...classroom, setupSummary } };
  }

  // ---------------------------------------------------------------------------
  // POST /classrooms/join — student joins via invite code
  // ---------------------------------------------------------------------------

  async joinByInviteCode(
    actor: User,
    dto: JoinClassroomDto,
  ): Promise<{ classroom: ClassroomView }> {
    if (actor.role !== UserRole.STUDENT) {
      throw new ForbiddenException(
        'Only students join classrooms via invite codes',
      );
    }

    const normalizedCode = dto.inviteCode.trim().toUpperCase();
    const classroom = await this.prisma.classroom.findFirst({
      where: {
        inviteCode: normalizedCode,
        institutionId: actor.institutionId,
        status: Status.ACTIVE,
      },
      select: {
        id: true,
        institutionId: true,
        inviteExpiresAt: true,
        teacherId: true,
        name: true,
      },
    });

    if (!classroom) {
      // 404 (not 403) — never disclose existence in another tenant.
      throw new NotFoundException('Invite code not recognized');
    }

    if (classroom.inviteExpiresAt && classroom.inviteExpiresAt <= new Date()) {
      throw new GoneException('This invite code has expired');
    }

    // Check whether this is a brand-new join or a reactivation. We only
    // notify the teacher on the first ACTIVE join — a rejoining student
    // who was previously removed shouldn't spam the teacher's bell.
    const existing = await this.prisma.classroomMember.findUnique({
      where: {
        classroomId_userId: {
          classroomId: classroom.id,
          userId: actor.id,
        },
      },
      select: { id: true, status: true },
    });
    const isFirstJoin = existing === null;

    // Upsert on (classroomId, userId). If a previous INACTIVE membership
    // exists (e.g., student was removed), flip it back to ACTIVE.
    await this.prisma.classroomMember.upsert({
      where: {
        classroomId_userId: {
          classroomId: classroom.id,
          userId: actor.id,
        },
      },
      create: {
        institutionId: actor.institutionId,
        classroomId: classroom.id,
        userId: actor.id,
        role: UserRole.STUDENT,
        status: Status.ACTIVE,
      },
      update: {
        status: Status.ACTIVE,
      },
    });

    const refreshed = await this.prisma.classroom.findFirstOrThrow({
      where: { id: classroom.id, institutionId: actor.institutionId },
      include: CLASSROOM_LIST_INCLUDE,
    });

    this.logger.log(
      `Student ${actor.id} joined classroom ${classroom.id} via code ${normalizedCode}`,
    );

    // Sprint 6 — notify the teacher of the joining student. Only fire on
    // the FIRST join so re-activations don't double-notify. Best-effort —
    // a notification failure must not abort the join.
    if (isFirstJoin) {
      try {
        await this.notifications.notify({
          institutionId: actor.institutionId,
          userId: classroom.teacherId,
          type: NotificationType.CLASSROOM_JOINED,
          title: `${actor.name} joined ${classroom.name}`,
          body: `A new student joined your classroom via the invite code.`,
          metadata: {
            classroomId: classroom.id,
            joinedUserId: actor.id,
          },
        });
      } catch (err) {
        this.logger.warn(
          `Failed to notify teacher ${classroom.teacherId} of join ${actor.id}→${classroom.id}: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    return { classroom: refreshed };
  }

  // ---------------------------------------------------------------------------
  // POST /classrooms/:id/refresh-code — regenerate invite
  // ---------------------------------------------------------------------------

  async refreshCode(
    actor: User,
    id: string,
    dto: RefreshCodeDto,
  ): Promise<{ classroom: ClassroomView }> {
    // Admins of the institution + the assigned teacher may rotate the code.
    const existing = await this.prisma.classroom.findFirst({
      where: this.buildVisibilityWhere(actor, { id }, { allowTeacherOfRecord: true }),
      select: { id: true, teacherId: true, institutionId: true },
    });
    if (!existing) {
      throw new NotFoundException('Classroom not found');
    }

    const isAdmin =
      actor.role === UserRole.ADMIN || actor.role === UserRole.SUPER_ADMIN;
    const isAssignedTeacher =
      actor.role === UserRole.TEACHER && existing.teacherId === actor.id;
    if (!isAdmin && !isAssignedTeacher) {
      throw new ForbiddenException(
        'Only admins or the assigned teacher can refresh the invite code',
      );
    }

    const inviteExpiresAt =
      dto.expiresInDays !== undefined
        ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
        : null;

    const updated = await this.updateWithUniqueCode(id, inviteExpiresAt);

    await this.prisma.auditLog.create({
      data: {
        institutionId: existing.institutionId,
        actorId: actor.id,
        action: 'classroom.refresh_invite_code',
        entityType: 'Classroom',
        entityId: id,
        metadata: {
          expiresInDays: dto.expiresInDays ?? null,
        },
      },
    });

    return { classroom: updated };
  }

  // ---------------------------------------------------------------------------
  // GET /classrooms/:id/members
  // ---------------------------------------------------------------------------

  async listMembers(
    actor: User,
    id: string,
    query: ListMembersDto,
  ): Promise<{
    data: ClassroomMemberView[];
    meta: { page: number; limit: number; total: number };
  }> {
    // Reuse visibility rules from detail() — anyone who can see the classroom
    // can list its members.
    const classroom = await this.prisma.classroom.findFirst({
      where: this.buildVisibilityWhere(actor, { id }),
      select: { id: true, institutionId: true },
    });
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const status = query.status ?? Status.ACTIVE;

    const where: Prisma.ClassroomMemberWhereInput = {
      institutionId: classroom.institutionId,
      classroomId: classroom.id,
      status,
    };
    if (query.role) {
      where.role = query.role as UserRole;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.classroomMember.findMany({
        where,
        orderBy: { joinedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: MEMBER_LIST_INCLUDE,
      }),
      this.prisma.classroomMember.count({ where }),
    ]);

    return { data, meta: { page, limit, total } };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Builds a visibility-scoped `where` clause that respects:
   *   • institutionId (always)
   *   • role-based filters:
   *       SUPER_ADMIN / ADMIN → all classrooms in the institution
   *       TEACHER             → assigned-as-teacher OR member with role=TEACHER
   *       STUDENT             → member with role=STUDENT AND status=ACTIVE
   *
   * `extras` lets callers tack on additional filters (id, status, search…).
   * When `opts.allowTeacherOfRecord` is true (refresh-code path) the teacher
   * filter is the same as a teacher's list view — we want the assigned
   * teacher to be able to rotate the code even if their classroom_members
   * row was never created.
   */
  private buildVisibilityWhere(
    actor: User,
    extras: Prisma.ClassroomWhereInput = {},
    _opts: { allowTeacherOfRecord?: boolean } = {},
  ): Prisma.ClassroomWhereInput {
    const base: Prisma.ClassroomWhereInput = {
      institutionId: actor.institutionId,
      ...extras,
    };

    if (
      actor.role === UserRole.ADMIN ||
      actor.role === UserRole.SUPER_ADMIN
    ) {
      return base;
    }

    if (actor.role === UserRole.TEACHER) {
      return {
        ...base,
        OR: [
          { teacherId: actor.id },
          {
            members: {
              some: {
                userId: actor.id,
                role: UserRole.TEACHER,
                status: Status.ACTIVE,
              },
            },
          },
        ],
      };
    }

    // STUDENT (and any unrecognized role — fail closed).
    return {
      ...base,
      members: {
        some: {
          userId: actor.id,
          role: UserRole.STUDENT,
          status: Status.ACTIVE,
        },
      },
    };
  }

  private deriveClassroomName(
    className: string,
    sectionName: string | null,
    subjectName: string,
  ): string {
    const sectionFragment = sectionName ? ` · Section ${sectionName}` : '';
    return `${className}${sectionFragment} · ${subjectName}`;
  }

  /**
   * Cryptographically-strong invite code generator over the 32-char alphabet.
   * `randomInt` is biased-free for values that divide the alphabet length —
   * 32 is a power of two, so a single `randomInt(0, 32)` per character is
   * uniform.
   */
  private generateInviteCode(): string {
    let code = '';
    for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
      const idx = randomInt(0, INVITE_CODE_ALPHABET.length);
      code += INVITE_CODE_ALPHABET[idx];
    }
    return code;
  }

  /**
   * Retries the Prisma write with a fresh invite code if the unique index
   * fires (P2002). The unique constraint on Classroom.inviteCode is global
   * (not per-institution) so cross-tenant collisions still trigger a retry.
   */
  private async createWithUniqueCode(
    write: (code: string) => Promise<ClassroomView>,
  ): Promise<ClassroomView> {
    let lastError: unknown;
    for (let attempt = 0; attempt < INVITE_CODE_RETRY_LIMIT; attempt++) {
      const code = this.generateInviteCode();
      try {
        return await write(code);
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          this.isInviteCodeCollision(err)
        ) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('Failed to allocate a unique invite code');
  }

  private async updateWithUniqueCode(
    classroomId: string,
    inviteExpiresAt: Date | null,
  ): Promise<ClassroomView> {
    let lastError: unknown;
    for (let attempt = 0; attempt < INVITE_CODE_RETRY_LIMIT; attempt++) {
      const code = this.generateInviteCode();
      try {
        return await this.prisma.classroom.update({
          where: { id: classroomId },
          data: { inviteCode: code, inviteExpiresAt },
          include: CLASSROOM_LIST_INCLUDE,
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          this.isInviteCodeCollision(err)
        ) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('Failed to allocate a unique invite code');
  }

  private isInviteCodeCollision(err: Prisma.PrismaClientKnownRequestError): boolean {
    // err.meta?.target is either a string ("Classroom_inviteCode_key") or
    // a string[] (`["inviteCode"]`) depending on the Prisma version. Match
    // either — the safe default if meta is absent is "treat as collision"
    // so we retry rather than surface a confusing 500.
    const target = err.meta?.['target'];
    if (target === undefined) return true;
    if (typeof target === 'string') {
      return target.includes('invite_code') || target.includes('inviteCode');
    }
    if (Array.isArray(target)) {
      return target.some(
        (t) => typeof t === 'string' && (t.includes('invite_code') || t.includes('inviteCode')),
      );
    }
    return false;
  }

  /**
   * Internal helper exposed for the Notes module — verifies that an actor
   * can see a classroom WITHOUT loading the full row.
   * Returns the Classroom row (institutionId + id + teacherId only) or null.
   */
  async assertVisible(actor: User, classroomId: string): Promise<Classroom | null> {
    return this.prisma.classroom.findFirst({
      where: this.buildVisibilityWhere(actor, { id: classroomId }),
    });
  }
}
