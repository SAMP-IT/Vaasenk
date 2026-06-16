/**
 * Plan limits — Sprint 8.2 frontend mirror.
 *
 * Source of truth: `apps/api/src/modules/subscriptions/plan-defaults.ts`.
 * Keep these tables in lock-step. A drift CI check is a polish backlog item
 * (same pattern as `apps/mobile/theme/tailwind-vaasenk.cjs` mirroring
 * `packages/ui/tokens/native-theme.ts` — see Sprint 7.1 deviations).
 *
 * Why mirror?
 *   - The frontend's billing page needs to render plan caps + tagline +
 *     downgrade diffs WITHOUT a network round-trip per render.
 *   - `@prisma/client` is an apps/api dep — pulling it into apps/web would
 *     drag in the Prisma engine and explode bundle size.
 *
 * If you bump a number here, bump it in plan-defaults.ts too (and vice
 * versa). Both files have a comment pointing back at each other.
 */

export type SubscriptionPlan = 'FREE' | 'TRIAL' | 'STARTER' | 'GROWTH' | 'INSTITUTION';

export interface PlanLimits {
  userLimit: number;
  storageLimitGb: number;
  aiCreditsMonthly: number;
}

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  FREE: {
    userLimit: 5,
    storageLimitGb: 1.0,
    aiCreditsMonthly: 0,
  },
  TRIAL: {
    userLimit: 25,
    storageLimitGb: 5.0,
    aiCreditsMonthly: 10_000,
  },
  STARTER: {
    userLimit: 50,
    storageLimitGb: 10.0,
    aiCreditsMonthly: 50_000,
  },
  GROWTH: {
    userLimit: 200,
    storageLimitGb: 50.0,
    aiCreditsMonthly: 250_000,
  },
  INSTITUTION: {
    userLimit: 1000,
    storageLimitGb: 500.0,
    aiCreditsMonthly: 2_000_000,
  },
};

/**
 * Marketing presentation. Prices are illustrative — billing is manually
 * tracked in Sprint 8.2; no payment gateway. INSTITUTION is "Contact sales".
 */
export interface PlanCopy {
  name: string;
  tagline: string;
  priceInrMonthly: number | null; // null = contact sales
  ctaForContact?: string;
}

export const PLAN_COPY: Record<SubscriptionPlan, PlanCopy> = {
  FREE: {
    name: 'Free',
    tagline: 'Try Vaasenk with a single classroom and the core teacher–student loop.',
    priceInrMonthly: 0,
  },
  TRIAL: {
    name: 'Trial',
    tagline: 'A 30-day window with AI features unlocked. Upgrade when the trial ends.',
    priceInrMonthly: 0,
  },
  STARTER: {
    name: 'Starter',
    tagline: 'For small schools and coaching centres up to 50 users.',
    priceInrMonthly: 1499,
  },
  GROWTH: {
    name: 'Growth',
    tagline: 'For growing schools — 200 users, generous AI credits, priority support.',
    priceInrMonthly: 4999,
  },
  INSTITUTION: {
    name: 'Institution',
    tagline: 'For large institutions and groups of schools. Custom limits and SLAs.',
    priceInrMonthly: null,
    ctaForContact: 'Contact sales',
  },
};

/** Stable order for the plan picker — cheap → enterprise. */
export const PLAN_ORDER: SubscriptionPlan[] = [
  'FREE',
  'TRIAL',
  'STARTER',
  'GROWTH',
  'INSTITUTION',
];

/**
 * Compute how much existing observed usage would exceed the caps of a
 * candidate plan. Used by the billing page's confirm-downgrade modal to
 * warn the admin BEFORE submitting the PATCH.
 *
 * The numbers returned are "amount over", i.e. positive values mean the
 * usage exceeds the candidate cap by that much. Undefined values mean the
 * candidate plan can accommodate the current usage on that axis.
 */
export interface UsageSnapshot {
  currentUsers: number;
  storageUsedGb: number;
  aiCreditsUsed: number;
}

export interface PlanDiff {
  usersOverLimit?: number;
  storageOverLimitGb?: number;
  creditsOverLimit?: number;
  anyOver: boolean;
}

export function getPlanDiff(
  newPlan: SubscriptionPlan,
  current: UsageSnapshot,
): PlanDiff {
  const limits = PLAN_LIMITS[newPlan];
  const usersOver = Math.max(0, current.currentUsers - limits.userLimit);
  const storageOver =
    Math.round(
      Math.max(0, current.storageUsedGb - limits.storageLimitGb) * 100,
    ) / 100;
  const creditsOver = Math.max(0, current.aiCreditsUsed - limits.aiCreditsMonthly);

  return {
    ...(usersOver > 0 && { usersOverLimit: usersOver }),
    ...(storageOver > 0 && { storageOverLimitGb: storageOver }),
    ...(creditsOver > 0 && { creditsOverLimit: creditsOver }),
    anyOver: usersOver > 0 || storageOver > 0 || creditsOver > 0,
  };
}

/**
 * Format the AI credits monthly value as a friendly token count
 * (e.g. 50000 → "50k tokens", 2000000 → "2M tokens"). Plans that don't
 * include AI return "—".
 */
export function formatCreditsCap(credits: number): string {
  if (credits <= 0) return 'No AI included';
  if (credits >= 1_000_000) {
    return `${(credits / 1_000_000).toFixed(credits % 1_000_000 === 0 ? 0 : 1)}M tokens`;
  }
  if (credits >= 1_000) {
    return `${Math.round(credits / 1_000)}k tokens`;
  }
  return `${credits} tokens`;
}

/** Format an INR price as ₹X,XXX per month, or "Contact sales" when null. */
export function formatInrPrice(priceMonthly: number | null): string {
  if (priceMonthly === null) return 'Contact sales';
  if (priceMonthly === 0) return 'Free';
  return `₹${priceMonthly.toLocaleString('en-IN')}/mo`;
}
