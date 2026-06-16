import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import {
  Prisma,
  Status,
  UserRole,
  type Class,
  type DeviceToken,
  type Section,
  type Student,
  type User,
} from '@prisma/client';
import { parse as parseCsvSync } from 'csv-parse/sync';
import { plainToInstance } from 'class-transformer';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InvitesService, type InviteView } from '../invites/invites.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import type { AuthUserView } from '../auth/auth.service';
import {
  CreateStudentDto,
  DEVICE_PLATFORM_INPUT_TO_ENUM,
  InviteTeacherDto,
  ListUsersDto,
  RegisterDeviceDto,
  UpdateUserStatusDto,
} from './users.dto';

/**
 * Shape returned to the mobile client by POST /users/me/devices.
 *
 * Mirrors the frozen Sprint 7.4 contract: id, expoPushToken, platform (lower
 * case wire string, NOT the Prisma enum), deviceName, createdAt, updatedAt.
 * We deliberately do not surface lastSeenAt — the mobile already knows it
 * just hit the endpoint.
 */
export interface DeviceTokenView {
  id: string;
  expoPushToken: string;
  platform: 'ios' | 'android' | 'web';
  deviceName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Hard cap on rows per CSV upload — keeps the in-memory parse + per-row
 * Prisma round-trips bounded. Beyond 1k the workflow should switch to a
 * BullMQ background job (Sprint 8+).
 */
const CSV_MAX_ROWS = 1000;

/**
 * Header names we accept in the CSV. Matching is case-insensitive with
 * whitespace trimmed. We normalize to camelCase keys internally.
 */
const CSV_HEADER_ALIASES: Record<string, keyof CsvStudentRow> = {
  name: 'name',
  admissionno: 'admissionNo',
  email: 'email',
  phone: 'phone',
  classname: 'className',
  sectionname: 'sectionName',
  rollno: 'rollNo',
  dateofbirth: 'dateOfBirth',
  parentname: 'parentName',
  parentphone: 'parentPhone',
};

/**
 * CSV row shape mirrors CreateStudentDto but swaps the UUID class/section
 * for human-readable names admins actually type into spreadsheets.
 *
 * Kept as a plain interface (vs. a class-validator DTO) because we need
 * row-level validation that aggregates ALL errors per row — we run a single
 * `validateOrReject` against an internal class below and collect errors
 * rather than throwing on first failure.
 */
interface CsvStudentRow {
  name?: string;
  admissionNo?: string;
  email?: string;
  phone?: string;
  className?: string;
  sectionName?: string;
  rollNo?: string;
  dateOfBirth?: string;
  parentName?: string;
  parentPhone?: string;
}

// Internal class for per-row validation. Mirrors CSV column constraints.
// kept in this file (not exported) — the public API surface is the CSV file.
class CsvStudentRowClass {
  name?: string;
  admissionNo?: string;
  email?: string;
  phone?: string;
  className?: string;
  sectionName?: string;
  rollNo?: string;
  dateOfBirth?: string;
  parentName?: string;
  parentPhone?: string;
}

/** Shape returned to the controller; the interceptor wraps to `{ data: ... }`. */
export interface ImportStudentsResult {
  totalRows: number;
  created: number;
  failed: number;
  errors: Array<{ row: number; errors: string[] }>;
}

/** Lightweight student summary surfaced alongside the user row. */
export interface StudentProfileSummary {
  id: string;
  admissionNo: string;
  classId: string | null;
  sectionId: string | null;
  rollNo: string | null;
}

/**
 * Sort spec → Prisma `orderBy` clause. Whitelisted via the DTO `@IsIn`
 * decorator so we never feed arbitrary strings into the query builder.
 */
const SORT_MAP: Record<NonNullable<ListUsersDto['sort']>, Prisma.UserOrderByWithRelationInput> = {
  'createdAt:desc': { createdAt: 'desc' },
  'createdAt:asc': { createdAt: 'asc' },
  'name:asc': { name: 'asc' },
  'name:desc': { name: 'desc' },
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invites: InvitesService,
    private readonly subscriptions: SubscriptionsService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // POST /users/teachers — admin invites a teacher
  // ---------------------------------------------------------------------------

  /**
   * Delegates to InvitesService so we share the same dedupe + revocation
   * + token-consumption code path that already powers /institutions/:id/invites.
   * The teacher's User row is materialized only when they accept the invite
   * (existing /auth/invite/accept flow), so no Prisma user write happens here.
   */
  async inviteTeacher(
    actor: User,
    dto: InviteTeacherDto,
  ): Promise<{ invite: InviteView }> {
    // Sprint 8.1 — refuse if the institution is already at its user cap.
    // Invites are pre-allocated seats: once accepted they consume a User
    // row, so we gate at issuance time too.
    await this.subscriptions.ensureUserLimitAvailable(actor.institutionId, 1);

    // The InvitesService.create signature wants the institutionId scoped to the
    // actor; we never trust client-provided tenant ids (CLAUDE.md §3).
    const result = await this.invites.create(actor.institutionId, actor, {
      email: dto.email,
      role: UserRole.TEACHER,
      ...(dto.expiresInDays !== undefined && { expiresInDays: dto.expiresInDays }),
    });

    await this.audit.write({
      institutionId: actor.institutionId,
      actorId: actor.id,
      action: 'user.invite',
      entityType: 'User',
      entityId: result.invite.id,
      metadata: {
        role: UserRole.TEACHER,
        email: dto.email.toLowerCase().trim(),
      },
    });

    // Capture the supplied display name on the invite metadata so the accept
    // flow can pre-fill it. The Invite model already has a free-form `metadata`
    // JSON column; we patch it after creation rather than expanding the
    // InvitesService.create signature for a single optional field.
    try {
      await this.prisma.invite.update({
        where: { id: result.invite.id },
        data: { metadata: { name: dto.name.trim() } },
      });
      // Re-read the invite to surface the freshly written metadata. The cost
      // is one extra round-trip; teacher invites are low-volume so it's fine.
      const refreshed = await this.prisma.invite.findUnique({
        where: { id: result.invite.id },
        include: {
          institution: { select: { id: true, name: true } },
          invitedBy: { select: { id: true, name: true, email: true } },
        },
      });
      return { invite: (refreshed ?? result.invite) as InviteView };
    } catch (err) {
      // The invite was issued; metadata is best-effort. Log and return the
      // canonical result so the admin still gets a usable invite token.
      this.logger.warn(
        `Failed to attach name metadata to invite ${result.invite.id}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      return result;
    }
  }

  // ---------------------------------------------------------------------------
  // POST /users/students — admin creates a student directly
  // ---------------------------------------------------------------------------

  /**
   * Direct provisioning path: creates the User row + the Student profile in a
   * single transaction. Students are admin-provisioned (often pre-issued in
   * bulk) and may not have email addresses, so we don't create a Supabase auth
   * user — they'll log in via a later invite flow if/when needed.
   */
  async createStudent(
    actor: User,
    dto: CreateStudentDto,
  ): Promise<{ user: AuthUserView; student: StudentProfileSummary }> {
    const institutionId = actor.institutionId;

    // Sprint 8.1 — refuse if the institution is already at its user cap.
    await this.subscriptions.ensureUserLimitAvailable(institutionId, 1);

    await this.validateClassAndSection(institutionId, dto.classId, dto.sectionId);

    // If an email was supplied, guard duplicates inside the tenant up-front so
    // the error is clean (Prisma would otherwise surface the underlying P2002).
    if (dto.email) {
      const existing = await this.prisma.user.findFirst({
        where: {
          institutionId,
          email: dto.email.toLowerCase().trim(),
          deletedAt: null,
        },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException(
          'A user with this email already exists in the institution',
        );
      }
    }

    try {
      const { user, student } = await this.prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            institutionId,
            name: dto.name.trim(),
            ...(dto.email !== undefined && { email: dto.email.toLowerCase().trim() }),
            ...(dto.phone !== undefined && { phone: dto.phone.trim() }),
            role: UserRole.STUDENT,
            status: Status.ACTIVE,
          },
          include: this.institutionInclude(),
        });

        const createdStudent = await tx.student.create({
          data: {
            institutionId,
            userId: createdUser.id,
            admissionNo: dto.admissionNo.trim(),
            classId: dto.classId,
            ...(dto.sectionId !== undefined && { sectionId: dto.sectionId }),
            ...(dto.rollNo !== undefined && { rollNo: dto.rollNo.trim() }),
            ...(dto.dateOfBirth !== undefined && {
              dateOfBirth: new Date(dto.dateOfBirth),
            }),
            ...(dto.parentName !== undefined && { parentName: dto.parentName.trim() }),
            ...(dto.parentPhone !== undefined && { parentPhone: dto.parentPhone.trim() }),
          },
        });
        return { user: createdUser, student: createdStudent };
      });

      this.logger.log(
        `Student ${student.id} (user ${user.id}, admissionNo=${student.admissionNo}) ` +
          `created by ${actor.id} in institution ${institutionId}`,
      );

      await this.audit.write({
        institutionId,
        actorId: actor.id,
        action: 'user.create',
        entityType: 'User',
        entityId: user.id,
        metadata: { role: UserRole.STUDENT, admissionNo: student.admissionNo },
      });

      return {
        user: this.toAuthView(user),
        student: this.toStudentSummary(student),
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(
          'A student with this admission number (or email/phone) already exists',
        );
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // POST /users/students/import — bulk CSV import
  // ---------------------------------------------------------------------------

  /**
   * Per-row partial-success semantics: rows that validate AND insert cleanly
   * are committed; failures are aggregated with their row index. We DO NOT
   * wrap the whole import in a transaction — a single bad row should not
   * roll back 999 good ones.
   */
  async importStudentsCsv(
    actor: User,
    file: Express.Multer.File,
  ): Promise<ImportStudentsResult> {
    if (!file) {
      throw new BadRequestException('CSV file is required (multipart field "file")');
    }

    // MIME hint — browsers send `text/csv`, some upload helpers send
    // `application/vnd.ms-excel`, and curl/programmatic clients fall back to
    // `application/octet-stream`. Accept all three.
    const allowedMimes = [
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel',
      'application/octet-stream',
    ];
    if (file.mimetype && !allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported MIME type "${file.mimetype}". Expected one of: ${allowedMimes.join(', ')}`,
      );
    }

    // Parse with column normalization.
    let records: Record<string, string>[];
    try {
      records = parseCsvSync(file.buffer, {
        columns: (header: string[]) =>
          header.map((col) => {
            const key = col.trim().toLowerCase().replace(/[\s_-]+/g, '');
            return CSV_HEADER_ALIASES[key] ?? key;
          }),
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true,
        bom: true,
      }) as Record<string, string>[];
    } catch (err) {
      throw new BadRequestException(
        `Failed to parse CSV: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (records.length === 0) {
      return { totalRows: 0, created: 0, failed: 0, errors: [] };
    }
    if (records.length > CSV_MAX_ROWS) {
      throw new PayloadTooLargeException(
        `CSV exceeds ${CSV_MAX_ROWS}-row limit; got ${records.length}. Split into multiple uploads.`,
      );
    }

    const institutionId = actor.institutionId;

    // Sprint 8.1 — refuse the whole batch if it would push the institution
    // past its user cap. Partial imports still succeed for rows that fall
    // within the cap if `records.length > seatsAvailable` would happen
    // mid-import — so we gate up-front on the FULL batch size and let ops
    // know to either upgrade or trim the CSV.
    await this.subscriptions.ensureUserLimitAvailable(
      institutionId,
      records.length,
    );

    // Resolve class/section name → id ONCE for the whole import (saves N round-trips).
    const classes = await this.prisma.class.findMany({
      where: { institutionId },
      include: { sections: { select: { id: true, name: true, classId: true } } },
    });
    const classByName = new Map<string, Class & { sections: Pick<Section, 'id' | 'name' | 'classId'>[] }>();
    for (const cls of classes) {
      classByName.set(cls.name.toLowerCase().trim(), cls);
    }

    const errors: Array<{ row: number; errors: string[] }> = [];
    let created = 0;

    for (let i = 0; i < records.length; i++) {
      const rowNumber = i + 1; // 1-indexed, excludes header
      const raw = records[i] ?? {};

      const rowErrors: string[] = [];
      const instance = plainToInstance(CsvStudentRowClass, raw);
      rowErrors.push(...this.validateCsvRow(instance));

      // Resolve className → classId.
      const className = (raw.className ?? '').toLowerCase().trim();
      const cls = className ? classByName.get(className) : undefined;
      if (!className) {
        rowErrors.push('className is required');
      } else if (!cls) {
        rowErrors.push(`Class "${raw.className}" not found in institution`);
      }

      // Resolve sectionName → sectionId (only if provided).
      let sectionId: string | undefined;
      const sectionName = (raw.sectionName ?? '').toLowerCase().trim();
      if (sectionName && cls) {
        const sec = cls.sections.find((s) => s.name.toLowerCase().trim() === sectionName);
        if (!sec) {
          rowErrors.push(
            `Section "${raw.sectionName}" not found in class "${cls.name}"`,
          );
        } else {
          sectionId = sec.id;
        }
      }

      if (rowErrors.length > 0 || !cls) {
        errors.push({ row: rowNumber, errors: rowErrors });
        continue;
      }

      // All validation passed — attempt the insert. Per-row partial success
      // means catching the unique-constraint failure and recording it as a
      // row-level error rather than aborting the whole import.
      try {
        await this.prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              institutionId,
              name: (raw.name ?? '').trim(),
              ...(raw.email && { email: raw.email.toLowerCase().trim() }),
              ...(raw.phone && { phone: raw.phone.trim() }),
              role: UserRole.STUDENT,
              status: Status.ACTIVE,
            },
          });
          await tx.student.create({
            data: {
              institutionId,
              userId: user.id,
              admissionNo: (raw.admissionNo ?? '').trim(),
              classId: cls.id,
              ...(sectionId !== undefined && { sectionId }),
              ...(raw.rollNo && { rollNo: raw.rollNo.trim() }),
              ...(raw.dateOfBirth && { dateOfBirth: new Date(raw.dateOfBirth) }),
              ...(raw.parentName && { parentName: raw.parentName.trim() }),
              ...(raw.parentPhone && { parentPhone: raw.parentPhone.trim() }),
            },
          });
        });
        created += 1;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          errors.push({
            row: rowNumber,
            errors: ['Duplicate admission number, email, or phone within the institution'],
          });
        } else {
          errors.push({
            row: rowNumber,
            errors: [
              `Unexpected insert failure: ${err instanceof Error ? err.message : String(err)}`,
            ],
          });
        }
      }
    }

    this.logger.log(
      `CSV import by ${actor.id} for institution ${institutionId}: ` +
        `${created}/${records.length} created, ${errors.length} failed`,
    );

    await this.audit.write({
      institutionId,
      actorId: actor.id,
      action: 'user.import',
      entityType: 'User',
      metadata: {
        totalRows: records.length,
        created,
        failed: errors.length,
      },
    });

    return {
      totalRows: records.length,
      created,
      failed: errors.length,
      errors,
    };
  }

  // ---------------------------------------------------------------------------
  // GET /users — paginated list with search + role/status filters
  // ---------------------------------------------------------------------------

  async list(
    actor: User,
    query: ListUsersDto,
  ): Promise<{
    data: Array<
      User & {
        institution: { id: string; name: string };
        studentProfile?: StudentProfileSummary | null;
        teacherProfile?: {
          id: string;
          employeeCode: string | null;
          department: string | null;
          subjects: string[];
        } | null;
      }
    >;
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const status = query.status ?? Status.ACTIVE;
    const sort = query.sort ?? 'createdAt:desc';

    const where: Prisma.UserWhereInput = {
      institutionId: actor.institutionId, // CLAUDE.md §3 — institutionId-first
      deletedAt: null,
      status,
    };
    if (query.role) {
      where.role = query.role;
    }
    if (query.search) {
      const needle = query.search.trim();
      if (needle.length > 0) {
        where.OR = [
          { name: { contains: needle, mode: 'insensitive' } },
          { email: { contains: needle, mode: 'insensitive' } },
          { phone: { contains: needle, mode: 'insensitive' } },
        ];
      }
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: SORT_MAP[sort],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          institution: { select: { id: true, name: true } },
          studentProfile: {
            select: {
              id: true,
              admissionNo: true,
              classId: true,
              sectionId: true,
              rollNo: true,
            },
          },
          teacherProfile: {
            select: {
              id: true,
              employeeCode: true,
              department: true,
              subjects: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data: rows, meta: { page, limit, total } };
  }

  // ---------------------------------------------------------------------------
  // PATCH /users/:id/status — activate / deactivate
  // ---------------------------------------------------------------------------

  async updateStatus(
    actor: User,
    id: string,
    dto: UpdateUserStatusDto,
  ): Promise<{ user: AuthUserView }> {
    if (id === actor.id) {
      throw new BadRequestException('Cannot change your own status');
    }

    const target = await this.prisma.user.findFirst({
      where: {
        id,
        institutionId: actor.institutionId,
        deletedAt: null,
      },
      include: this.institutionInclude(),
    });
    if (!target) {
      // 404 (not 403) for cross-tenant — non-disclosure (CLAUDE.md §3).
      throw new NotFoundException('User not found');
    }

    if (target.role === UserRole.SUPER_ADMIN && actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only SUPER_ADMIN can change a SUPER_ADMIN');
    }

    if (target.status === dto.status) {
      // Idempotent — return the current view without writing an audit row.
      return { user: this.toAuthView(target) };
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { status: dto.status },
      include: this.institutionInclude(),
    });

    await this.prisma.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        actorId: actor.id,
        action: 'user.status_changed',
        entityType: 'User',
        entityId: id,
        metadata: { from: target.status, to: dto.status },
      },
    });

    return { user: this.toAuthView(updated) };
  }

  // ---------------------------------------------------------------------------
  // DELETE /users/:id — soft delete
  // ---------------------------------------------------------------------------

  async softDelete(actor: User, id: string): Promise<void> {
    if (id === actor.id) {
      throw new BadRequestException('Cannot delete yourself');
    }

    const target = await this.prisma.user.findFirst({
      where: {
        id,
        institutionId: actor.institutionId,
        deletedAt: null,
      },
      select: { id: true, role: true },
    });
    if (!target) {
      throw new NotFoundException('User not found');
    }

    if (target.role === UserRole.SUPER_ADMIN && actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only SUPER_ADMIN can delete a SUPER_ADMIN');
    }

    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: Status.INACTIVE },
    });

    await this.prisma.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        actorId: actor.id,
        action: 'user.deleted',
        entityType: 'User',
        entityId: id,
        metadata: { role: target.role },
      },
    });
  }

  // ---------------------------------------------------------------------------
  // POST /users/me/devices   — Sprint 7.4 mobile push registration
  // ---------------------------------------------------------------------------

  /**
   * Idempotent upsert of a device token. The Expo push token is globally
   * unique — if a token already exists for ANY user we transfer ownership
   * to the current actor. This covers the "user A signs out, user B signs
   * in on the same physical device" case: A's token must move to B.
   *
   * Multi-tenant scoping (CLAUDE.md §3): both `userId` and `institutionId`
   * are derived from the JWT-trusted actor — never from client input. The
   * row carries both for defense-in-depth even though userId alone would
   * fully scope ownership.
   */
  async registerDevice(
    actor: User,
    dto: RegisterDeviceDto,
  ): Promise<{ device: DeviceTokenView }> {
    const platform = DEVICE_PLATFORM_INPUT_TO_ENUM[dto.platform];
    const now = new Date();

    // Upsert by the globally-unique expoPushToken. On conflict we re-bind
    // userId + institutionId so a re-registration on the same device after a
    // sign-out switches ownership cleanly.
    const row = await this.prisma.deviceToken.upsert({
      where: { expoPushToken: dto.expoPushToken },
      create: {
        userId: actor.id,
        institutionId: actor.institutionId,
        expoPushToken: dto.expoPushToken,
        platform,
        ...(dto.deviceName !== undefined && { deviceName: dto.deviceName.trim() }),
        ...(dto.appVersion !== undefined && { appVersion: dto.appVersion.trim() }),
        ...(dto.osVersion !== undefined && { osVersion: dto.osVersion.trim() }),
        lastSeenAt: now,
      },
      update: {
        userId: actor.id,
        institutionId: actor.institutionId,
        platform,
        // Update the optional cosmetic fields when present; leave them as-is
        // when omitted (keeps the previous label if the mobile didn't ship one
        // this time).
        ...(dto.deviceName !== undefined && { deviceName: dto.deviceName.trim() }),
        ...(dto.appVersion !== undefined && { appVersion: dto.appVersion.trim() }),
        ...(dto.osVersion !== undefined && { osVersion: dto.osVersion.trim() }),
        lastSeenAt: now,
      },
    });

    this.logger.log(
      `Device ${row.id} (platform=${platform}) registered for user ${actor.id} ` +
        `in institution ${actor.institutionId}`,
    );

    return { device: this.toDeviceView(row) };
  }

  // ---------------------------------------------------------------------------
  // DELETE /users/me/devices/:deviceId  — Sprint 7.4
  // ---------------------------------------------------------------------------

  /**
   * Unregister a device for the current actor. 404 when the device doesn't
   * exist OR belongs to another user — we deliberately do NOT 403 because we
   * don't want to leak the existence of foreign devices.
   */
  async deleteDevice(
    actor: User,
    deviceId: string,
  ): Promise<{ deleted: true }> {
    const existing = await this.prisma.deviceToken.findFirst({
      where: {
        id: deviceId,
        userId: actor.id,
        institutionId: actor.institutionId,
      },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Device not found');
    }

    await this.prisma.deviceToken.delete({ where: { id: existing.id } });

    return { deleted: true };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Confirms the class (and section, if supplied) belong to the actor's
   * institution. Prevents an admin from foot-gunning a student into another
   * tenant's class via a hand-crafted UUID.
   */
  private async validateClassAndSection(
    institutionId: string,
    classId: string,
    sectionId: string | undefined,
  ): Promise<void> {
    const cls = await this.prisma.class.findFirst({
      where: { id: classId, institutionId },
      select: { id: true },
    });
    if (!cls) {
      throw new BadRequestException('Class not found in this institution');
    }
    if (sectionId) {
      const sec = await this.prisma.section.findFirst({
        where: { id: sectionId, institutionId, classId },
        select: { id: true },
      });
      if (!sec) {
        throw new BadRequestException(
          'Section not found, or does not belong to the supplied class',
        );
      }
    }
  }

  private institutionInclude() {
    return {
      institution: {
        select: {
          id: true,
          name: true,
          status: true,
          subscriptionPlan: true,
        },
      },
    } satisfies Prisma.UserInclude;
  }

  /**
   * Strips internal fields from a Prisma User row and projects the same
   * AuthUserView shape AuthService exposes — gives the frontend a consistent
   * "user object" across /auth/me, /auth/register, and /users endpoints.
   */
  private toAuthView(
    user: User & {
      institution: {
        id: string;
        name: string;
        status: User['status'];
        subscriptionPlan: string;
      };
    },
  ): AuthUserView {
    const { passwordHash: _passwordHash, deletedAt: _deletedAt, ...rest } = user;
    return rest;
  }

  private toStudentSummary(student: Student): StudentProfileSummary {
    return {
      id: student.id,
      admissionNo: student.admissionNo,
      classId: student.classId,
      sectionId: student.sectionId,
      rollNo: student.rollNo,
    };
  }

  /**
   * Projects a DeviceToken row to the wire shape the mobile expects.
   * Notably the platform enum is downcased to match the inbound contract.
   */
  private toDeviceView(row: DeviceToken): DeviceTokenView {
    return {
      id: row.id,
      expoPushToken: row.expoPushToken,
      platform: row.platform.toLowerCase() as 'ios' | 'android' | 'web',
      deviceName: row.deviceName,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Manual per-row validation that mirrors CreateStudentDto. We use
   * class-validator constraints inline (rather than decorating the internal
   * class) so the row-level errors render as friendly strings for the import
   * report. Falls back to lightweight type checks where class-validator
   * doesn't help (e.g., required-name).
   */
  private validateCsvRow(row: CsvStudentRowClass): string[] {
    const errors: string[] = [];

    // Required fields
    if (!row.name || row.name.trim().length < 2 || row.name.trim().length > 120) {
      errors.push('name is required (2-120 characters)');
    }
    if (
      !row.admissionNo ||
      row.admissionNo.trim().length < 1 ||
      row.admissionNo.trim().length > 40
    ) {
      errors.push('admissionNo is required (1-40 characters)');
    }
    // className is validated separately in the caller (needs the class map)

    // Optional but bounded
    if (row.email && row.email.length > 254) {
      errors.push('email exceeds 254 characters');
    }
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      errors.push('email is not a valid address');
    }
    if (row.phone && row.phone.length > 40) {
      errors.push('phone exceeds 40 characters');
    }
    if (row.rollNo && row.rollNo.length > 20) {
      errors.push('rollNo exceeds 20 characters');
    }
    if (row.dateOfBirth && Number.isNaN(new Date(row.dateOfBirth).getTime())) {
      errors.push('dateOfBirth is not a valid ISO date (yyyy-mm-dd)');
    }
    if (row.parentName && row.parentName.length > 120) {
      errors.push('parentName exceeds 120 characters');
    }
    if (row.parentPhone && row.parentPhone.length > 40) {
      errors.push('parentPhone exceeds 40 characters');
    }

    return errors;
  }
}

