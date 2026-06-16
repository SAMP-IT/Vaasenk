import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotImplementedException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserRole, type User } from '@prisma/client';
import type { EnvConfig } from '../../config/env.config';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { InvitesService } from '../invites/invites.service';
import {
  AcceptInviteDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
} from './auth.dto';

/**
 * Public shape of the authenticated user surfaced to clients.
 *
 * Mirrors the Prisma User row but strips internal fields (passwordHash,
 * deletedAt) and joins a thin institution summary so the frontend can
 * render the tenant badge without an extra round-trip.
 */
export type AuthUserView = Omit<User, 'passwordHash' | 'deletedAt'> & {
  institution: {
    id: string;
    name: string;
    status: User['status'];
    subscriptionPlan: string;
  };
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly prisma: PrismaService,
    private readonly invites: InvitesService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  // ---------------------------------------------------------------------------
  // Login
  // ---------------------------------------------------------------------------

  async login(dto: LoginDto): Promise<{
    user: AuthUserView;
    accessToken: string;
    refreshToken: string;
    expiresAt: number | null;
  }> {
    const { data, error } = await this.supabase.admin.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (error || !data?.session || !data.user) {
      this.logger.debug(`Login failed for ${dto.email}: ${error?.message ?? 'no session'}`);
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = await this.findActiveUser(data.user.id);

    return {
      user,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at ?? null,
    };
  }

  // ---------------------------------------------------------------------------
  // Register (admin-provisioned)
  // ---------------------------------------------------------------------------

  async register(dto: RegisterDto): Promise<{ user: AuthUserView }> {
    if (!dto.institutionId && dto.role !== UserRole.SUPER_ADMIN) {
      throw new BadRequestException(
        'institutionId is required for ADMIN, TEACHER, and STUDENT roles',
      );
    }

    // SUPER_ADMIN without institutionId is a platform-level provisioning case
    // that lives outside this module — bail BEFORE creating a Supabase auth
    // user so we never leave a dangling auth account with no Prisma profile.
    if (!dto.institutionId && dto.role === UserRole.SUPER_ADMIN) {
      throw new NotImplementedException(
        'SUPER_ADMIN provisioning lives outside the institution model; ' +
          'manage these via the Vaasenk platform console (not Sprint 1 scope).',
      );
    }

    if (dto.institutionId) {
      const institution = await this.prisma.institution.findUnique({
        where: { id: dto.institutionId },
        select: { id: true, status: true },
      });
      if (!institution) {
        throw new BadRequestException('Institution not found');
      }
      if (institution.status === 'ARCHIVED') {
        throw new BadRequestException('Institution is archived');
      }
    }

    if (dto.institutionId) {
      const existing = await this.prisma.user.findFirst({
        where: { email: dto.email, institutionId: dto.institutionId, deletedAt: null },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('A user with this email already exists in the institution');
      }
    }

    const { data: created, error: createError } = await this.supabase.admin.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: true,
      user_metadata: { name: dto.name },
      app_metadata: {
        role: dto.role,
        institution_id: dto.institutionId ?? null,
      },
    });

    if (createError || !created.user) {
      this.logger.warn(`Supabase createUser failed for ${dto.email}: ${createError?.message}`);
      throw new BadRequestException(
        createError?.message ?? 'Failed to create Supabase auth user',
      );
    }

    // By the early guards above, dto.institutionId is guaranteed non-null
    // here for every reachable branch.
    try {
      const user = await this.prisma.user.create({
        data: {
          id: created.user.id,
          institutionId: dto.institutionId!,
          name: dto.name,
          email: dto.email,
          role: dto.role,
          status: 'ACTIVE',
        },
        include: this.institutionInclude(),
      });
      return { user: this.toView(user) };
    } catch (err) {
      // Rollback the Supabase auth user if the Prisma insert fails, so the
      // system never ends up with an auth user that has no profile row.
      await this.supabase.admin.auth.admin
        .deleteUser(created.user.id)
        .catch((rollbackErr: unknown) => {
          this.logger.error(
            `Failed to roll back Supabase user ${created.user!.id} after Prisma error`,
            rollbackErr instanceof Error ? rollbackErr.stack : String(rollbackErr),
          );
        });

      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(
          'A user with this email or phone already exists in the institution',
        );
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Invite acceptance
  // ---------------------------------------------------------------------------

  /**
   * Consume an invite token and create the linked Supabase + Prisma user.
   *
   * Workflow:
   *   1. Atomically claim the token (InvitesService.consumeToken) — marks
   *      acceptedAt to prevent replay even if the rest of this method fails.
   *   2. Create the Supabase Auth user with the invite's email/role.
   *   3. Create the local Prisma User row with the same UID.
   *   4. On any downstream failure: roll back the Supabase user AND release
   *      the invite (clear acceptedAt) so the inviter can retry.
   *
   * Returns the new user + a fresh session so the frontend can hand them
   * straight to `supabase.auth.setSession()` and avoid a follow-up login.
   */
  async acceptInvite(dto: AcceptInviteDto): Promise<{
    user: AuthUserView;
    accessToken: string;
    refreshToken: string;
    expiresAt: number | null;
  }> {
    const claimed = await this.invites.consumeToken(dto.token);

    // Guard against the invite's email already existing as a non-deleted user
    // in the institution. This can happen if an admin invited someone who was
    // later provisioned out-of-band. Fail loudly rather than create a duplicate.
    const existing = await this.prisma.user.findFirst({
      where: {
        institutionId: claimed.institutionId,
        email: claimed.email,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (existing) {
      await this.invites.releaseToken(claimed.id);
      throw new ConflictException(
        'A user with this email already exists in the institution',
      );
    }

    let supabaseUserId: string | null = null;
    try {
      const { data: created, error: createError } =
        await this.supabase.admin.auth.admin.createUser({
          email: claimed.email,
          password: dto.password,
          email_confirm: true,
          user_metadata: { name: dto.name },
          app_metadata: {
            role: claimed.role,
            institution_id: claimed.institutionId,
          },
        });
      if (createError || !created.user) {
        throw new BadRequestException(
          createError?.message ?? 'Failed to create Supabase auth user',
        );
      }
      supabaseUserId = created.user.id;

      const prismaUser = await this.prisma.user.create({
        data: {
          id: created.user.id,
          institutionId: claimed.institutionId,
          name: dto.name,
          email: claimed.email,
          role: claimed.role,
          status: 'ACTIVE',
        },
        include: this.institutionInclude(),
      });

      // Sign the new user in so the frontend can populate the @supabase/ssr
      // cookie store immediately via supabase.auth.setSession().
      const { data: session, error: signInError } =
        await this.supabase.admin.auth.signInWithPassword({
          email: claimed.email,
          password: dto.password,
        });
      if (signInError || !session?.session) {
        // Account was created but auto-login failed. Surface this as a 200
        // with no tokens so the frontend can prompt the user to log in.
        this.logger.warn(
          `Auto-login after invite acceptance failed for ${claimed.email}: ${signInError?.message}`,
        );
        return {
          user: this.toView(prismaUser),
          accessToken: '',
          refreshToken: '',
          expiresAt: null,
        };
      }

      return {
        user: this.toView(prismaUser),
        accessToken: session.session.access_token,
        refreshToken: session.session.refresh_token,
        expiresAt: session.session.expires_at ?? null,
      };
    } catch (err) {
      // Roll back both sides: any Supabase auth user we created, plus the
      // claimed invite (so the inviter can correct & retry without revoking).
      if (supabaseUserId) {
        await this.supabase.admin.auth.admin
          .deleteUser(supabaseUserId)
          .catch((rollbackErr: unknown) => {
            this.logger.error(
              `Failed to roll back Supabase user ${supabaseUserId} after invite-accept error`,
              rollbackErr instanceof Error ? rollbackErr.stack : String(rollbackErr),
            );
          });
      }
      await this.invites.releaseToken(claimed.id);

      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(
          'A user with this email or phone already exists in the institution',
        );
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Me
  // ---------------------------------------------------------------------------

  async me(userId: string): Promise<{ user: AuthUserView }> {
    const user = await this.findActiveUser(userId);
    return { user };
  }

  // ---------------------------------------------------------------------------
  // Logout (idempotent best-effort)
  // ---------------------------------------------------------------------------

  async logout(accessToken: string | null): Promise<{ success: true }> {
    if (accessToken) {
      // Best effort: tell Supabase to revoke the refresh tokens tied to this
      // access token. The current admin SDK exposes signOut on a per-user
      // client; treating failure as non-fatal because the client clears its
      // cookies on the next /login response anyway.
      try {
        await this.supabase.admin.auth.admin.signOut(accessToken);
      } catch (err) {
        this.logger.debug(
          `signOut failed (non-fatal): ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Forgot password
  // ---------------------------------------------------------------------------

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ success: true }> {
    // The redirect target is the web app, not the API. WEB_APP_URL is declared
    // as an optional EnvConfig field so it gets boot-time validation alongside
    // the rest of the env; default to dev localhost if unset.
    const webAppUrl =
      this.config.get('WEB_APP_URL', { infer: true }) ?? 'http://localhost:3000';
    const redirectTo = `${webAppUrl.replace(/\/$/, '')}/login`;

    // Never disclose whether the email exists. Always return success.
    try {
      await this.supabase.admin.auth.resetPasswordForEmail(dto.email, {
        redirectTo,
      });
    } catch (err) {
      this.logger.debug(
        `Password reset request failed silently for ${dto.email}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

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

  private async findActiveUser(userId: string): Promise<AuthUserView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: this.institutionInclude(),
    });
    if (!user) {
      throw new UnauthorizedException('User profile is not provisioned');
    }
    if (user.deletedAt) {
      throw new UnauthorizedException('User account has been deactivated');
    }
    return this.toView(user);
  }

  private toView(
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
}
