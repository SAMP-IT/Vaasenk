'use client';

import Link from 'next/link';
import {
  Activity,
  AlertCircle,
  BookOpen,
  Bot,
  CheckCircle2,
  Circle,
  ClipboardList,
  Clock,
  CreditCard,
  FileText,
  GraduationCap,
  Loader2,
  RefreshCw,
  School,
  Sparkles,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { GlassCard } from '@/components/ui/glass-card';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { VaasenkButton } from '@/components/ui/vaasenk-button';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import { PLAN_COPY } from '@/lib/plans';
import {
  getInstitutionActivity,
  getInstitutionStats,
  getSubscription,
  type ActivityRow,
  type InstitutionStats,
  type SubscriptionView,
  updateSubscription,
} from '@/lib/subscriptions-api';
import { cn } from '@/lib/utils';

/**
 * Admin Dashboard client component — Sprint 8.2 / Playbook Prompt 28.
 *
 * Renders 5 sections on top of an Admin Royal hero card:
 *   1. Institution Setup Checklist (derived from /stats)
 *   2. Stats cards (7 KPIs from /stats)
 *   3. AI Processing Status (in-flight syllabus + sample-paper jobs)
 *   4. Recent Activity (from /activity?limit=10)
 *   5. Subscription Status card (from /subscription)
 *
 * Data fetching uses Promise.allSettled — a single endpoint failure
 * doesn't black out the entire dashboard. Each section renders its own
 * Default / Loading / Empty / Error state per CLAUDE.md §5.
 *
 * Multi-tenancy: institutionId comes from /auth/me (JWT-trusted), never
 * from any client-side cache or URL parameter. CLAUDE.md §3 rule 4.
 */

// ---------------------------------------------------------------------------
// Strings
// ---------------------------------------------------------------------------

const MSG = {
  pageTitle: 'Dashboard',
  greeting: (first: string | null) =>
    first ? `Welcome back, ${first}` : 'Welcome back',
  renewalLine: (when: string) => `Your plan renews on ${when}`,
  renewalNone: 'No renewal scheduled — manage billing to set one.',
  setupTitle: 'Institution setup',
  setupSubtitle: 'A quick checklist to make sure the basics are in place.',
  setupComplete: (n: number, total: number, pct: number) =>
    `${n} of ${total} complete · ${pct}%`,
  setupAllDone: 'Your institution is fully set up. Beautiful work.',
  statsTitle: 'At a glance',
  aiProcessingTitle: 'AI processing',
  aiProcessingSubtitle:
    'In-flight syllabus and sample-paper ingestion jobs.',
  aiProcessingEmpty: 'All documents processed.',
  aiProcessingFailedRetry: 'Retry',
  activityTitle: 'Recent activity',
  activityEmpty: 'No recent activity yet.',
  subscriptionTitle: 'Subscription',
  subscriptionNoneTitle: 'No active subscription',
  subscriptionNoneDescription:
    'Initialize a Free-tier subscription so your usage starts being tracked. You can upgrade any time.',
  subscriptionInitCta: 'Initialize subscription',
  subscriptionInitializing: 'Initializing…',
  manageBilling: 'Manage plan',
  errorLoading: 'Couldn’t load this section.',
  retry: 'Retry',
  refreshAll: 'Refresh dashboard',
} as const;

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

type AuthMeUser = {
  id: string;
  name: string | null;
  institutionId: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'TEACHER' | 'STUDENT';
  institution: { id: string; name: string };
};

type ProcessingStatus =
  | 'UPLOADED'
  | 'QUEUED'
  | 'PROCESSING'
  | 'AI_READY'
  | 'FAILED';

type ProcessingDoc = {
  id: string;
  name: string;
  status: ProcessingStatus;
  updatedAt: string;
  kind: 'syllabus' | 'sample-paper';
  retryUrl: string;
};

type SyllabusListView = {
  id: string;
  name: string;
  status: ProcessingStatus;
  updatedAt: string;
};

type SamplePaperListView = {
  id: string;
  title: string;
  status: ProcessingStatus;
  updatedAt: string;
};

type ListEnvelope<T> = { data: T[]; meta?: { total?: number } };

type SectionState<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'error'; message: string };

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DashboardClient() {
  const [me, setMe] = useState<AuthMeUser | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);

  const [statsState, setStatsState] = useState<SectionState<InstitutionStats>>({
    kind: 'loading',
  });
  const [subState, setSubState] = useState<
    SectionState<{ subscription: SubscriptionView | null }>
  >({ kind: 'loading' });
  const [activityState, setActivityState] = useState<SectionState<ActivityRow[]>>({
    kind: 'loading',
  });
  const [processingState, setProcessingState] = useState<
    SectionState<ProcessingDoc[]>
  >({ kind: 'loading' });

  // Identity bootstrap
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<{ user: AuthMeUser }>('/api/v1/auth/me');
        if (!cancelled) setMe(data.user);
      } catch (err) {
        if (!cancelled) {
          setIdentityError(
            err instanceof Error
              ? err.message
              : "We couldn't load your profile.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const institutionId = me?.institutionId;

  const refreshAll = useCallback(async () => {
    if (!institutionId) return;
    setStatsState({ kind: 'loading' });
    setSubState({ kind: 'loading' });
    setActivityState({ kind: 'loading' });
    setProcessingState({ kind: 'loading' });

    // Promise.allSettled so a single failure doesn't blank the dashboard.
    const [statsR, subR, activityR, syllabusProcR, syllabusFailedR, sampleProcR, sampleFailedR] =
      await Promise.allSettled([
        getInstitutionStats(institutionId),
        getSubscription(institutionId),
        getInstitutionActivity(institutionId, { limit: 10 }),
        apiFetch<ListEnvelope<SyllabusListView>>(
          `/api/v1/syllabus?status=PROCESSING&limit=5`,
        ),
        apiFetch<ListEnvelope<SyllabusListView>>(
          `/api/v1/syllabus?status=FAILED&limit=5`,
        ),
        apiFetch<ListEnvelope<SamplePaperListView>>(
          `/api/v1/sample-papers?status=PROCESSING&limit=5`,
        ),
        apiFetch<ListEnvelope<SamplePaperListView>>(
          `/api/v1/sample-papers?status=FAILED&limit=5`,
        ),
      ]);

    if (statsR.status === 'fulfilled') {
      setStatsState({ kind: 'ready', data: statsR.value.stats });
    } else {
      setStatsState({ kind: 'error', message: errMsg(statsR.reason) });
    }

    if (subR.status === 'fulfilled') {
      setSubState({ kind: 'ready', data: subR.value });
    } else {
      setSubState({ kind: 'error', message: errMsg(subR.reason) });
    }

    if (activityR.status === 'fulfilled') {
      setActivityState({ kind: 'ready', data: activityR.value.activities });
    } else {
      setActivityState({ kind: 'error', message: errMsg(activityR.reason) });
    }

    // Combine syllabus + sample-paper processing/failed lists. Tolerate
    // partial failures by keeping fulfilled values and ignoring rejections.
    const docs: ProcessingDoc[] = [];
    if (syllabusProcR.status === 'fulfilled') {
      for (const row of syllabusProcR.value.data ?? []) {
        docs.push({
          id: row.id,
          name: row.name,
          status: row.status,
          updatedAt: row.updatedAt,
          kind: 'syllabus',
          retryUrl: `/api/v1/syllabus/${row.id}/reprocess`,
        });
      }
    }
    if (syllabusFailedR.status === 'fulfilled') {
      for (const row of syllabusFailedR.value.data ?? []) {
        docs.push({
          id: row.id,
          name: row.name,
          status: row.status,
          updatedAt: row.updatedAt,
          kind: 'syllabus',
          retryUrl: `/api/v1/syllabus/${row.id}/reprocess`,
        });
      }
    }
    if (sampleProcR.status === 'fulfilled') {
      for (const row of sampleProcR.value.data ?? []) {
        docs.push({
          id: row.id,
          name: row.title,
          status: row.status,
          updatedAt: row.updatedAt,
          kind: 'sample-paper',
          retryUrl: `/api/v1/sample-papers/${row.id}/reprocess`,
        });
      }
    }
    if (sampleFailedR.status === 'fulfilled') {
      for (const row of sampleFailedR.value.data ?? []) {
        docs.push({
          id: row.id,
          name: row.title,
          status: row.status,
          updatedAt: row.updatedAt,
          kind: 'sample-paper',
          retryUrl: `/api/v1/sample-papers/${row.id}/reprocess`,
        });
      }
    }
    // Dedupe by id (same row could appear if status flipped between calls)
    // and prioritize FAILED over PROCESSING.
    const dedupe = new Map<string, ProcessingDoc>();
    for (const doc of docs) {
      const existing = dedupe.get(doc.id);
      if (!existing || (doc.status === 'FAILED' && existing.status !== 'FAILED')) {
        dedupe.set(doc.id, doc);
      }
    }
    // Sort: FAILED first, then by updatedAt desc, cap at 5.
    const merged = Array.from(dedupe.values())
      .sort((a, b) => {
        if (a.status === 'FAILED' && b.status !== 'FAILED') return -1;
        if (b.status === 'FAILED' && a.status !== 'FAILED') return 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      })
      .slice(0, 5);

    // If every processing fetch failed (rare — would need API down), surface
    // error; otherwise present whatever we got.
    const allFailed =
      syllabusProcR.status === 'rejected' &&
      syllabusFailedR.status === 'rejected' &&
      sampleProcR.status === 'rejected' &&
      sampleFailedR.status === 'rejected';
    if (allFailed) {
      setProcessingState({
        kind: 'error',
        message: errMsg(
          (syllabusProcR as PromiseRejectedResult).reason,
        ),
      });
    } else {
      setProcessingState({ kind: 'ready', data: merged });
    }
  }, [institutionId]);

  useEffect(() => {
    if (institutionId) {
      void refreshAll();
    }
  }, [institutionId, refreshAll]);

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
    return <DashboardSkeleton />;
  }

  const firstName = (me.name ?? '').split(' ').filter(Boolean)[0] ?? null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      {/* HERO ---------------------------------------------------------- */}
      <DashboardHero
        institutionName={me.institution.name}
        firstName={firstName}
        subState={subState}
      />

      {/* SETUP CHECKLIST ----------------------------------------------- */}
      <SetupChecklistSection
        statsState={statsState}
        onRetry={refreshAll}
      />

      {/* STATS CARDS --------------------------------------------------- */}
      <StatsCardsSection statsState={statsState} onRetry={refreshAll} />

      {/* TWO-COLUMN — Subscription + AI Processing + Activity --------- */}
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <ProcessingSection
            processingState={processingState}
            onRetry={refreshAll}
          />
          <ActivitySection
            activityState={activityState}
            onRetry={refreshAll}
          />
        </div>
        <SubscriptionSection
          institutionId={me.institutionId}
          subState={subState}
          setSubState={setSubState}
          onRefreshAll={refreshAll}
        />
      </div>

      {/* Footer refresh row */}
      <div className="flex justify-end">
        <VaasenkButton
          variant="ghost"
          size="sm"
          onClick={() => void refreshAll()}
          aria-label={MSG.refreshAll}
        >
          <RefreshCw className="size-4" />
          {MSG.refreshAll}
        </VaasenkButton>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HERO
// ---------------------------------------------------------------------------

function DashboardHero({
  institutionName,
  firstName,
  subState,
}: {
  institutionName: string;
  firstName: string | null;
  subState: SectionState<{ subscription: SubscriptionView | null }>;
}) {
  const plan =
    subState.kind === 'ready' && subState.data.subscription
      ? subState.data.subscription.plan
      : null;
  const planName = plan ? PLAN_COPY[plan].name : null;
  const expiresAt =
    subState.kind === 'ready' && subState.data.subscription?.expiresAt
      ? new Date(subState.data.subscription.expiresAt)
      : null;

  return (
    <section className="relative overflow-hidden rounded-[28px] bg-(image:--gradient-admin-royal) p-8 text-white shadow-[0_24px_60px_rgba(160,0,0,0.24)]">
      <div className="relative z-10 max-w-2xl">
        <p className="text-sm font-medium uppercase tracking-wider text-white/75">
          Admin · {institutionName}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {MSG.greeting(firstName)}
        </h1>
        <p className="mt-2 text-white/85">
          Control and clarity for your institution — students, teachers,
          classrooms, syllabus, billing, and AI configuration all in one place.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
          {planName ? (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider',
                isPaidPlan(plan)
                  ? 'bg-[#FFB000]/20 text-[#FFE6A8] ring-1 ring-inset ring-[#FFB000]/40'
                  : 'bg-white/15 text-white ring-1 ring-inset ring-white/30',
              )}
            >
              {isPaidPlan(plan) ? <Sparkles className="size-3.5" /> : null}
              {planName}
            </span>
          ) : null}
          {expiresAt ? (
            <span className="inline-flex items-center gap-1.5 text-white/80">
              <Clock className="size-3.5" />
              {MSG.renewalLine(formatDateShort(expiresAt))}
            </span>
          ) : null}
        </div>
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 size-72 rounded-full bg-white/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 left-1/3 size-64 rounded-full bg-[#FFB000]/30 blur-3xl"
      />
    </section>
  );
}

function isPaidPlan(plan: SubscriptionView['plan'] | null): boolean {
  return plan === 'STARTER' || plan === 'GROWTH' || plan === 'INSTITUTION';
}

// ---------------------------------------------------------------------------
// SETUP CHECKLIST
// ---------------------------------------------------------------------------

type ChecklistItem = {
  key: string;
  label: string;
  done: boolean;
  href?: string;
};

function SetupChecklistSection({
  statsState,
  onRetry,
}: {
  statsState: SectionState<InstitutionStats>;
  onRetry: () => void;
}) {
  if (statsState.kind === 'loading') {
    return (
      <GlassCard padding="lg">
        <h2 className="text-lg font-semibold text-(--vaasenk-ink)">
          {MSG.setupTitle}
        </h2>
        <p className="mt-1 text-sm text-(--vaasenk-muted)">
          {MSG.setupSubtitle}
        </p>
        <LoadingSkeleton className="mt-5 h-2.5 w-full" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-2xl border border-(--vaasenk-line-sand)/60 bg-white/50 p-3"
            >
              <LoadingSkeleton variant="circle" className="size-6" />
              <LoadingSkeleton variant="text" className="w-2/3" />
            </div>
          ))}
        </div>
      </GlassCard>
    );
  }
  if (statsState.kind === 'error') {
    return (
      <SectionError
        title={MSG.setupTitle}
        message={statsState.message}
        onRetry={onRetry}
      />
    );
  }

  const s = statsState.data;
  const items: ChecklistItem[] = [
    {
      key: 'classes',
      label: 'Add at least one class',
      done: s.totalClassrooms > 0,
      href: '/admin/setup',
    },
    {
      key: 'teachers',
      label: 'Invite at least one teacher',
      done: s.totalTeachers > 0,
      href: '/admin/teachers',
    },
    {
      key: 'students',
      label: 'Add at least one student',
      done: s.totalStudents > 0,
      href: '/admin/students',
    },
    {
      key: 'syllabus',
      label: 'Upload a syllabus',
      done: s.totalSyllabusDocuments > 0,
      href: '/admin/syllabus',
    },
    {
      key: 'sample-paper',
      label: 'Upload a sample paper',
      done: s.totalSamplePapers > 0,
      href: '/admin/sample-papers',
    },
    {
      key: 'notes',
      label: 'Publish your first note',
      done: s.totalNotes > 0,
    },
    {
      key: 'ai',
      label: 'Generate your first AI question paper',
      done: s.totalAiGenerations > 0,
    },
  ];

  const completed = items.filter((i) => i.done).length;
  const pct = Math.round((completed / items.length) * 100);

  if (completed === items.length) {
    return (
      <GlassCard padding="lg">
        <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left">
          <div
            aria-hidden
            className="mr-4 grid size-12 shrink-0 place-items-center rounded-2xl bg-(--vaasenk-success)/15 text-(--vaasenk-success)"
          >
            <CheckCircle2 className="size-6" />
          </div>
          <div className="mt-3 flex-1 sm:mt-0">
            <h2 className="text-lg font-semibold text-(--vaasenk-ink)">
              {MSG.setupAllDone}
            </h2>
            <p className="mt-1 text-sm text-(--vaasenk-muted)">
              Every onboarding milestone is checked. From here it&apos;s teacher and
              student day-to-day usage that drives the dashboard.
            </p>
          </div>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard padding="lg">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-(--vaasenk-ink)">
            {MSG.setupTitle}
          </h2>
          <p className="mt-1 text-sm text-(--vaasenk-muted)">
            {MSG.setupSubtitle}
          </p>
        </div>
        <p className="text-sm font-medium text-(--vaasenk-deep-maroon)">
          {MSG.setupComplete(completed, items.length, pct)}
        </p>
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-(--vaasenk-peach-wash)">
        <div
          className="h-full rounded-full bg-(image:--gradient-brand-flame) transition-[width] duration-500"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Setup progress"
        />
      </div>

      {/* Checklist grid */}
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <li
            key={item.key}
            className={cn(
              'group flex items-center gap-3 rounded-2xl border p-3 transition-colors',
              item.done
                ? 'border-(--vaasenk-success)/30 bg-(--vaasenk-success)/8'
                : 'border-(--vaasenk-line-sand)/80 bg-white/55',
            )}
          >
            {item.done ? (
              <CheckCircle2
                className="size-5 shrink-0 text-(--vaasenk-success)"
                aria-hidden
              />
            ) : (
              <Circle
                className="size-5 shrink-0 text-(--vaasenk-subtle)"
                aria-hidden
              />
            )}
            <span
              className={cn(
                'flex-1 text-sm',
                item.done
                  ? 'text-(--vaasenk-ink) line-through decoration-(--vaasenk-success)/60'
                  : 'text-(--vaasenk-deep-maroon)',
              )}
            >
              {item.label}
            </span>
            {!item.done && item.href ? (
              <Link
                href={item.href}
                className="rounded-full px-2.5 py-1 text-xs font-medium text-(--vaasenk-red) opacity-0 transition-opacity hover:bg-(--vaasenk-rose-wash) group-hover:opacity-100 focus-visible:opacity-100"
              >
                Set up →
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// STATS CARDS
// ---------------------------------------------------------------------------

const STAT_CARDS = [
  {
    key: 'totalTeachers' as const,
    label: 'Teachers',
    icon: GraduationCap,
    sublabel: 'Active teachers',
  },
  {
    key: 'totalStudents' as const,
    label: 'Students',
    icon: Users,
    sublabel: 'Active students',
  },
  {
    key: 'totalClassrooms' as const,
    label: 'Classrooms',
    icon: School,
    sublabel: 'Active rooms',
  },
  {
    key: 'totalNotes' as const,
    label: 'Notes',
    icon: BookOpen,
    sublabel: 'Published notes',
  },
  {
    key: 'totalAiGenerations' as const,
    label: 'AI generations',
    icon: Sparkles,
    sublabel: 'Question papers',
  },
  {
    key: 'totalSyllabusDocuments' as const,
    label: 'Syllabus',
    icon: FileText,
    sublabel: 'AI-indexed',
  },
  {
    key: 'totalSamplePapers' as const,
    label: 'Sample papers',
    icon: ClipboardList,
    sublabel: 'AI-indexed',
  },
];

function StatsCardsSection({
  statsState,
  onRetry,
}: {
  statsState: SectionState<InstitutionStats>;
  onRetry: () => void;
}) {
  if (statsState.kind === 'error') {
    return (
      <SectionError
        title={MSG.statsTitle}
        message={statsState.message}
        onRetry={onRetry}
      />
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-(--vaasenk-subtle)">
        {MSG.statsTitle}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_CARDS.map(({ key, label, icon: Icon, sublabel }) => {
          const value =
            statsState.kind === 'ready' ? statsState.data[key] : null;
          return (
            <GlassCard key={key} padding="md">
              <div className="flex items-start justify-between">
                <p className="text-sm font-medium text-(--vaasenk-muted)">
                  {label}
                </p>
                <Icon className="size-4 text-(--vaasenk-red)" />
              </div>
              {statsState.kind === 'loading' ? (
                <>
                  <LoadingSkeleton className="mt-3 h-8 w-24" />
                  <LoadingSkeleton variant="text" className="mt-2 w-32" />
                </>
              ) : (
                <>
                  <p className="mt-3 text-3xl font-semibold tracking-tight text-(--vaasenk-ink)">
                    {value === 0 ? '—' : value?.toLocaleString('en-IN')}
                  </p>
                  <p className="mt-1 text-xs text-(--vaasenk-subtle)">
                    {sublabel}
                  </p>
                </>
              )}
            </GlassCard>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// AI PROCESSING
// ---------------------------------------------------------------------------

function ProcessingSection({
  processingState,
  onRetry,
}: {
  processingState: SectionState<ProcessingDoc[]>;
  onRetry: () => void;
}) {
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);

  const retry = useCallback(
    async (doc: ProcessingDoc) => {
      setRetrying(doc.id);
      setRetryError(null);
      try {
        await apiFetch(doc.retryUrl, { method: 'POST' });
        // Refresh by triggering the dashboard's full refresh.
        onRetry();
      } catch (err) {
        setRetryError(
          err instanceof Error ? err.message : 'Retry failed.',
        );
      } finally {
        setRetrying(null);
      }
    },
    [onRetry],
  );

  return (
    <GlassCard padding="lg">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-(--vaasenk-ink)">
            {MSG.aiProcessingTitle}
          </h2>
          <p className="mt-1 text-sm text-(--vaasenk-muted)">
            {MSG.aiProcessingSubtitle}
          </p>
        </div>
        <Bot className="size-5 text-(--vaasenk-red)" aria-hidden />
      </header>

      <div className="mt-5">
        {processingState.kind === 'loading' ? (
          <div className="space-y-2.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-2xl border border-(--vaasenk-line-sand)/60 bg-white/50 p-3"
              >
                <LoadingSkeleton variant="circle" className="size-9" />
                <div className="flex-1">
                  <LoadingSkeleton variant="text" className="w-2/3" />
                  <LoadingSkeleton variant="text" className="mt-2 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : processingState.kind === 'error' ? (
          <InlineError
            message={processingState.message}
            onRetry={onRetry}
          />
        ) : processingState.data.length === 0 ? (
          <p className="rounded-2xl border border-(--vaasenk-line-sand)/60 bg-white/55 p-4 text-sm text-(--vaasenk-muted)">
            {MSG.aiProcessingEmpty}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {processingState.data.map((doc) => (
              <ProcessingRow
                key={`${doc.kind}:${doc.id}`}
                doc={doc}
                retrying={retrying === doc.id}
                onRetry={() => void retry(doc)}
              />
            ))}
          </ul>
        )}
        {retryError ? (
          <p
            role="alert"
            className="mt-3 rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/8 px-4 py-2 text-sm text-(--vaasenk-danger)"
          >
            {retryError}
          </p>
        ) : null}
      </div>
    </GlassCard>
  );
}

function ProcessingRow({
  doc,
  retrying,
  onRetry,
}: {
  doc: ProcessingDoc;
  retrying: boolean;
  onRetry: () => void;
}) {
  const Icon = doc.kind === 'syllabus' ? FileText : ClipboardList;
  const isFailed = doc.status === 'FAILED';

  return (
    <li className="flex items-center gap-3 rounded-2xl border border-(--vaasenk-line-sand)/60 bg-white/55 p-3">
      <div
        aria-hidden
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-xl',
          isFailed
            ? 'bg-(--vaasenk-danger)/10 text-(--vaasenk-danger)'
            : 'bg-(--vaasenk-peach-wash) text-(--vaasenk-red)',
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-(--vaasenk-ink)">
          {doc.name}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-(--vaasenk-muted)">
          <StatusChip status={doc.status} />
          <span>·</span>
          <span>{formatRelativeTime(doc.updatedAt)}</span>
        </div>
      </div>
      {isFailed ? (
        <VaasenkButton
          variant="secondary"
          size="sm"
          onClick={onRetry}
          disabled={retrying}
        >
          {retrying ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Retrying…
            </>
          ) : (
            <>
              <RefreshCw className="size-4" /> {MSG.aiProcessingFailedRetry}
            </>
          )}
        </VaasenkButton>
      ) : (
        <span className="hidden text-xs text-(--vaasenk-subtle) sm:inline">
          In progress
        </span>
      )}
    </li>
  );
}

function StatusChip({ status }: { status: ProcessingStatus }) {
  const variant = (() => {
    switch (status) {
      case 'FAILED':
        return {
          className:
            'bg-(--vaasenk-danger)/10 text-(--vaasenk-danger) ring-(--vaasenk-danger)/30',
          label: 'Failed',
        };
      case 'AI_READY':
        return {
          className:
            'bg-(--vaasenk-success)/10 text-(--vaasenk-success) ring-(--vaasenk-success)/30',
          label: 'Ready',
        };
      case 'PROCESSING':
        return {
          className:
            'bg-(--vaasenk-peach-wash) text-(--vaasenk-deep-maroon) ring-(--vaasenk-line-sand)',
          label: 'Processing',
        };
      case 'QUEUED':
        return {
          className:
            'bg-(--vaasenk-peach-wash) text-(--vaasenk-deep-maroon) ring-(--vaasenk-line-sand)',
          label: 'Queued',
        };
      default:
        return {
          className:
            'bg-(--vaasenk-rose-wash) text-(--vaasenk-deep-maroon) ring-(--vaasenk-line-sand)',
          label: status,
        };
    }
  })();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ring-1 ring-inset',
        variant.className,
      )}
    >
      {variant.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// RECENT ACTIVITY
// ---------------------------------------------------------------------------

function ActivitySection({
  activityState,
  onRetry,
}: {
  activityState: SectionState<ActivityRow[]>;
  onRetry: () => void;
}) {
  return (
    <GlassCard padding="lg">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-(--vaasenk-ink)">
            {MSG.activityTitle}
          </h2>
          <p className="mt-1 text-sm text-(--vaasenk-muted)">
            What&apos;s been happening across your institution.
          </p>
        </div>
        <Activity className="size-5 text-(--vaasenk-red)" aria-hidden />
      </header>

      <div className="mt-5">
        {activityState.kind === 'loading' ? (
          <ul className="space-y-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-2xl border border-(--vaasenk-line-sand)/60 bg-white/50 p-3"
              >
                <LoadingSkeleton variant="circle" className="size-9" />
                <div className="flex-1">
                  <LoadingSkeleton variant="text" className="w-3/4" />
                  <LoadingSkeleton variant="text" className="mt-2 w-1/4" />
                </div>
              </li>
            ))}
          </ul>
        ) : activityState.kind === 'error' ? (
          <InlineError
            message={activityState.message}
            onRetry={onRetry}
          />
        ) : activityState.data.length === 0 ? (
          <p className="rounded-2xl border border-(--vaasenk-line-sand)/60 bg-white/55 p-4 text-sm text-(--vaasenk-muted)">
            {MSG.activityEmpty}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {activityState.data.map((row) => (
              <ActivityRowItem key={row.id} row={row} />
            ))}
          </ul>
        )}
      </div>
    </GlassCard>
  );
}

function ActivityRowItem({ row }: { row: ActivityRow }) {
  const isSystem = !row.actor;
  const initials = row.actor
    ? row.actor.name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? '')
        .join('')
    : null;

  return (
    <li className="flex items-center gap-3 rounded-2xl border border-(--vaasenk-line-sand)/60 bg-white/55 p-3">
      <div
        aria-hidden
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold',
          isSystem
            ? 'bg-(image:--gradient-deep-ai-glow) text-white'
            : 'bg-(--vaasenk-peach-wash) text-(--vaasenk-deep-maroon)',
        )}
      >
        {isSystem ? <Bot className="size-4" /> : initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-(--vaasenk-ink)">{row.summary}</p>
        <p className="mt-0.5 text-xs text-(--vaasenk-subtle)">
          {formatRelativeTime(row.createdAt)}
        </p>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// SUBSCRIPTION STATUS
// ---------------------------------------------------------------------------

function SubscriptionSection({
  institutionId,
  subState,
  setSubState,
  onRefreshAll,
}: {
  institutionId: string;
  subState: SectionState<{ subscription: SubscriptionView | null }>;
  setSubState: (
    s: SectionState<{ subscription: SubscriptionView | null }>,
  ) => void;
  onRefreshAll: () => void;
}) {
  const [initializing, setInitializing] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const initialize = async () => {
    setInitializing(true);
    setInitError(null);
    try {
      const updated = await updateSubscription(institutionId, { plan: 'FREE' });
      setSubState({ kind: 'ready', data: { subscription: updated.subscription } });
      onRefreshAll();
    } catch (err) {
      setInitError(
        err instanceof Error ? err.message : 'Could not initialize subscription.',
      );
    } finally {
      setInitializing(false);
    }
  };

  if (subState.kind === 'loading') {
    return (
      <GlassCard padding="lg" className="self-start">
        <h2 className="text-lg font-semibold text-(--vaasenk-ink)">
          {MSG.subscriptionTitle}
        </h2>
        <LoadingSkeleton className="mt-4 h-8 w-32" />
        <div className="mt-5 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <LoadingSkeleton variant="text" className="w-1/3" />
              <LoadingSkeleton className="mt-2 h-2 w-full" />
              <LoadingSkeleton variant="text" className="mt-2 w-1/4" />
            </div>
          ))}
        </div>
      </GlassCard>
    );
  }
  if (subState.kind === 'error') {
    return (
      <SectionError
        title={MSG.subscriptionTitle}
        message={subState.message}
        onRetry={onRefreshAll}
      />
    );
  }

  const sub = subState.data.subscription;

  if (!sub) {
    return (
      <GlassCard padding="lg" className="self-start">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-(--vaasenk-ink)">
              {MSG.subscriptionTitle}
            </h2>
            <p className="mt-1 text-sm text-(--vaasenk-muted)">
              {MSG.subscriptionNoneDescription}
            </p>
          </div>
          <CreditCard className="size-5 text-(--vaasenk-red)" aria-hidden />
        </header>
        {initError ? (
          <p
            role="alert"
            className="mt-4 rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/8 px-4 py-3 text-sm text-(--vaasenk-danger)"
          >
            {initError}
          </p>
        ) : null}
        <div className="mt-5 flex">
          <VaasenkButton
            variant="primary"
            size="md"
            onClick={() => void initialize()}
            disabled={initializing}
          >
            {initializing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {MSG.subscriptionInitializing}
              </>
            ) : (
              MSG.subscriptionInitCta
            )}
          </VaasenkButton>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard padding="lg" className="self-start">
      <SubscriptionPanel sub={sub} showManageLink />
    </GlassCard>
  );
}

/**
 * Self-contained subscription summary panel — used on the admin dashboard
 * AND embedded into the billing page so both surfaces stay in sync.
 */
export function SubscriptionPanel({
  sub,
  showManageLink,
}: {
  sub: SubscriptionView;
  showManageLink?: boolean;
}) {
  const planCopy = PLAN_COPY[sub.plan];

  return (
    <>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-(--vaasenk-ink)">
            {MSG.subscriptionTitle}
          </h2>
          <p className="mt-1 text-sm text-(--vaasenk-muted)">
            {planCopy.tagline}
          </p>
        </div>
        <CreditCard className="size-5 text-(--vaasenk-red)" aria-hidden />
      </header>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="text-2xl font-semibold tracking-tight text-(--vaasenk-ink)">
          {planCopy.name}
        </span>
        <SubscriptionStatusChip status={sub.status} expiresAt={sub.expiresAt} />
      </div>

      <div className="mt-6 space-y-5">
        <UsageBar
          label="Users"
          used={sub.currentUsers}
          cap={sub.userLimit}
          formatValue={(v) => v.toLocaleString('en-IN')}
        />
        <UsageBar
          label="Storage"
          used={sub.storageUsedGb}
          cap={sub.storageLimitGb}
          formatValue={(v) => `${v.toFixed(2)} GB`}
        />
        <UsageBar
          label="AI credits"
          used={sub.aiCreditsUsed}
          cap={sub.aiCreditsMonthly}
          formatValue={(v) => v.toLocaleString('en-IN')}
          unit="tokens"
        />
      </div>

      {sub.expiresAt ? (
        <p className="mt-5 text-xs text-(--vaasenk-muted)">
          Renews / ends on{' '}
          <span className="font-medium text-(--vaasenk-deep-maroon)">
            {formatDateShort(new Date(sub.expiresAt))}
          </span>
        </p>
      ) : (
        <p className="mt-5 text-xs text-(--vaasenk-subtle)">
          {MSG.renewalNone}
        </p>
      )}

      {showManageLink ? (
        <Link href="/admin/billing" className="mt-5 inline-block">
          <VaasenkButton variant="secondary" size="md">
            <CreditCard className="size-4" />
            {MSG.manageBilling}
          </VaasenkButton>
        </Link>
      ) : null}
    </>
  );
}

function SubscriptionStatusChip({
  status,
  expiresAt,
}: {
  status: SubscriptionView['status'];
  expiresAt: string | null;
}) {
  // "Expiring soon" overlay if within 14 days
  let label = status.replace('_', ' ');
  let className =
    'bg-(--vaasenk-rose-wash) text-(--vaasenk-deep-maroon) ring-(--vaasenk-line-sand)';
  if (status === 'ACTIVE') {
    className =
      'bg-(--vaasenk-success)/15 text-(--vaasenk-success) ring-(--vaasenk-success)/30';
    label = 'Active';
  }
  if (status === 'CANCELED') {
    className =
      'bg-(--vaasenk-danger)/10 text-(--vaasenk-danger) ring-(--vaasenk-danger)/30';
    label = 'Canceled';
  }
  if (status === 'EXPIRED') {
    className =
      'bg-(--vaasenk-danger)/10 text-(--vaasenk-danger) ring-(--vaasenk-danger)/30';
    label = 'Expired';
  }
  if (status === 'PAST_DUE') {
    className =
      'bg-(--vaasenk-gold)/20 text-(--vaasenk-deep-maroon) ring-(--vaasenk-gold)/40';
    label = 'Past due';
  }
  if (status === 'ACTIVE' && expiresAt) {
    const days = Math.ceil(
      (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    if (days <= 14 && days >= 0) {
      label = `Expiring in ${days}d`;
      className =
        'bg-(--vaasenk-gold)/20 text-(--vaasenk-deep-maroon) ring-(--vaasenk-gold)/40';
    }
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ring-1 ring-inset',
        className,
      )}
    >
      {label}
    </span>
  );
}

function UsageBar({
  label,
  used,
  cap,
  formatValue,
  unit,
}: {
  label: string;
  used: number;
  cap: number;
  formatValue: (v: number) => string;
  unit?: string;
}) {
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const barClass =
    cap <= 0
      ? 'bg-(--vaasenk-line-sand)'
      : pct >= 95
        ? 'bg-(--vaasenk-danger)'
        : pct > 80
          ? 'bg-(image:--gradient-brand-flame)'
          : 'bg-(image:--gradient-brand-flame)';
  const valueColor =
    pct >= 95
      ? 'text-(--vaasenk-danger)'
      : pct > 80
        ? 'text-(--vaasenk-deep-maroon)'
        : 'text-(--vaasenk-ink)';

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-(--vaasenk-deep-maroon)">
          {label}
        </p>
        <p className={cn('text-sm font-medium tabular-nums', valueColor)}>
          {formatValue(used)} <span className="text-(--vaasenk-subtle)">/</span>{' '}
          {cap <= 0 ? '—' : formatValue(cap)}
          {unit ? <span className="ml-1 text-(--vaasenk-subtle)">{unit}</span> : null}
        </p>
      </div>
      <div
        className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-(--vaasenk-peach-wash)"
        role="progressbar"
        aria-label={`${label} usage`}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', barClass)}
          style={{ width: cap <= 0 ? '0%' : `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-(--vaasenk-subtle)">
        {cap <= 0 ? 'No allowance on this plan' : `${pct}% used`}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable helpers
// ---------------------------------------------------------------------------

function SectionError({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <GlassCard padding="lg">
      <h2 className="text-lg font-semibold text-(--vaasenk-ink)">{title}</h2>
      <InlineError message={message} onRetry={onRetry} />
    </GlassCard>
  );
}

function InlineError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="mt-3 flex flex-col items-start gap-3 rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/8 px-4 py-3 text-sm text-(--vaasenk-danger)"
    >
      <span>
        {MSG.errorLoading} {message}
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-(--vaasenk-red) ring-1 ring-inset ring-(--vaasenk-danger)/30 hover:bg-white"
      >
        <RefreshCw className="size-3.5" />
        {MSG.retry}
      </button>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <LoadingSkeleton className="h-44 w-full" />
      <LoadingSkeleton className="h-48 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <LoadingSkeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <LoadingSkeleton className="h-72 w-full" />
        <LoadingSkeleton className="h-72 w-full" />
      </div>
    </div>
  );
}

function errMsg(reason: unknown): string {
  if (reason instanceof ApiClientError) return reason.message;
  if (reason instanceof Error) return reason.message;
  return 'Unexpected error.';
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
