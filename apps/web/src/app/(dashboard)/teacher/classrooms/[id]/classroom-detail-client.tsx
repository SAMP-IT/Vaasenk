'use client';

import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Copy,
  FileQuestion,
  Loader2,
  Sparkles,
  Settings as SettingsIcon,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GlassCard } from '@/components/ui/glass-card';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { VaasenkButton } from '@/components/ui/vaasenk-button';
import { ApiClientError, apiFetch, apiFetchEnvelope } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { AiAssistantTab } from './ai-assistant-tab';
import { NotesTab } from './notes-tab';
import { TabPlaceholder } from './tab-placeholder';

const MSG = {
  backToClassrooms: 'Back to classrooms',
  eyebrow: 'Classroom',
  copyInviteCode: 'Copy invite code',
  copied: 'Copied!',
  syllabusReady: 'Syllabus indexed',
  syllabusPending: 'Syllabus indexing',
  syllabusMissing: 'No syllabus mapped',
  noInviteCode: 'No invite code yet',
  inviteExpires: (date: string) => `Expires ${date}`,
  inviteNeverExpires: 'Never expires',
  generateNewCode: 'Generate new code',
  errorTitle: 'Couldn’t load this classroom',
  errorBody:
    'We hit a snag fetching the classroom details. Try refreshing, or head back to your classroom list.',
  retry: 'Retry',
  goBack: 'Back to classrooms',
  membersHeading: 'Students enrolled',
  membersHelper:
    'These are the students currently in the classroom. Share your invite code to bring more in.',
  noStudents: 'No students enrolled yet.',
  noStudentsHelper:
    'Share the invite code below — students will appear here the moment they join.',
  studentRoleBadge: 'Student',
  inviteCodeHeading: 'Invite code',
  expireSelectLabel: 'New code expires in',
  expireOptions: [
    { value: 1, label: '1 day' },
    { value: 7, label: '7 days' },
    { value: 30, label: '30 days' },
    { value: 90, label: '90 days' },
    { value: 0, label: 'Never (keep open)' },
  ] as const,
  settingsHeading: 'Classroom settings',
  settingsHelper:
    'Read-only for now. Rename, archive, and transfer-teacher controls land in Sprint 8.',
  settingsComingSoon: 'Coming in Sprint 8',
  joined: (date: string) => `Joined ${date}`,
  loadingHint: 'Loading classroom…',
} as const;

type ClassroomDetail = {
  id: string;
  institutionId: string;
  name: string;
  status: string;
  inviteCode: string | null;
  inviteExpiresAt: string | null;
  class: { id: string; name: string } | null;
  section: { id: string; name: string } | null;
  subject: { id: string; name: string } | null;
  teacher: {
    id: string;
    name: string;
    email: string | null;
    avatarUrl: string | null;
  } | null;
  academicYear: {
    id: string;
    name: string;
    isActive: boolean;
  } | null;
  syllabus: { id: string; name: string; status: string } | null;
  aiChatbot: {
    id: string;
    status: string;
    enabledForStudents: boolean;
  } | null;
  members: ClassroomMember[];
  setupSummary: {
    hasSyllabus: boolean;
    syllabusStatus: string | null;
    hasInviteCode: boolean;
    inviteExpiresAt: string | null;
  };
  _count: { members: number; notes: number };
};

type ClassroomMember = {
  id: string;
  classroomId: string;
  userId: string;
  joinedAt: string;
  status: string;
  user: {
    id: string;
    name: string;
    email: string | null;
    avatarUrl: string | null;
    role?: string;
  };
};

type ClassroomListMember = {
  id: string;
  userId: string;
  joinedAt: string;
  status: string;
  user: {
    id: string;
    name: string;
    email: string | null;
    avatarUrl: string | null;
  };
};

type TabKey = 'NOTES' | 'PAPERS' | 'AI' | 'STUDENTS' | 'SETTINGS';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'NOTES', label: 'Notes' },
  { key: 'PAPERS', label: 'Papers' },
  { key: 'AI', label: 'AI Assistant' },
  { key: 'STUDENTS', label: 'Students' },
  { key: 'SETTINGS', label: 'Settings' },
];

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
).replace(/\/$/, '');

export function ClassroomDetailClient({ classroomId }: { classroomId: string }) {
  const [activeTab, setActiveTab] = useState<TabKey>('NOTES');

  const [classroom, setClassroom] = useState<ClassroomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [banner, setBanner] = useState<string | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [codeCopied, setCodeCopied] = useState(false);
  const codeCopiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pull the Supabase session once — the upload drawer needs a raw access
  // token for its XHR-based progress upload.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!cancelled) setAccessToken(session?.access_token ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchClassroom = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      setError(null);
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);
      try {
        const result = await apiFetch<{ classroom: ClassroomDetail }>(
          `/api/v1/classrooms/${classroomId}`,
        );
        setClassroom(result.classroom);
      } catch (err) {
        const msg =
          err instanceof ApiClientError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Something went wrong.';
        setError(msg);
        setClassroom(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [classroomId],
  );

  useEffect(() => {
    fetchClassroom('initial');
  }, [fetchClassroom]);

  const flashBanner = useCallback((msg: string) => {
    setBanner(msg);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), 4200);
  }, []);

  useEffect(() => {
    return () => {
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
      if (codeCopiedTimer.current) clearTimeout(codeCopiedTimer.current);
    };
  }, []);

  const handleCopyCode = async () => {
    if (!classroom?.inviteCode) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(classroom.inviteCode);
      } else {
        const ta = document.createElement('textarea');
        ta.value = classroom.inviteCode;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCodeCopied(true);
      if (codeCopiedTimer.current) clearTimeout(codeCopiedTimer.current);
      codeCopiedTimer.current = setTimeout(() => setCodeCopied(false), 2200);
    } catch {
      flashBanner('Could not copy. Long-press the code to copy it manually.');
    }
  };

  const handleRefreshCode = async (expiresInDays: number | null) => {
    try {
      const body: { expiresInDays?: number | null } = {};
      // Per the API, omitting `expiresInDays` falls back to the default; 0
      // means "never expires" → we send `null` explicitly.
      if (expiresInDays === null) {
        body.expiresInDays = null;
      } else if (expiresInDays > 0) {
        body.expiresInDays = expiresInDays;
      }
      const result = await apiFetch<{ classroom: ClassroomDetail }>(
        `/api/v1/classrooms/${classroomId}/refresh-code`,
        { method: 'POST', body },
      );
      setClassroom(result.classroom);
      flashBanner('New invite code ready. Old code stopped working.');
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not refresh the code.';
      flashBanner(msg);
    }
  };

  // -------------------------------------------------------------------------
  // Render — top-level
  // -------------------------------------------------------------------------
  if (loading) {
    return <ClassroomDetailSkeleton />;
  }

  if (error || !classroom) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <Link
          href="/teacher"
          className="inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-(--vaasenk-deep-maroon) transition-colors hover:bg-(--vaasenk-rose-wash) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30"
        >
          <ArrowLeft className="size-4" />
          {MSG.backToClassrooms}
        </Link>
        <GlassCard padding="lg" className="text-center">
          <div
            aria-hidden
            className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-(--vaasenk-danger)/10 text-(--vaasenk-danger)"
          >
            <AlertCircle className="size-6" />
          </div>
          <h3 className="text-xl font-semibold text-(--vaasenk-ink)">
            {MSG.errorTitle}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-(--vaasenk-muted)">
            {error ?? MSG.errorBody}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <VaasenkButton
              variant="secondary"
              size="md"
              onClick={() => fetchClassroom('initial')}
            >
              {MSG.retry}
            </VaasenkButton>
            <Link href="/teacher">
              <VaasenkButton variant="ghost" size="md" asChild={false}>
                {MSG.goBack}
              </VaasenkButton>
            </Link>
          </div>
        </GlassCard>
      </div>
    );
  }

  const subtitleParts: string[] = [];
  subtitleParts.push(
    `${classroom._count.members} student${classroom._count.members === 1 ? '' : 's'}`,
  );
  subtitleParts.push(
    `${classroom._count.notes} note${classroom._count.notes === 1 ? '' : 's'}`,
  );
  if (classroom.teacher?.name) subtitleParts.push(classroom.teacher.name);
  if (classroom.academicYear?.name) {
    subtitleParts.push(classroom.academicYear.name);
  }
  const syllabusBadge = renderSyllabusBadge(classroom);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      {/* Back link */}
      <Link
        href="/teacher"
        className="inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-(--vaasenk-deep-maroon) transition-colors hover:bg-(--vaasenk-rose-wash) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30"
      >
        <ArrowLeft className="size-4" />
        {MSG.backToClassrooms}
      </Link>

      {/* Hero — Teacher Orange */}
      <section className="relative overflow-hidden rounded-[28px] bg-(image:--gradient-teacher-orange) p-8 text-white shadow-[0_24px_60px_rgba(255,122,26,0.24)]">
        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-wider text-white/80">
              {MSG.eyebrow}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              {classroom.name}
            </h1>
            <p className="mt-3 text-sm text-white/85 sm:text-base">
              {subtitleParts.join(' · ')}
            </p>
            {syllabusBadge ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {syllabusBadge}
              </div>
            ) : null}
          </div>

          {/* Invite code chip */}
          {classroom.inviteCode ? (
            <div className="flex shrink-0 flex-col items-end gap-2">
              <button
                type="button"
                onClick={handleCopyCode}
                aria-label={MSG.copyInviteCode}
                className="group inline-flex min-h-[44px] items-center gap-3 rounded-full border border-white/30 bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <span className="text-xs uppercase tracking-wider text-white/70">
                  Invite code
                </span>
                <span className="font-mono text-base tracking-[0.18em]">
                  {classroom.inviteCode}
                </span>
                {codeCopied ? (
                  <CheckCircle2 className="size-4 text-(--vaasenk-gold)" />
                ) : (
                  <Copy className="size-4 opacity-80 group-hover:opacity-100" />
                )}
              </button>
              <p className="text-xs text-white/70">
                {classroom.inviteExpiresAt
                  ? MSG.inviteExpires(formatShortDate(classroom.inviteExpiresAt))
                  : MSG.inviteNeverExpires}
              </p>
            </div>
          ) : null}
        </div>

        {/* Decorative blobs */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-white/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 right-1/4 size-56 rounded-full bg-vaasenk-gold/30 blur-3xl"
        />
      </section>

      {/* Transient banner */}
      {banner ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2.5 rounded-2xl border border-(--vaasenk-success)/30 bg-(--vaasenk-success)/10 px-4 py-3 text-sm font-medium text-(--vaasenk-success)"
        >
          <CheckCircle2 className="size-4" />
          {banner}
        </div>
      ) : null}

      {/* Tabs */}
      <div className="-mx-2 overflow-x-auto px-2">
        <div
          role="tablist"
          aria-label="Classroom sections"
          className="flex items-center gap-2"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={activeTab === t.key}
              aria-controls={`classroom-tab-${t.key}`}
              id={`classroom-tab-trigger-${t.key}`}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                'inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30 focus-visible:ring-offset-2 focus-visible:ring-offset-(--vaasenk-warm-canvas)',
                activeTab === t.key
                  ? 'bg-(image:--gradient-brand-flame) text-white shadow-[0_8px_24px_rgba(160,0,0,0.22)]'
                  : 'border border-(--vaasenk-line-sand) bg-white/70 text-(--vaasenk-deep-maroon) hover:border-(--vaasenk-red)/40 hover:bg-white',
              )}
            >
              {t.label}
            </button>
          ))}
          {refreshing ? (
            <span
              role="status"
              aria-live="polite"
              className="ml-3 inline-flex items-center gap-1.5 text-xs text-(--vaasenk-subtle)"
            >
              <Loader2 className="size-3 animate-spin" />
              Updating…
            </span>
          ) : null}
        </div>
      </div>

      {/* Tab body */}
      <div
        role="tabpanel"
        id={`classroom-tab-${activeTab}`}
        aria-labelledby={`classroom-tab-trigger-${activeTab}`}
      >
        {activeTab === 'NOTES' ? (
          <NotesTab
            classroomId={classroom.id}
            classroomName={classroom.name}
            apiBaseUrl={API_BASE}
            accessToken={accessToken}
            onTransientBanner={flashBanner}
          />
        ) : null}

        {activeTab === 'PAPERS' ? (
          <TabPlaceholder
            icon={FileQuestion}
            title="AI question papers"
            description="Pick the portion, pattern, and difficulty — Vaasenk drafts a structured paper with the answer key. Source citations included."
            sprintTag="Coming in Sprint 5"
            previewCta="Generate question paper"
          />
        ) : null}

        {activeTab === 'AI' ? (
          <AiAssistantTab
            classroomId={classroom.id}
            classroom={{
              id: classroom.id,
              name: classroom.name,
              subject: classroom.subject,
              class: classroom.class,
              section: classroom.section,
              syllabus: classroom.syllabus,
              aiChatbot: classroom.aiChatbot,
            }}
            onSwitchTab={(t) => setActiveTab(t)}
          />
        ) : null}

        {activeTab === 'STUDENTS' ? (
          <StudentsTab
            classroomId={classroom.id}
            initialMembers={classroom.members}
            inviteCode={classroom.inviteCode}
            inviteExpiresAt={classroom.inviteExpiresAt}
            onRefreshCode={handleRefreshCode}
          />
        ) : null}

        {activeTab === 'SETTINGS' ? (
          <SettingsTab
            classroom={classroom}
            onRefreshCode={handleRefreshCode}
          />
        ) : null}
      </div>
    </div>
  );
}

// =============================================================================
// Subcomponents — kept local; they're tightly coupled to the classroom shape.
// =============================================================================

function renderSyllabusBadge(classroom: ClassroomDetail) {
  const summary = classroom.setupSummary;
  if (!summary.hasSyllabus || !classroom.syllabus) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur">
        <BookOpen className="size-3.5" />
        {MSG.syllabusMissing}
      </span>
    );
  }
  const ready =
    summary.syllabusStatus &&
    ['ACTIVE', 'INDEXED', 'READY'].includes(summary.syllabusStatus);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold backdrop-blur',
        ready
          ? 'bg-(--vaasenk-gold)/30 text-white'
          : 'bg-white/15 text-white/90',
      )}
    >
      <Sparkles className="size-3.5" />
      {ready ? MSG.syllabusReady : MSG.syllabusPending}
      <span className="font-normal text-white/80">· {classroom.syllabus.name}</span>
    </span>
  );
}

function ClassroomDetailSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy
      className="mx-auto flex max-w-6xl flex-col gap-6"
    >
      <span className="sr-only">{MSG.loadingHint}</span>
      <LoadingSkeleton variant="text" className="h-5 w-40" />
      <div className="overflow-hidden rounded-[28px] bg-(image:--gradient-teacher-orange) p-8">
        <LoadingSkeleton variant="text" className="h-3 w-24 bg-white/40" />
        <div className="mt-3">
          <LoadingSkeleton variant="text" className="h-8 w-3/4 bg-white/40" />
        </div>
        <div className="mt-4">
          <LoadingSkeleton variant="text" className="h-4 w-2/3 bg-white/40" />
        </div>
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <LoadingSkeleton key={i} variant="rect" className="h-11 w-28" />
        ))}
      </div>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <li
            key={i}
            className="overflow-hidden rounded-[24px] border border-(--vaasenk-line-sand) bg-white/70"
          >
            <LoadingSkeleton variant="rect" className="aspect-[16/9] w-full" />
            <div className="space-y-3 p-5">
              <LoadingSkeleton variant="text" className="w-4/5" />
              <LoadingSkeleton variant="text" className="w-3/5" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Students tab ---------------------------------------------------

function StudentsTab({
  classroomId,
  initialMembers,
  inviteCode,
  inviteExpiresAt,
  onRefreshCode,
}: {
  classroomId: string;
  initialMembers: ClassroomMember[];
  inviteCode: string | null;
  inviteExpiresAt: string | null;
  onRefreshCode: (expiresInDays: number | null) => void;
}) {
  const [members, setMembers] = useState<ClassroomMember[]>(initialMembers);
  const [meta, setMeta] = useState<{
    page: number;
    limit: number;
    total: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Always re-fetch when the tab is selected so we get the freshest count +
  // a full page rather than just the first 20 baked into the detail blob.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await apiFetchEnvelope<ClassroomListMember[]>(
          `/api/v1/classrooms/${classroomId}/members?role=STUDENT&status=ACTIVE&page=1&limit=50`,
        );
        if (cancelled) return;
        // The endpoint returns members without `classroomId` directly on the
        // row; mirror the detail shape so render stays uniform.
        const rows: ClassroomMember[] = (result.data ?? []).map((m) => ({
          id: m.id,
          classroomId,
          userId: m.userId,
          joinedAt: m.joinedAt,
          status: m.status,
          user: m.user,
        }));
        setMembers(rows);
        setMeta(
          result.meta && typeof result.meta.total === 'number'
            ? {
                page: result.meta.page ?? 1,
                limit: result.meta.limit ?? rows.length,
                total: result.meta.total,
              }
            : null,
        );
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'Could not load students.',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classroomId]);

  return (
    <div className="flex flex-col gap-5">
      <GlassCard padding="lg">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-(--vaasenk-ink)">
            {MSG.membersHeading}
            {meta?.total ? (
              <span className="ml-2 text-sm font-normal text-(--vaasenk-muted)">
                ({meta.total})
              </span>
            ) : null}
          </h2>
          <p className="text-sm text-(--vaasenk-muted)">
            {MSG.membersHelper}
          </p>
        </div>

        {error ? (
          <div
            role="alert"
            className="mt-4 rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-4 py-3 text-sm text-(--vaasenk-danger)"
          >
            {error}
          </div>
        ) : null}

        {loading && members.length === 0 ? (
          <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-2xl border border-(--vaasenk-line-sand)/60 bg-white/60 p-4"
              >
                <LoadingSkeleton variant="circle" className="size-10" />
                <div className="flex-1 space-y-2">
                  <LoadingSkeleton variant="text" className="w-2/3" />
                  <LoadingSkeleton variant="text" className="w-1/2" />
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {!loading && members.length === 0 && !error ? (
          <div className="mt-5 rounded-2xl border border-dashed border-(--vaasenk-line-sand) bg-white/60 p-8 text-center">
            <Users className="mx-auto size-7 text-(--vaasenk-red)" />
            <p className="mt-3 text-sm font-medium text-(--vaasenk-ink)">
              {MSG.noStudents}
            </p>
            <p className="mt-1 text-sm text-(--vaasenk-muted)">
              {MSG.noStudentsHelper}
            </p>
          </div>
        ) : null}

        {members.length > 0 ? (
          <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 rounded-2xl border border-(--vaasenk-line-sand)/60 bg-white/75 p-4"
              >
                <MemberAvatar name={m.user.name} url={m.user.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-(--vaasenk-ink)">
                    {m.user.name}
                  </p>
                  <p className="truncate text-xs text-(--vaasenk-muted)">
                    {m.user.email ?? '—'}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-2 text-xs text-(--vaasenk-subtle)">
                    <span className="inline-flex items-center rounded-full bg-(--vaasenk-rose-wash) px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-(--vaasenk-deep-maroon)">
                      {MSG.studentRoleBadge}
                    </span>
                    <span>{MSG.joined(formatShortDate(m.joinedAt))}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </GlassCard>

      <InviteCodeCard
        inviteCode={inviteCode}
        inviteExpiresAt={inviteExpiresAt}
        onRefreshCode={onRefreshCode}
      />
    </div>
  );
}

function MemberAvatar({
  name,
  url,
}: {
  name: string;
  url: string | null;
}) {
  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={40}
        height={40}
        unoptimized
        className="size-10 shrink-0 rounded-full object-cover ring-1 ring-(--vaasenk-line-sand)"
      />
    );
  }
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?';
  return (
    <span
      aria-hidden
      className="grid size-10 shrink-0 place-items-center rounded-full bg-(image:--gradient-student-coral) text-sm font-semibold text-white"
    >
      {initials}
    </span>
  );
}

// ---------- Settings tab ---------------------------------------------------

function SettingsTab({
  classroom,
  onRefreshCode,
}: {
  classroom: ClassroomDetail;
  onRefreshCode: (expiresInDays: number | null) => void;
}) {
  const rows: { label: string; value: string }[] = [
    { label: 'Class', value: classroom.class?.name ?? '—' },
    { label: 'Section', value: classroom.section?.name ?? '—' },
    { label: 'Subject', value: classroom.subject?.name ?? '—' },
    { label: 'Teacher', value: classroom.teacher?.name ?? '—' },
    {
      label: 'Academic year',
      value: classroom.academicYear?.name ?? '—',
    },
    {
      label: 'Syllabus',
      value:
        classroom.syllabus?.name ??
        (classroom.setupSummary.hasSyllabus ? 'Mapped' : 'Not mapped'),
    },
    { label: 'Status', value: classroom.status },
  ];

  return (
    <div className="flex flex-col gap-5">
      <GlassCard padding="lg">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-(--vaasenk-ink)">
            {MSG.settingsHeading}
          </h2>
          <p className="text-sm text-(--vaasenk-muted)">
            {MSG.settingsHelper}
          </p>
        </div>
        <dl className="mt-5 divide-y divide-(--vaasenk-line-sand)/60 rounded-2xl border border-(--vaasenk-line-sand)/60 bg-white/70">
          {rows.map((r) => (
            <div
              key={r.label}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <dt className="text-sm font-medium text-(--vaasenk-deep-maroon)">
                {r.label}
              </dt>
              <dd className="text-sm text-(--vaasenk-ink)">{r.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {(
            [
              { label: 'Rename classroom', icon: SettingsIcon },
              { label: 'Archive classroom', icon: ShieldCheck },
              { label: 'Transfer teacher', icon: Users },
              { label: 'Edit subject metadata', icon: BookOpen },
            ] as const
          ).map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              disabled
              aria-disabled="true"
              title="Coming in Sprint 8"
              className="flex cursor-not-allowed items-center justify-between gap-3 rounded-2xl border border-dashed border-(--vaasenk-line-sand) bg-white/50 px-4 py-3 text-left opacity-80"
            >
              <span className="flex items-center gap-2.5">
                <Icon className="size-4 text-(--vaasenk-subtle)" />
                <span className="text-sm font-medium text-(--vaasenk-ink)">
                  {label}
                </span>
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-(--vaasenk-subtle)">
                {MSG.settingsComingSoon}
                <ChevronRight className="size-3.5" />
              </span>
            </button>
          ))}
        </div>
      </GlassCard>

      <InviteCodeCard
        inviteCode={classroom.inviteCode}
        inviteExpiresAt={classroom.inviteExpiresAt}
        onRefreshCode={onRefreshCode}
      />
    </div>
  );
}

// ---------- Invite code card (shared between Students & Settings tabs) -----

function InviteCodeCard({
  inviteCode,
  inviteExpiresAt,
  onRefreshCode,
}: {
  inviteCode: string | null;
  inviteExpiresAt: string | null;
  onRefreshCode: (expiresInDays: number | null) => void;
}) {
  const [expireSel, setExpireSel] = useState<number>(7);
  const [submitting, setSubmitting] = useState(false);

  const handleRefresh = async () => {
    setSubmitting(true);
    try {
      // Map our select "0" to null (never expires) per the brief.
      await onRefreshCode(expireSel === 0 ? null : expireSel);
    } finally {
      setSubmitting(false);
    }
  };

  const expiryHint = useMemo(() => {
    if (!inviteCode) return MSG.noInviteCode;
    if (!inviteExpiresAt) return MSG.inviteNeverExpires;
    return MSG.inviteExpires(formatShortDate(inviteExpiresAt));
  }, [inviteCode, inviteExpiresAt]);

  return (
    <GlassCard padding="lg">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-(--vaasenk-ink)">
          {MSG.inviteCodeHeading}
        </h2>
        <p className="text-sm text-(--vaasenk-muted)">
          Share this code with students so they can join the classroom from
          the mobile app or web.
        </p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[auto_1fr] lg:items-center">
        <div className="flex items-center gap-3 rounded-2xl border border-(--vaasenk-line-sand) bg-(image:--gradient-cream-sunrise) px-5 py-4">
          <span
            aria-hidden
            className="grid size-11 place-items-center rounded-xl bg-white text-(--vaasenk-red)"
          >
            <Calendar className="size-5" />
          </span>
          <div>
            <p className="font-mono text-2xl font-semibold tracking-[0.18em] text-(--vaasenk-deep-maroon)">
              {inviteCode ?? '———'}
            </p>
            <p className="text-xs text-(--vaasenk-muted)">{expiryHint}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-end">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="invite-code-expire"
              className="text-xs font-medium text-(--vaasenk-deep-maroon)"
            >
              {MSG.expireSelectLabel}
            </label>
            <select
              id="invite-code-expire"
              value={expireSel}
              onChange={(e) => setExpireSel(Number(e.target.value))}
              disabled={submitting}
              className="min-h-[44px] rounded-2xl border border-(--vaasenk-line-sand) bg-white/85 px-4 py-2 text-sm text-(--vaasenk-ink) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {MSG.expireOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <VaasenkButton
            variant="primary"
            size="md"
            onClick={handleRefresh}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Refreshing…
              </>
            ) : (
              <>
                <SettingsIcon className="size-4" />
                {MSG.generateNewCode}
              </>
            )}
          </VaasenkButton>
        </div>
      </div>
    </GlassCard>
  );
}

function formatShortDate(iso: string): string {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return '—';
  const now = new Date();
  return target.toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    ...(now.getFullYear() === target.getFullYear() ? {} : { year: 'numeric' }),
  });
}
