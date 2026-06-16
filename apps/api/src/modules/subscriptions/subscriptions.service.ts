import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  Status,
  SubscriptionPlan,
  SubscriptionStatus,
  UserRole,
  type Subscription,
  type User,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { bytesToGb, getPlanLimits, PLAN_LIMITS } from './plan-defaults';
import { UpdateSubscriptionDto } from './subscriptions.dto';
import type { SubscriptionView } from './subscriptions.types';

/**
 * SubscriptionsService — Sprint 8.1.
 *
 * Owns the plan-limit guard surface for the entire backend. Every limited
 * write path (user invite, AI generation, file upload) calls one of the
 * `ensure*Available` methods PRE-write; the corresponding `increment*`
 * methods are called POST-write to keep the observed-usage counters in
 * sync with reality.
 *
 * Soft-over-the-limit policy (matches Sprint 4 semantics):
 *   • In-flight calls that already started complete normally.
 *   • The NEXT call after the counter crosses the cap fails closed with 402.
 *   • Inline checks WITHIN a streaming session never abort mid-stream.
 *
 * Multi-tenant scoping (CLAUDE.md §3) is enforced at every read/write by
 * filtering on `institutionId` derived from the JWT-trusted actor.
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ------------------------------------------------------------------------ */
  /* GET /institutions/:id/subscription                                       */
  /* ------------------------------------------------------------------------ */

  async getForInstitution(
    actor: User,
    institutionId: string,
  ): Promise<{ subscription: SubscriptionView | null }> {
    this.assertCanReach(actor, institutionId);

    const sub = await this.getActiveSubscription(institutionId);
    if (!sub) {
      return { subscription: null };
    }
    const currentUsers = await this.countActiveUsers(institutionId);
    return { subscription: this.toView(sub, currentUsers) };
  }

  /* ------------------------------------------------------------------------ */
  /* PATCH /institutions/:id/subscription                                     */
  /* ------------------------------------------------------------------------ */

  async updatePlan(
    actor: User,
    institutionId: string,
    dto: UpdateSubscriptionDto,
  ): Promise<{ subscription: SubscriptionView }> {
    this.assertCanReach(actor, institutionId);

    // If no active subscription exists, create one. This is the bootstrap
    // path for fresh institutions whose admin hits PATCH first.
    let sub = await this.getActiveSubscription(institutionId);
    if (!sub) {
      // Need at least a plan to start with — default to FREE if missing.
      const plan = dto.plan ?? SubscriptionPlan.FREE;
      const limits = getPlanLimits(plan);
      sub = await this.prisma.subscription.create({
        data: {
          institutionId,
          plan,
          status: SubscriptionStatus.ACTIVE,
          startedAt: new Date(),
          ...(dto.billingCycle !== undefined && { billingCycle: dto.billingCycle }),
          ...(dto.priceInr !== undefined && {
            priceInr: new Prisma.Decimal(dto.priceInr),
          }),
          ...(dto.expiresAt !== undefined && { expiresAt: new Date(dto.expiresAt) }),
          ...(dto.metadata !== undefined && {
            metadata: dto.metadata as Prisma.InputJsonValue,
          }),
          userLimit: dto.userLimit ?? limits.userLimit,
          storageLimitGb: new Prisma.Decimal(
            dto.storageLimitGb ?? limits.storageLimitGb,
          ),
          storageUsedGb: new Prisma.Decimal(0),
          aiCreditsMonthly: dto.aiCreditsMonthly ?? limits.aiCreditsMonthly,
          aiCreditsUsed: 0,
        },
      });
      await this.audit.write({
        institutionId,
        actorId: actor.id,
        action: 'subscription.create',
        entityType: 'Subscription',
        entityId: sub.id,
        metadata: { plan: sub.plan, billingCycle: sub.billingCycle ?? null },
      });
      const currentUsers = await this.countActiveUsers(institutionId);
      return { subscription: this.toView(sub, currentUsers) };
    }

    // Existing row — apply patch. When `plan` changes, overwrite the three
    // caps from the plan-defaults table (manual overrides in the same DTO
    // win over the defaults). Observed-usage counters are NEVER touched.
    const planChanged =
      dto.plan !== undefined && dto.plan !== sub.plan;
    const effectiveLimits = planChanged
      ? PLAN_LIMITS[dto.plan as SubscriptionPlan]
      : null;

    const update: Prisma.SubscriptionUpdateInput = {
      ...(dto.plan !== undefined && { plan: dto.plan }),
      ...(dto.billingCycle !== undefined && { billingCycle: dto.billingCycle }),
      ...(dto.priceInr !== undefined && {
        priceInr: new Prisma.Decimal(dto.priceInr),
      }),
      ...(dto.expiresAt !== undefined && { expiresAt: new Date(dto.expiresAt) }),
      ...(dto.metadata !== undefined && {
        metadata: dto.metadata as Prisma.InputJsonValue,
      }),
    };

    // Caps. Order of precedence: explicit DTO override → plan-defaults
    // (only when plan changed) → leave existing value untouched.
    if (dto.userLimit !== undefined) {
      update.userLimit = dto.userLimit;
    } else if (effectiveLimits) {
      update.userLimit = effectiveLimits.userLimit;
    }
    if (dto.storageLimitGb !== undefined) {
      update.storageLimitGb = new Prisma.Decimal(dto.storageLimitGb);
    } else if (effectiveLimits) {
      update.storageLimitGb = new Prisma.Decimal(effectiveLimits.storageLimitGb);
    }
    if (dto.aiCreditsMonthly !== undefined) {
      update.aiCreditsMonthly = dto.aiCreditsMonthly;
    } else if (effectiveLimits) {
      update.aiCreditsMonthly = effectiveLimits.aiCreditsMonthly;
    }

    const updated = await this.prisma.subscription.update({
      where: { id: sub.id },
      data: update,
    });

    await this.audit.write({
      institutionId,
      actorId: actor.id,
      action: 'subscription.update',
      entityType: 'Subscription',
      entityId: updated.id,
      metadata: {
        changedKeys: Object.keys(dto),
        ...(planChanged && {
          previousPlan: sub.plan,
          newPlan: updated.plan,
        }),
      },
    });

    const currentUsers = await this.countActiveUsers(institutionId);
    return { subscription: this.toView(updated, currentUsers) };
  }

  /* ------------------------------------------------------------------------ */
  /* Limit guards                                                              */
  /* ------------------------------------------------------------------------ */

  /**
   * Throws 402 if the institution has hit its user cap. Use BEFORE creating
   * new User rows (invite-teacher, create-student, bulk-import).
   *
   *   @param additional  how many users this batch will add (defaults 1)
   */
  async ensureUserLimitAvailable(
    institutionId: string,
    additional: number = 1,
  ): Promise<void> {
    const sub = await this.getActiveSubscription(institutionId);
    if (!sub) return; // no subscription = unrestricted (free-tier bootstrap)

    const current = await this.countActiveUsers(institutionId);
    if (current + additional > sub.userLimit) {
      throw this.makePaymentRequired(
        'USER_LIMIT_REACHED',
        `Your ${sub.plan} plan supports up to ${sub.userLimit} active users. ` +
          `You currently have ${current}; this would push you over the limit. ` +
          `Upgrade to a larger plan to invite more.`,
        {
          plan: sub.plan,
          limit: sub.userLimit,
          current,
          requested: additional,
        },
      );
    }
  }

  /**
   * Throws 402 if the institution has hit its monthly AI credit cap.
   *
   * Two modes:
   *   • Without estimatedTokens (default) — fails when usage >= cap. This is
   *     the soft-over policy from Sprint 4: in-flight finishes, next call
   *     bounces.
   *   • With estimatedTokens — fails when usage + estimate > cap. Pre-emptive
   *     hard check used by question-paper generation where an entire job
   *     burns ~5k tokens and we'd rather refuse upfront than commit a worker
   *     slot to a doomed call.
   */
  async ensureAiCreditsAvailable(
    institutionId: string,
    estimatedTokens?: number,
  ): Promise<void> {
    const sub = await this.getActiveSubscription(institutionId);
    if (!sub) return;
    if (sub.aiCreditsMonthly <= 0) {
      // Plan has no AI allowance at all (FREE).
      throw this.makePaymentRequired(
        'AI_CREDITS_EXHAUSTED',
        `Your ${sub.plan} plan does not include AI usage. Upgrade to enable AI features.`,
        { plan: sub.plan, limit: 0, current: sub.aiCreditsUsed },
      );
    }

    const projected =
      typeof estimatedTokens === 'number' && estimatedTokens > 0
        ? sub.aiCreditsUsed + estimatedTokens
        : sub.aiCreditsUsed;

    const cap = sub.aiCreditsMonthly;
    const overSoft = !estimatedTokens && sub.aiCreditsUsed >= cap;
    const overHard = estimatedTokens !== undefined && projected > cap;

    if (overSoft || overHard) {
      throw this.makePaymentRequired(
        'AI_CREDITS_EXHAUSTED',
        `Monthly AI credit limit reached on your ${sub.plan} plan ` +
          `(${sub.aiCreditsUsed.toLocaleString()} / ${cap.toLocaleString()} tokens). ` +
          `Upgrade or wait for the next billing cycle.`,
        {
          plan: sub.plan,
          limit: cap,
          current: sub.aiCreditsUsed,
          ...(estimatedTokens !== undefined && { estimated: estimatedTokens }),
        },
      );
    }
  }

  /**
   * Throws 402 if writing `additionalBytes` to storage would exceed the
   * institution's storage cap. NOTE: storage accounting is approximate —
   * we track the raw uploaded file size, NOT derivatives like thumbnails or
   * recompressed variants. Document on user-facing error messages so admins
   * understand a 5 GB cap is "raw uploads", not "all bytes in the bucket".
   */
  async ensureStorageAvailable(
    institutionId: string,
    additionalBytes: number,
  ): Promise<void> {
    const sub = await this.getActiveSubscription(institutionId);
    if (!sub) return;
    const additionalGb = bytesToGb(additionalBytes);
    const usedGb = Number(sub.storageUsedGb);
    const capGb = Number(sub.storageLimitGb);
    if (usedGb + additionalGb > capGb) {
      throw this.makePaymentRequired(
        'STORAGE_LIMIT_REACHED',
        `Your ${sub.plan} plan includes ${capGb} GB of storage; you have ` +
          `${usedGb.toFixed(2)} GB used and this upload (${additionalGb.toFixed(2)} GB) ` +
          `would push you over the limit. Delete older files or upgrade your plan.`,
        {
          plan: sub.plan,
          limit: capGb,
          current: usedGb,
          additional: additionalGb,
        },
      );
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Atomic increments                                                         */
  /* ------------------------------------------------------------------------ */

  /**
   * Atomic increment on aiCreditsUsed for the institution's ACTIVE
   * subscription. No-op when no subscription row exists. Returns the new
   * usage value (helpful for callers that want to log it).
   */
  async incrementAiCredits(
    institutionId: string,
    tokens: number,
  ): Promise<number | null> {
    if (!Number.isFinite(tokens) || tokens <= 0) return null;
    const sub = await this.getActiveSubscriptionId(institutionId);
    if (!sub) return null;
    const updated = await this.prisma.subscription.update({
      where: { id: sub },
      data: { aiCreditsUsed: { increment: tokens } },
      select: { aiCreditsUsed: true },
    });
    return updated.aiCreditsUsed;
  }

  async incrementStorageUsed(
    institutionId: string,
    bytes: number,
  ): Promise<void> {
    if (!Number.isFinite(bytes) || bytes <= 0) return;
    const sub = await this.getActiveSubscriptionId(institutionId);
    if (!sub) return;
    const gb = bytesToGb(bytes);
    if (gb <= 0) return;
    try {
      await this.prisma.subscription.update({
        where: { id: sub },
        data: {
          storageUsedGb: { increment: new Prisma.Decimal(gb) },
        },
      });
    } catch (err) {
      // Best-effort — never let a usage-tracking failure leak past an
      // upload that already succeeded on the bucket.
      this.logger.warn(
        `Failed to increment storage for institution ${institutionId} (+${gb} GB): ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  async decrementStorageUsed(
    institutionId: string,
    bytes: number,
  ): Promise<void> {
    if (!Number.isFinite(bytes) || bytes <= 0) return;
    const sub = await this.getActiveSubscriptionId(institutionId);
    if (!sub) return;
    const gb = bytesToGb(bytes);
    if (gb <= 0) return;
    try {
      await this.prisma.subscription.update({
        where: { id: sub },
        data: {
          storageUsedGb: { decrement: new Prisma.Decimal(gb) },
        },
      });
      // Guard against drift — clamp to 0 if a partial-tracking bug ever
      // produced a negative value.
      const row = await this.prisma.subscription.findUnique({
        where: { id: sub },
        select: { storageUsedGb: true },
      });
      if (row && Number(row.storageUsedGb) < 0) {
        await this.prisma.subscription.update({
          where: { id: sub },
          data: { storageUsedGb: new Prisma.Decimal(0) },
        });
      }
    } catch (err) {
      this.logger.warn(
        `Failed to decrement storage for institution ${institutionId} (-${gb} GB): ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Internal helpers                                                          */
  /* ------------------------------------------------------------------------ */

  /**
   * Cross-institution access on `/institutions/:id/...` MUST be blocked
   * unless the caller is SUPER_ADMIN. For everyone else, the path id must
   * match the JWT-trusted institutionId. 404 (not 403) so we don't leak
   * existence — same posture as InstitutionsService.assertCanReach.
   */
  private assertCanReach(actor: User, institutionId: string): void {
    if (actor.role === UserRole.SUPER_ADMIN) return;
    if (actor.institutionId === institutionId) return;
    throw new NotFoundException('Institution not found');
  }

  private async getActiveSubscription(
    institutionId: string,
  ): Promise<Subscription | null> {
    const now = new Date();
    // "Active" = status ACTIVE AND (no expiry OR expires in the future).
    // We take the most recently started row so history-renewals work cleanly.
    return this.prisma.subscription.findFirst({
      where: {
        institutionId,
        status: SubscriptionStatus.ACTIVE,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  /** Lightweight variant that only returns the id — used by increments. */
  private async getActiveSubscriptionId(
    institutionId: string,
  ): Promise<string | null> {
    const now = new Date();
    const row = await this.prisma.subscription.findFirst({
      where: {
        institutionId,
        status: SubscriptionStatus.ACTIVE,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /**
   * Counts ACTIVE, non-deleted users in the institution. This is the
   * authoritative "currentUsers" number surfaced by GET and used by
   * `ensureUserLimitAvailable`.
   */
  private async countActiveUsers(institutionId: string): Promise<number> {
    return this.prisma.user.count({
      where: {
        institutionId,
        deletedAt: null,
        status: Status.ACTIVE,
      },
    });
  }

  /**
   * Builds the standard 402 envelope. The HTTP filter sees the body
   * `{ code, message, details }` and re-projects it as
   * `{ error: { code, message, details } }`.
   */
  private makePaymentRequired(
    code: 'USER_LIMIT_REACHED' | 'AI_CREDITS_EXHAUSTED' | 'STORAGE_LIMIT_REACHED' | 'PLAN_LIMIT_REACHED',
    message: string,
    details: Record<string, unknown>,
  ): HttpException {
    return new HttpException(
      { code, message, details },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  /**
   * Wire projection. Decimal columns coerce to JS number (capped at 2
   * decimals — well below the 2^53 mantissa).
   */
  private toView(sub: Subscription, currentUsers: number): SubscriptionView {
    return {
      id: sub.id,
      institutionId: sub.institutionId,
      plan: sub.plan,
      status: sub.status,
      billingCycle: sub.billingCycle,
      priceInr: sub.priceInr ? Number(sub.priceInr) : null,
      startedAt: sub.startedAt,
      expiresAt: sub.expiresAt,
      canceledAt: sub.canceledAt,
      userLimit: sub.userLimit,
      storageLimitGb: Number(sub.storageLimitGb),
      aiCreditsMonthly: sub.aiCreditsMonthly,
      currentUsers,
      storageUsedGb: Number(sub.storageUsedGb),
      aiCreditsUsed: sub.aiCreditsUsed,
      externalPaymentId: sub.externalPaymentId,
      metadata: (sub.metadata as Record<string, unknown> | null) ?? null,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    };
  }
}
