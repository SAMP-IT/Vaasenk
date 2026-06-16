import {
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';

/**
 * Wire shape returned by GET /institutions/:id/subscription.
 *
 * `userLimit` / `storageLimitGb` / `aiCreditsMonthly` are the configured
 * caps; `currentUsers` / `storageUsedGb` / `aiCreditsUsed` are the observed
 * usage. The frontend renders a progress bar from each pair.
 *
 * Decimal columns are serialized as JS numbers — both storage fields are
 * capped at 2 decimals, well within Number-safe range.
 */
export interface SubscriptionView {
  id: string;
  institutionId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  billingCycle: string | null;
  priceInr: number | null;
  startedAt: Date;
  expiresAt: Date | null;
  canceledAt: Date | null;

  // Configured caps
  userLimit: number;
  storageLimitGb: number;
  aiCreditsMonthly: number;

  // Observed usage
  currentUsers: number;
  storageUsedGb: number;
  aiCreditsUsed: number;

  externalPaymentId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}
