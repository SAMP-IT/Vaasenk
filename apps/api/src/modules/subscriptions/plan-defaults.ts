import { SubscriptionPlan } from '@prisma/client';

/**
 * Plan limits — Sprint 8.1.
 *
 * Numbers are first-pass guesses anchored to typical Indian school sizes.
 * They are tunable: bumping these here + redeploying takes effect on the
 * NEXT plan-change. Existing subscription rows keep whatever was written
 * at the time of their last PATCH; nothing rewrites limits in place.
 *
 *   userLimit         — cap on ACTIVE users (any role) per institution
 *   storageLimitGb    — cap on aggregate file storage (notes + syllabus + sample papers)
 *   aiCreditsMonthly  — cap on monthly token usage across all AI operations
 *
 * AI credit math (rough): a question-paper generation averages ~3-4k tokens
 * input + ~1.5-2k tokens output ≈ 5k total. ~30 papers/month → 150k. Chat
 * turn ≈ 2-3k tokens. The plan numbers anchor to the marketing tier shapes:
 *   FREE        → effectively read-only AI (0 credits, generation gated)
 *   TRIAL       → ~30 papers worth (10k credits)
 *   STARTER     → small school: 50 users, 50k credits
 *   GROWTH      → growing school: 200 users, 250k credits
 *   INSTITUTION → enterprise: 1000 users, 2M credits
 */
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

export function getPlanLimits(plan: SubscriptionPlan): PlanLimits {
  return PLAN_LIMITS[plan];
}

/**
 * Bytes → GB rounded to 2 decimal places. Used everywhere the upload sites
 * convert a raw file size into the Decimal column shape the schema stores.
 */
export function bytesToGb(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return Math.round((bytes / 1024 / 1024 / 1024) * 100) / 100;
}
