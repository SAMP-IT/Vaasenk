'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { GlassCard } from '@/components/ui/glass-card';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { VaasenkButton } from '@/components/ui/vaasenk-button';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import {
  formatCreditsCap,
  formatInrPrice,
  getPlanDiff,
  PLAN_COPY,
  PLAN_LIMITS,
  PLAN_ORDER,
  type SubscriptionPlan,
} from '@/lib/plans';
import {
  getSubscription,
  updateSubscription,
  type SubscriptionView,
} from '@/lib/subscriptions-api';
import { cn } from '@/lib/utils';
import { SubscriptionPanel } from '../dashboard/dashboard-client';

/**
 * Billing client — Sprint 8.2.
 *
 * Sections:
 *   1. Current plan card — reuses <SubscriptionPanel> from the dashboard
 *      so both surfaces stay byte-identical when render assumptions change.
 *   2. Plan picker — 5 cards (one per tier) with caps + price + select CTA.
 *   3. Confirm modal — pops on select, shows usage diff for downgrades,
 *      requires "I understand" checkbox when caps shrink below current
 *      usage.
 *
 * When the subscription is null (fresh institution), we render an
 * "Initialize" CTA that PATCHes with `{ plan: 'FREE' }` — same UX as the
 * dashboard's no-subscription state.
 */

const MSG = {
  pageEyebrow: 'Admin · Billing',
  pageTitle: 'Plans & usage',
  pageSubtitle:
    'Pick the right tier for your institution. Billing is tracked manually — no payment gateway yet.',
  refreshAria: 'Refresh subscription',
  noneTitle: 'No subscription yet',
  noneDescription:
    'Initialize a Free-tier subscription so usage starts being tracked. You can upgrade any time.',
  noneCta: 'Initialize FREE plan',
  noneCtaWorking: 'Initializing…',
  planPickerTitle: 'Choose a plan',
  planPickerSubtitle:
    'Caps apply immediately. Observed usage (current users, storage, AI credits) never resets on a plan change.',
  currentTag: 'Current plan',
  contactSales: 'Contact sales',
  selectPlan: 'Select plan',
  confirmTitle: (name: string) => `Switch to ${name}?`,
  confirmDescription:
    'Plan-default caps apply immediately. Your observed usage and history stay untouched.',
  diffHeader: 'This downgrade would push you over the new caps:',
  diffUsers: (over: number, cap: number) =>
    `${over.toLocaleString('en-IN')} too many active users · new cap is ${cap.toLocaleString('en-IN')}.`,
  diffStorage: (over: number, cap: number) =>
    `${over.toFixed(2)} GB too much storage · new cap is ${cap} GB.`,
  diffCredits: (over: number, cap: number) =>
    `${over.toLocaleString('en-IN')} too many AI tokens already used this cycle · new cap is ${cap.toLocaleString('en-IN')}.`,
  diffNote:
    'Existing data is never deleted, but future invites / uploads / AI calls will be blocked until usage falls under the new caps or you upgrade again.',
  acknowledgeCheckbox: 'I understand the new limits will apply immediately.',
  confirmCta: 'Confirm switch',
  confirmCtaWorking: 'Switching…',
  cancel: 'Cancel',
  successToast: (name: string) => `Switched to ${name}.`,
  contactNote:
    'Reach out at sales@vaasenk.com — we will tailor limits and billing terms to your institution.',
} as const;

type AuthMeUser = {
  id: string;
  institutionId: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'TEACHER' | 'STUDENT';
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: { subscription: SubscriptionView | null } }
  | { kind: 'error'; message: string };

export function BillingClient() {
  const [me, setMe] = useState<AuthMeUser | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });

  const [pending, setPending] = useState<SubscriptionPlan | null>(null); // plan in modal
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [initializing, setInitializing] = useState(false);

  // Identity bootstrap.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<{ user: AuthMeUser }>('/api/v1/auth/me');
        if (!cancelled) setMe(data.user);
      } catch (err) {
        if (!cancelled) {
          setIdentityError(
            err instanceof Error ? err.message : "We couldn't load your profile.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!me) return;
    setLoad({ kind: 'loading' });
    try {
      const data = await getSubscription(me.institutionId);
      setLoad({ kind: 'ready', data });
    } catch (err) {
      setLoad({
        kind: 'error',
        message:
          err instanceof Error ? err.message : 'Could not load subscription.',
      });
    }
  }, [me]);

  useEffect(() => {
    if (me) void refresh();
  }, [me, refresh]);

  // Auto-dismiss toast after 4s.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const initialize = async () => {
    if (!me) return;
    setInitializing(true);
    try {
      const updated = await updateSubscription(me.institutionId, {
        plan: 'FREE',
      });
      setLoad({
        kind: 'ready',
        data: { subscription: updated.subscription },
      });
      setToast(MSG.successToast(PLAN_COPY.FREE.name));
    } catch (err) {
      setLoad({
        kind: 'error',
        message:
          err instanceof Error ? err.message : 'Could not initialize.',
      });
    } finally {
      setInitializing(false);
    }
  };

  const currentSub =
    load.kind === 'ready' ? load.data.subscription : null;
  const currentPlan = currentSub?.plan ?? null;

  // Reset acknowledgement whenever the modal opens for a new plan.
  useEffect(() => {
    setAcknowledged(false);
    setSubmitError(null);
  }, [pending]);

  const diff = useMemo(() => {
    if (!pending || !currentSub) return null;
    return getPlanDiff(pending, {
      currentUsers: currentSub.currentUsers,
      storageUsedGb: currentSub.storageUsedGb,
      aiCreditsUsed: currentSub.aiCreditsUsed,
    });
  }, [pending, currentSub]);

  const confirm = async () => {
    if (!me || !pending) return;
    if (diff?.anyOver && !acknowledged) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const updated = await updateSubscription(me.institutionId, {
        plan: pending,
      });
      setLoad({
        kind: 'ready',
        data: { subscription: updated.subscription },
      });
      setToast(MSG.successToast(PLAN_COPY[pending].name));
      setPending(null);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setSubmitError(err.message);
      } else if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError('Could not update subscription.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Identity gate
  if (identityError) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          title="Couldn’t load your profile"
          description={identityError}
          icon={<AlertCircle className="size-7" />}
        />
      </div>
    );
  }
  if (!me) {
    return <BillingSkeleton />;
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      {/* Eyebrow + title (no full hero — the role accent strip is enough) */}
      <header>
        <p className="text-sm font-medium uppercase tracking-wider text-(--vaasenk-subtle)">
          {MSG.pageEyebrow}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-(--vaasenk-ink) sm:text-4xl">
          {MSG.pageTitle}
        </h1>
        <p className="mt-2 max-w-2xl text-(--vaasenk-muted)">
          {MSG.pageSubtitle}
        </p>
      </header>

      {/* CURRENT PLAN */}
      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          {load.kind === 'loading' ? (
            <LoadingSkeleton className="h-80 w-full" />
          ) : load.kind === 'error' ? (
            <GlassCard padding="lg">
              <h2 className="text-lg font-semibold text-(--vaasenk-ink)">
                Subscription
              </h2>
              <p
                role="alert"
                className="mt-3 rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/8 px-4 py-3 text-sm text-(--vaasenk-danger)"
              >
                {load.message}
              </p>
              <VaasenkButton
                variant="secondary"
                size="sm"
                onClick={() => void refresh()}
                className="mt-4"
              >
                <RefreshCw className="size-4" />
                Try again
              </VaasenkButton>
            </GlassCard>
          ) : currentSub ? (
            <GlassCard padding="lg">
              <SubscriptionPanel sub={currentSub} />
            </GlassCard>
          ) : (
            <GlassCard padding="lg">
              <h2 className="text-lg font-semibold text-(--vaasenk-ink)">
                {MSG.noneTitle}
              </h2>
              <p className="mt-1 text-sm text-(--vaasenk-muted)">
                {MSG.noneDescription}
              </p>
              <div className="mt-5">
                <VaasenkButton
                  variant="primary"
                  size="md"
                  onClick={() => void initialize()}
                  disabled={initializing}
                >
                  {initializing ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {MSG.noneCtaWorking}
                    </>
                  ) : (
                    MSG.noneCta
                  )}
                </VaasenkButton>
              </div>
            </GlassCard>
          )}
        </div>

        <aside className="flex flex-col gap-3">
          <GlassCard padding="md">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-(--vaasenk-subtle)">
              Need a tailored plan?
            </h3>
            <p className="mt-2 text-sm text-(--vaasenk-muted)">
              {MSG.contactNote}
            </p>
            <a
              href="mailto:sales@vaasenk.com"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-(--vaasenk-red) hover:underline"
            >
              {MSG.contactSales}
              <ArrowRight className="size-3.5" />
            </a>
          </GlassCard>
        </aside>
      </section>

      {/* PLAN PICKER */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-(--vaasenk-ink)">
            {MSG.planPickerTitle}
          </h2>
          <p className="mt-1 text-sm text-(--vaasenk-muted)">
            {MSG.planPickerSubtitle}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {PLAN_ORDER.map((plan) => (
            <PlanCard
              key={plan}
              plan={plan}
              isCurrent={plan === currentPlan}
              disabled={
                load.kind !== 'ready' || (currentSub === null && plan !== 'FREE')
              }
              onSelect={() => setPending(plan)}
            />
          ))}
        </div>
      </section>

      {/* CONFIRM MODAL */}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        currentPlan={currentPlan}
        targetPlan={pending}
        diff={diff}
        submitting={submitting}
        acknowledged={acknowledged}
        onAcknowledgedChange={setAcknowledged}
        onConfirm={() => void confirm()}
        submitError={submitError}
      />

      {/* TOAST */}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-(--vaasenk-ink) px-5 py-2.5 text-sm font-medium text-white shadow-[0_12px_28px_rgba(0,0,0,0.25)]"
        >
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="size-4 text-(--vaasenk-gold)" />
            {toast}
          </span>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan card
// ---------------------------------------------------------------------------

function PlanCard({
  plan,
  isCurrent,
  disabled,
  onSelect,
}: {
  plan: SubscriptionPlan;
  isCurrent: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const copy = PLAN_COPY[plan];
  const limits = PLAN_LIMITS[plan];
  const isContact = copy.priceInrMonthly === null;
  const isFlagshipTier = plan === 'GROWTH';

  return (
    <article
      className={cn(
        'relative flex h-full flex-col gap-4 rounded-[24px] border p-5',
        'transition-[transform,box-shadow]',
        isCurrent
          ? 'border-(--vaasenk-red) bg-white/85 shadow-[0_16px_36px_rgba(160,0,0,0.18)]'
          : isFlagshipTier
            ? 'border-(--vaasenk-gold)/60 bg-white/75 shadow-[0_8px_24px_rgba(254,202,2,0.15)]'
            : 'border-(--vaasenk-line-sand) bg-white/65 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(160,0,0,0.10)]',
      )}
    >
      {isFlagshipTier && !isCurrent ? (
        <span className="absolute -top-2.5 left-5 inline-flex items-center gap-1 rounded-full bg-(image:--gradient-brand-flame) px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-[0_4px_10px_rgba(160,0,0,0.25)]">
          <Sparkles className="size-3" />
          Most popular
        </span>
      ) : null}
      {isCurrent ? (
        <span className="absolute -top-2.5 left-5 inline-flex items-center gap-1 rounded-full bg-(--vaasenk-success) px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-[0_4px_10px_rgba(23,167,91,0.30)]">
          <CheckCircle2 className="size-3" />
          {MSG.currentTag}
        </span>
      ) : null}

      <header>
        <h3 className="text-lg font-semibold text-(--vaasenk-ink)">
          {copy.name}
        </h3>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-(--vaasenk-deep-maroon)">
          {formatInrPrice(copy.priceInrMonthly)}
        </p>
        <p className="mt-2 text-sm text-(--vaasenk-muted)">{copy.tagline}</p>
      </header>

      <ul className="flex flex-col gap-2 text-sm">
        <PlanLimitRow
          label="Users"
          value={limits.userLimit.toLocaleString('en-IN')}
        />
        <PlanLimitRow
          label="Storage"
          value={`${limits.storageLimitGb} GB`}
        />
        <PlanLimitRow
          label="AI credits"
          value={formatCreditsCap(limits.aiCreditsMonthly)}
        />
      </ul>

      <div className="mt-auto">
        {isContact ? (
          <a href="mailto:sales@vaasenk.com" className="block">
            <VaasenkButton variant="secondary" size="md" className="w-full">
              {copy.ctaForContact ?? MSG.contactSales}
            </VaasenkButton>
          </a>
        ) : (
          <VaasenkButton
            variant={isFlagshipTier ? 'primary' : 'secondary'}
            size="md"
            className="w-full"
            onClick={onSelect}
            disabled={disabled || isCurrent}
            aria-label={`Select ${copy.name} plan`}
          >
            {isCurrent ? MSG.currentTag : MSG.selectPlan}
          </VaasenkButton>
        )}
      </div>
    </article>
  );
}

function PlanLimitRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl bg-(--vaasenk-rose-wash)/40 px-3 py-2">
      <span className="text-xs font-medium uppercase tracking-wider text-(--vaasenk-subtle)">
        {label}
      </span>
      <span className="text-sm font-medium text-(--vaasenk-deep-maroon)">
        {value}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Confirm dialog
// ---------------------------------------------------------------------------

function ConfirmDialog({
  open,
  onOpenChange,
  currentPlan,
  targetPlan,
  diff,
  submitting,
  acknowledged,
  onAcknowledgedChange,
  onConfirm,
  submitError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlan: SubscriptionPlan | null;
  targetPlan: SubscriptionPlan | null;
  diff: ReturnType<typeof getPlanDiff> | null;
  submitting: boolean;
  acknowledged: boolean;
  onAcknowledgedChange: (v: boolean) => void;
  onConfirm: () => void;
  submitError: string | null;
}) {
  if (!targetPlan) return null;
  const targetCopy = PLAN_COPY[targetPlan];
  const targetLimits = PLAN_LIMITS[targetPlan];
  const hasDiff = diff?.anyOver === true;
  const canConfirm = !submitting && (!hasDiff || acknowledged);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-(--vaasenk-deep-maroon)/30 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          )}
        />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2',
            'rounded-[24px] border border-(--vaasenk-line-sand)',
            'bg-(image:--gradient-cream-sunrise)',
            'p-6 shadow-[0_32px_90px_rgba(160,0,0,0.18)] focus:outline-none',
            'data-[state=open]:animate-in data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:zoom-out-95',
          )}
        >
          <header className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-lg font-semibold text-(--vaasenk-ink)">
                {MSG.confirmTitle(targetCopy.name)}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-(--vaasenk-muted)">
                {MSG.confirmDescription}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-(--vaasenk-muted) transition-colors hover:bg-(--vaasenk-rose-wash) hover:text-(--vaasenk-red) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30"
              >
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </header>

          {/* Plan transition summary */}
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <PlanSnapshot
              title="From"
              plan={currentPlan}
              muted
            />
            <PlanSnapshot title="To" plan={targetPlan} muted={false} />
          </div>

          {/* New caps */}
          <div className="mt-5 rounded-2xl border border-(--vaasenk-line-sand) bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-(--vaasenk-subtle)">
              New caps
            </p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-3">
              <CapCell
                label="Users"
                value={targetLimits.userLimit.toLocaleString('en-IN')}
              />
              <CapCell
                label="Storage"
                value={`${targetLimits.storageLimitGb} GB`}
              />
              <CapCell
                label="AI credits"
                value={formatCreditsCap(targetLimits.aiCreditsMonthly)}
              />
            </ul>
          </div>

          {/* Downgrade diff warning */}
          {hasDiff ? (
            <div
              role="alert"
              className="mt-5 rounded-2xl border border-(--vaasenk-danger)/40 bg-(--vaasenk-danger)/8 p-4 text-sm"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-(--vaasenk-danger)" />
                <div className="flex-1">
                  <p className="font-semibold text-(--vaasenk-danger)">
                    {MSG.diffHeader}
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-(--vaasenk-deep-maroon)">
                    {diff?.usersOverLimit !== undefined ? (
                      <li>
                        {MSG.diffUsers(
                          diff.usersOverLimit,
                          targetLimits.userLimit,
                        )}
                      </li>
                    ) : null}
                    {diff?.storageOverLimitGb !== undefined ? (
                      <li>
                        {MSG.diffStorage(
                          diff.storageOverLimitGb,
                          targetLimits.storageLimitGb,
                        )}
                      </li>
                    ) : null}
                    {diff?.creditsOverLimit !== undefined ? (
                      <li>
                        {MSG.diffCredits(
                          diff.creditsOverLimit,
                          targetLimits.aiCreditsMonthly,
                        )}
                      </li>
                    ) : null}
                  </ul>
                  <p className="mt-3 text-xs text-(--vaasenk-muted)">
                    {MSG.diffNote}
                  </p>
                </div>
              </div>

              <label className="mt-4 flex items-start gap-2.5 rounded-xl bg-white/60 px-3 py-2.5 text-sm text-(--vaasenk-deep-maroon)">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => onAcknowledgedChange(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-(--vaasenk-line-sand) text-(--vaasenk-red) focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30"
                />
                <span>{MSG.acknowledgeCheckbox}</span>
              </label>
            </div>
          ) : null}

          {submitError ? (
            <p
              role="alert"
              className="mt-4 rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/8 px-4 py-3 text-sm text-(--vaasenk-danger)"
            >
              {submitError}
            </p>
          ) : null}

          {/* Footer */}
          <footer className="mt-6 flex flex-wrap items-center justify-end gap-3">
            <Dialog.Close asChild>
              <VaasenkButton variant="ghost" size="md" disabled={submitting}>
                {MSG.cancel}
              </VaasenkButton>
            </Dialog.Close>
            <VaasenkButton
              variant="primary"
              size="md"
              onClick={onConfirm}
              disabled={!canConfirm}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {MSG.confirmCtaWorking}
                </>
              ) : (
                MSG.confirmCta
              )}
            </VaasenkButton>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PlanSnapshot({
  title,
  plan,
  muted,
}: {
  title: string;
  plan: SubscriptionPlan | null;
  muted: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-4',
        muted
          ? 'border-(--vaasenk-line-sand) bg-white/55'
          : 'border-(--vaasenk-red)/40 bg-white/85',
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-(--vaasenk-subtle)">
        {title}
      </p>
      <p className="mt-1 text-lg font-semibold text-(--vaasenk-ink)">
        {plan ? PLAN_COPY[plan].name : '—'}
      </p>
      <p className="mt-1 text-xs text-(--vaasenk-muted)">
        {plan ? formatInrPrice(PLAN_COPY[plan].priceInrMonthly) : ''}
      </p>
    </div>
  );
}

function CapCell({ label, value }: { label: string; value: string }) {
  return (
    <li className="rounded-xl bg-(--vaasenk-rose-wash)/40 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-(--vaasenk-subtle)">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium text-(--vaasenk-deep-maroon)">
        {value}
      </p>
    </li>
  );
}

function BillingSkeleton() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <LoadingSkeleton className="h-20 w-1/2" />
      <LoadingSkeleton className="h-80 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <LoadingSkeleton key={i} className="h-72 w-full" />
        ))}
      </div>
    </div>
  );
}
