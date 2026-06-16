import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole, type Invite, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInviteDto, ListInvitesDto } from './invites.dto';

const DEFAULT_EXPIRY_DAYS = 7;
const INVITABLE_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.ADMIN,
  UserRole.TEACHER,
  UserRole.STUDENT,
]);

/**
 * View model returned to clients. Excludes nothing sensitive on its own,
 * but the controller decides which audiences see it:
 *   • InviteService.create / list / revoke → admin audience (full row)
 *   • InviteService.previewByToken         → anonymous audience (sliced)
 */
export type InviteView = Invite & {
  institution: { id: string; name: string };
  invitedBy: { id: string; name: string; email: string | null };
};

@Injectable()
export class InvitesService {
  private readonly logger = new Logger(InvitesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Admin operations (institution-scoped)
  // ---------------------------------------------------------------------------

  async create(
    institutionId: string,
    invitedBy: User,
    dto: CreateInviteDto,
  ): Promise<{ invite: InviteView }> {
    if (institutionId !== invitedBy.institutionId) {
      throw new ForbiddenException('Cannot invite users into another institution');
    }
    if (!INVITABLE_ROLES.has(dto.role)) {
      throw new BadRequestException(
        `Role ${dto.role} cannot be invited. Allowed: ADMIN, TEACHER, STUDENT.`,
      );
    }

    const normalizedEmail = dto.email.toLowerCase().trim();

    // Reject if a non-deleted user with this email already exists in the tenant.
    const existingUser = await this.prisma.user.findFirst({
      where: {
        institutionId,
        email: normalizedEmail,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictException(
        'A user with this email already exists in the institution',
      );
    }

    const expiresAt = new Date(
      Date.now() + (dto.expiresInDays ?? DEFAULT_EXPIRY_DAYS) * 24 * 60 * 60 * 1000,
    );

    try {
      const invite = await this.prisma.invite.create({
        data: {
          institutionId,
          email: normalizedEmail,
          role: dto.role,
          expiresAt,
          invitedById: invitedBy.id,
        },
        include: this.fullInclude(),
      });
      this.logger.log(
        `Invite issued for ${normalizedEmail} (role=${dto.role}) by ${invitedBy.id} in institution ${institutionId}`,
      );
      return { invite };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(
          'An invite for this email already exists. Revoke it first to send a new one.',
        );
      }
      throw err;
    }
  }

  async list(
    institutionId: string,
    query: ListInvitesDto,
  ): Promise<{ data: InviteView[]; meta: { page: number; limit: number; total: number } }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const status = query.status ?? 'pending';

    const now = new Date();
    const where: Prisma.InviteWhereInput = { institutionId };
    if (status === 'pending') {
      where.acceptedAt = null;
      where.revokedAt = null;
      where.expiresAt = { gt: now };
    } else if (status === 'accepted') {
      where.acceptedAt = { not: null };
    } else if (status === 'revoked') {
      where.revokedAt = { not: null };
    } else if (status === 'expired') {
      where.acceptedAt = null;
      where.revokedAt = null;
      where.expiresAt = { lte: now };
    }
    // status === 'all' → no extra filter

    const [data, total] = await this.prisma.$transaction([
      this.prisma.invite.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: this.fullInclude(),
      }),
      this.prisma.invite.count({ where }),
    ]);

    return { data, meta: { page, limit, total } };
  }

  async revoke(institutionId: string, id: string): Promise<{ invite: InviteView }> {
    const invite = await this.prisma.invite.findUnique({
      where: { id },
      select: { institutionId: true, acceptedAt: true, revokedAt: true },
    });
    if (!invite || invite.institutionId !== institutionId) {
      // Same 404 for "doesn't exist" and "exists in another tenant" — never disclose
      // cross-tenant existence (CLAUDE.md §3 multi-tenant defense in depth).
      throw new NotFoundException('Invite not found');
    }
    if (invite.acceptedAt) {
      throw new ConflictException('Invite has already been accepted and cannot be revoked');
    }
    if (invite.revokedAt) {
      throw new ConflictException('Invite has already been revoked');
    }

    const updated = await this.prisma.invite.update({
      where: { id },
      data: { revokedAt: new Date() },
      include: this.fullInclude(),
    });
    return { invite: updated };
  }

  // ---------------------------------------------------------------------------
  // Public — token preview for /register?token=...
  // ---------------------------------------------------------------------------

  async previewByToken(token: string): Promise<{
    email: string;
    role: UserRole;
    institution: { id: string; name: string };
    expiresAt: Date;
  }> {
    const invite = await this.prisma.invite.findUnique({
      where: { token },
      include: { institution: { select: { id: true, name: true, status: true } } },
    });
    if (!invite) {
      throw new NotFoundException('Invite not found');
    }
    if (invite.acceptedAt) {
      throw new ConflictException('Invite has already been accepted');
    }
    if (invite.revokedAt) {
      throw new ConflictException('Invite has been revoked');
    }
    if (invite.expiresAt <= new Date()) {
      throw new ConflictException('Invite has expired');
    }
    if (invite.institution.status === 'ARCHIVED') {
      throw new ConflictException('The inviting institution is no longer active');
    }
    return {
      email: invite.email,
      role: invite.role,
      institution: { id: invite.institution.id, name: invite.institution.name },
      expiresAt: invite.expiresAt,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal: consume token (called from AuthService.acceptInvite)
  // ---------------------------------------------------------------------------

  /**
   * Atomically claims an invite token, returning the canonical Invite row.
   * Throws if the token is missing, accepted, revoked, expired, or attached
   * to an archived institution.
   *
   * Marks `acceptedAt = now()` so the same token can never be replayed.
   * Caller (AuthService) is responsible for creating the auth user + Prisma
   * profile inside the same logical workflow and rolling back if anything
   * downstream fails.
   */
  async consumeToken(token: string): Promise<Invite> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const invite = await tx.invite.findUnique({
        where: { token },
        include: { institution: { select: { status: true } } },
      });
      if (!invite) {
        throw new NotFoundException('Invite not found');
      }
      if (invite.acceptedAt) {
        throw new ConflictException('Invite has already been accepted');
      }
      if (invite.revokedAt) {
        throw new ConflictException('Invite has been revoked');
      }
      if (invite.expiresAt <= now) {
        throw new ConflictException('Invite has expired');
      }
      if (invite.institution.status === 'ARCHIVED') {
        throw new ConflictException('The inviting institution is no longer active');
      }
      return tx.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: now },
      });
    });
  }

  /** Undo `acceptedAt` if the downstream user creation fails. */
  async releaseToken(inviteId: string): Promise<void> {
    await this.prisma.invite
      .update({ where: { id: inviteId }, data: { acceptedAt: null } })
      .catch((err: unknown) => {
        this.logger.error(
          `Failed to release invite ${inviteId} after user creation failure`,
          err instanceof Error ? err.stack : String(err),
        );
      });
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private fullInclude() {
    return {
      institution: { select: { id: true, name: true } },
      invitedBy: { select: { id: true, name: true, email: true } },
    } satisfies Prisma.InviteInclude;
  }
}
