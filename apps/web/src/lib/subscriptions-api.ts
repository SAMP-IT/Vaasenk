import { apiFetch, apiFetchEnvelope } from './api-client';
import type { SubscriptionPlan } from './plans';

/**
 * Subscriptions / institution-stats / institution-activity API surface.
 *
 * Wraps the Sprint 8.1 endpoints:
 *   GET   /api/v1/institutions/:id/subscription
 *   PATCH /api/v1/institutions/:id/subscription
 *   GET   /api/v1/institutions/:id/stats
 *   GET   /api/v1/institutions/:id/activity?limit=N
 *
 * The activity endpoint uniquely returns a DOUBLE-NESTED envelope:
 *   { data: { activities: [...] }, meta: { total } }
 * Other endpoints follow the standard `{ data: T, meta? }` shape that
 * apiFetch already unwraps to `T`.
 *
 * All endpoints require ADMIN or SUPER_ADMIN. The backend's
 * `assertCanReach` blocks cross-tenant reads with a 404. Callers should
 * pass the JWT-trusted institutionId (resolved via /auth/me), NEVER a
 * client-fabricated value (CLAUDE.md §3 rule 4).
 */

export type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';

export type SubscriptionView = {
  id: string;
  institutionId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  billingCycle: 'monthly' | 'yearly' | null;
  priceInr: number | null;
  startedAt: string;
  expiresAt: string | null;
  canceledAt: string | null;

  // Configured caps
  userLimit: number;
  storageLimitGb: number;
  aiCreditsMonthly: number;

  // Observed usage (current* / *Used are read-only — never sent in PATCH)
  currentUsers: number;
  storageUsedGb: number;
  aiCreditsUsed: number;

  externalPaymentId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type InstitutionStats = {
  totalTeachers: number;
  totalStudents: number;
  totalClassrooms: number;
  totalNotes: number;
  totalAiGenerations: number;
  totalSyllabusDocuments: number;
  totalSamplePapers: number;
};

export type ActivityActor = {
  id: string;
  name: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'TEACHER' | 'STUDENT';
  email: string | null;
};

export type ActivityRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: ActivityActor | null;
  summary: string;
  createdAt: string;
};

export type UpdateSubscriptionDto = {
  plan?: SubscriptionPlan;
  billingCycle?: 'monthly' | 'yearly';
  priceInr?: number;
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
  userLimit?: number;
  storageLimitGb?: number;
  aiCreditsMonthly?: number;
};

/* -------------------------------------------------------------------------- */
/* Subscription                                                                */
/* -------------------------------------------------------------------------- */

export async function getSubscription(
  institutionId: string,
): Promise<{ subscription: SubscriptionView | null }> {
  return apiFetch<{ subscription: SubscriptionView | null }>(
    `/api/v1/institutions/${institutionId}/subscription`,
  );
}

export async function updateSubscription(
  institutionId: string,
  dto: UpdateSubscriptionDto,
): Promise<{ subscription: SubscriptionView }> {
  return apiFetch<{ subscription: SubscriptionView }>(
    `/api/v1/institutions/${institutionId}/subscription`,
    { method: 'PATCH', body: dto },
  );
}

/* -------------------------------------------------------------------------- */
/* Stats                                                                       */
/* -------------------------------------------------------------------------- */

export async function getInstitutionStats(
  institutionId: string,
): Promise<{ stats: InstitutionStats }> {
  return apiFetch<{ stats: InstitutionStats }>(
    `/api/v1/institutions/${institutionId}/stats`,
  );
}

/* -------------------------------------------------------------------------- */
/* Activity                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Activity endpoint returns the double-nested
 * `{ data: { activities }, meta }` envelope (Sprint 8.1 deviation). We use
 * `apiFetchEnvelope` to read the OUTER envelope, then dig out
 * `data.activities`. The `meta.total` is preserved on the return so callers
 * can render an "X of Y" hint if desired.
 */
export async function getInstitutionActivity(
  institutionId: string,
  opts: { limit?: number } = {},
): Promise<{ activities: ActivityRow[]; total: number }> {
  const limit = Math.max(1, Math.min(opts.limit ?? 10, 50));
  const env = await apiFetchEnvelope<{ activities: ActivityRow[] }>(
    `/api/v1/institutions/${institutionId}/activity?limit=${limit}`,
  );
  return {
    activities: env.data.activities,
    total: env.meta?.total ?? env.data.activities.length,
  };
}
