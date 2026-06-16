'use client';

import {
  AlertCircle,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  GraduationCap,
  Lock,
  Plus,
  School,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { GlassCard } from '@/components/ui/glass-card';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { VaasenkButton } from '@/components/ui/vaasenk-button';
import { apiFetch } from '@/lib/api-client';
import {
  listClassrooms,
  type ClassroomView,
  type SyllabusProcessingStatus,
} from '@/lib/classrooms-api';
import { cn } from '@/lib/utils';
import { CreateClassroomDrawer } from './create-classroom-drawer';

/**
 * Admin classroom list + creation surface (`/admin/classrooms`).
 *
 * Replaces the Sprint 8.2 "Coming in v2" placeholder. Renders the Admin Royal
 * hero + a searchable card grid of every classroom in the institution, with
 * each card showing the invite code (copy-to-clipboard) and member/note
 * counts. The "Create classroom" CTA opens the drawer which ends on a
 * prominent invite-code hand-off.
 *
 * All 5 component states (default / loading skeleton / empty / error-with-retry
 * / disabled) per CLAUDE.md §5.
 *
 * Creation is admin-only. The backend gates POST /classrooms to ADMIN /
 * SUPER_ADMIN; we ALSO check user.role from /auth/me before rendering the
 * create action so we don't rely on CSS hiding (vaasenk-component skill §10).
 */

// ---------------------------------------------------------------------------
// Strings
// ---------------------------------------------------------------------------

const MSG = {
  eyebrow: 'Admin · Operations',
  title: 'Classrooms',
  subtitle:
    'Create classrooms, assign teachers, and hand out invite codes so students can join.',
  createCta: 'Create classroom',

  searchPlaceholder: 'Search by name, class, subject, or teacher…',

  emptyTitle: 'No classrooms yet',
  emptyDescription:
    'Create your first classroom — pick a class, subject, and teacher, and you’ll get an invite code for students to join.',
  emptyCta: 'Create classroom',
  noMatch: 'No classrooms match your search.',
  clearSearch: 'Clear search',

  errorTitle: 'Couldn’t load classrooms',
  retry: 'Retry',

  showing: (n: number, total: number) =>
    total === n ? `${total} ${total === 1 ? 'classroom' : 'classrooms'}` : `${n} of ${total}`,

  inviteCode: 'Invite code',
  copyCode: 'Copy invite code',
  copied: 'Copied',
  noCode: 'No code',
  members: (n: number) => `${n} ${n === 1 ? 'member' : 'members'}`,
  notes: (n: number) => `${n} ${n === 1 ? 'note' : 'notes'}`,
  unassignedTeacher: 'No teacher assigned',
  noSyllabus: 'No syllabus mapped',
  syllabusAiReady: 'Syllabus · AI ready',
  syllabusProcessing: 'Syllabus · processing',
  syllabusNotReady: 'Syllabus · not indexed',
  syllabusFailed: 'Syllabus · failed',

  createdToast: (name: string) => `Created “${name}”. Share the invite code below.`,

  notAdminTitle: 'Admins only',
  notAdminBody:
    'Only institution admins can create and manage classrooms. Teachers manage their assigned classrooms from the teacher home.',
  loadingHint: 'Loading classrooms…',
} as const;

const SYLLABUS_BADGE: Record<
  SyllabusProcessingStatus,
  { label: string; dot: string; text: string }
> = {
  AI_READY: {
    label: MSG.syllabusAiReady,
    dot: 'bg-(--vaasenk-success)',
    text: 'text-(--vaasenk-success)',
  },
  PROCESSING: {
    label: MSG.syllabusProcessing,
    dot: 'bg-(--vaasenk-warning)',
    text: 'text-(--vaasenk-warning)',
  },
  UPLOADED: {
    label: MSG.syllabusNotReady,
    dot: 'bg-(--vaasenk-subtle)',
    text: 'text-(--vaasenk-muted)',
  },
  FAILED: {
    label: MSG.syllabusFailed,
    dot: 'bg-(--vaasenk-danger)',
    text: 'text-(--vaasenk-danger)',
  },
};

type AuthMeUser = {
  id: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'TEACHER' | 'STUDENT';
  institutionId: string;
};

const PAGE_LIMIT = 60;

export function ClassroomsClient() {
  // Identity — gate the create action on the JWT-trusted role.
  const [role, setRole] = useState<AuthMeUser['role'] | null>(null);

  const [classrooms, setClassrooms] = useState<ClassroomView[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';

  // Bootstrap identity.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await apiFetch<{ user: AuthMeUser }>('/api/v1/auth/me');
        if (cancelled) return;
        setRole(me.user.role);
      } catch {
        // Non-fatal — the list fetch below surfaces auth issues if any. We
        // default to hiding the create action when role is unknown.
        if (!cancelled) setRole(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounce search (~300ms).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Fetch list.
  const fetchData = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await listClassrooms({
        limit: PAGE_LIMIT,
        status: 'ACTIVE',
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      });
      setClassrooms(res.data);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setClassrooms([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const flashBanner = useCallback((msg: string) => {
    setBanner(msg);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), 5000);
  }, []);

  useEffect(
    () => () => {
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
    },
    [],
  );

  const handleCreated = useCallback(
    (classroom: ClassroomView) => {
      flashBanner(MSG.createdToast(classroom.name));
      // Refetch so the new classroom appears in the grid behind the drawer.
      fetchData();
    },
    [flashBanner, fetchData],
  );

  const hasSearch = debouncedSearch !== '';

  const clearSearch = () => {
    setSearchInput('');
    setDebouncedSearch('');
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      {/* Hero — Admin Royal */}
      <section className="relative overflow-hidden rounded-vaasenk-xl bg-(image:--gradient-admin-royal) p-8 text-white shadow-[0_24px_60px_rgba(160,0,0,0.24)]">
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-wider text-white/75">
              {MSG.eyebrow}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              {MSG.title}
            </h1>
            <p className="mt-2 text-white/85">{MSG.subtitle}</p>
          </div>
          {isAdmin ? (
            <div className="shrink-0">
              <VaasenkButton
                variant="primary"
                size="md"
                onClick={() => setDrawerOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={drawerOpen}
              >
                <Plus className="size-4" />
                {MSG.createCta}
              </VaasenkButton>
            </div>
          ) : null}
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

      {/* Success / info banner */}
      {banner ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2.5 rounded-2xl border border-(--vaasenk-success)/30 bg-(--vaasenk-success)/10 px-4 py-3 text-sm font-medium text-(--vaasenk-success)"
        >
          <CheckCircle2 className="size-4 shrink-0" />
          {banner}
        </div>
      ) : null}

      {/* Non-admin notice (defensive — admins can't reach this in practice). */}
      {role && !isAdmin ? (
        <GlassCard padding="md" className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-2xl bg-(--vaasenk-peach-wash) text-(--vaasenk-red)"
          >
            <Lock className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-(--vaasenk-ink)">
              {MSG.notAdminTitle}
            </p>
            <p className="mt-1 text-sm text-(--vaasenk-muted)">
              {MSG.notAdminBody}
            </p>
          </div>
        </GlassCard>
      ) : null}

      {/* Search + count */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-(--vaasenk-subtle)" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={MSG.searchPlaceholder}
            aria-label={MSG.searchPlaceholder}
            disabled={loading && classrooms.length === 0 && !hasSearch}
            className="min-h-[44px] w-full rounded-full border border-(--vaasenk-line-sand) bg-white/80 py-2.5 pl-11 pr-4 text-sm text-(--vaasenk-ink) placeholder:text-(--vaasenk-subtle) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-70"
          />
        </div>
        {!loading && !error && classrooms.length > 0 ? (
          <p className="text-xs text-(--vaasenk-muted)" aria-live="polite">
            {MSG.showing(classrooms.length, total)}
          </p>
        ) : null}
      </div>

      {/* Body */}
      {error ? (
        <GlassCard padding="lg" className="flex flex-col items-center gap-4 text-center">
          <span
            aria-hidden
            className="grid size-14 place-items-center rounded-2xl bg-(--vaasenk-danger)/10 text-(--vaasenk-danger)"
          >
            <AlertCircle className="size-6" />
          </span>
          <div>
            <p className="text-base font-semibold text-(--vaasenk-ink)">
              {MSG.errorTitle}
            </p>
            <p role="alert" className="mt-1 text-sm text-(--vaasenk-muted)">
              {error}
            </p>
          </div>
          <VaasenkButton variant="secondary" size="sm" onClick={fetchData}>
            {MSG.retry}
          </VaasenkButton>
        </GlassCard>
      ) : loading ? (
        <ClassroomGridSkeleton />
      ) : classrooms.length === 0 ? (
        hasSearch ? (
          <GlassCard padding="lg" className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-(--vaasenk-muted)">{MSG.noMatch}</p>
            <VaasenkButton variant="secondary" size="sm" onClick={clearSearch}>
              {MSG.clearSearch}
            </VaasenkButton>
          </GlassCard>
        ) : (
          <EmptyState
            title={MSG.emptyTitle}
            description={MSG.emptyDescription}
            icon={<School className="size-7" />}
            action={
              isAdmin
                ? { label: MSG.emptyCta, onClick: () => setDrawerOpen(true) }
                : undefined
            }
          />
        )
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {classrooms.map((c) => (
            <li key={c.id}>
              <ClassroomCard classroom={c} />
            </li>
          ))}
        </ul>
      )}

      {/* Drawer */}
      {drawerOpen ? (
        <CreateClassroomDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          onCreated={handleCreated}
        />
      ) : null}
    </div>
  );
}

// ===========================================================================
// Card
// ===========================================================================

function ClassroomCard({ classroom }: { classroom: ClassroomView }) {
  const [copied, setCopied] = useState(false);

  const code = classroom.inviteCode;
  const teacherName = classroom.teacher?.name ?? MSG.unassignedTeacher;
  const pills = [
    classroom.class?.name,
    classroom.section ? `Section ${classroom.section.name}` : null,
    classroom.subject?.name,
  ].filter(Boolean) as string[];

  const copyCode = async () => {
    if (!code) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(code);
      } else {
        const ta = document.createElement('textarea');
        ta.value = code;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silent — user can select the code manually.
    }
  };

  const syllabusBadge = classroom.syllabus
    ? SYLLABUS_BADGE[classroom.syllabus.status]
    : null;

  return (
    <GlassCard padding="md" className="flex h-full flex-col gap-4">
      {/* Title + class pills */}
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-2xl bg-(image:--gradient-teacher-orange) text-white shadow-[0_8px_20px_rgba(255,122,26,0.22)]"
        >
          <BookOpen className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-(--vaasenk-ink)">
            {classroom.name}
          </h3>
          {pills.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {pills.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center rounded-full bg-(--vaasenk-peach-wash) px-2.5 py-0.5 text-[11px] font-semibold text-(--vaasenk-deep-maroon)"
                >
                  {p}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Teacher + counts */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-(--vaasenk-muted)">
        <span className="inline-flex items-center gap-1.5">
          <GraduationCap className="size-4 text-(--vaasenk-subtle)" />
          <span
            className={cn(
              'truncate',
              classroom.teacher ? 'text-(--vaasenk-ink)' : 'text-(--vaasenk-subtle)',
            )}
          >
            {teacherName}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-4 text-(--vaasenk-subtle)" />
          {MSG.members(classroom._count.members)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <FileText className="size-4 text-(--vaasenk-subtle)" />
          {MSG.notes(classroom._count.notes)}
        </span>
      </div>

      {/* Syllabus badge */}
      <div className="flex items-center gap-1.5 text-xs font-medium">
        {syllabusBadge ? (
          <span className={cn('inline-flex items-center gap-1.5', syllabusBadge.text)}>
            <Sparkles className="size-3.5" aria-hidden />
            {syllabusBadge.label}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-(--vaasenk-subtle)">
            <Sparkles className="size-3.5" aria-hidden />
            {MSG.noSyllabus}
          </span>
        )}
      </div>

      {/* Invite code footer */}
      <div className="mt-auto flex items-center justify-between gap-3 rounded-2xl border border-(--vaasenk-line-sand)/70 bg-white/60 px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-(--vaasenk-muted)">
            {MSG.inviteCode}
          </p>
          <p className="select-all font-mono text-lg font-bold tracking-[0.2em] text-(--vaasenk-red)">
            {code ?? MSG.noCode}
          </p>
        </div>
        {code ? (
          <button
            type="button"
            onClick={copyCode}
            aria-label={MSG.copyCode}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-full border border-(--vaasenk-line-sand) bg-white/80 px-3 text-xs font-semibold text-(--vaasenk-deep-maroon) transition-colors hover:border-(--vaasenk-red)/40 hover:text-(--vaasenk-red) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30"
          >
            {copied ? (
              <>
                <Check className="size-4 text-(--vaasenk-success)" />
                {MSG.copied}
              </>
            ) : (
              <>
                <Copy className="size-4" />
                {MSG.copyCode.split(' ')[0]}
              </>
            )}
          </button>
        ) : null}
      </div>
    </GlassCard>
  );
}

// ===========================================================================
// Skeleton
// ===========================================================================

function ClassroomGridSkeleton() {
  return (
    <ul
      role="status"
      aria-live="polite"
      aria-busy
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      <span className="sr-only">{MSG.loadingHint}</span>
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i}>
          <GlassCard padding="md" className="flex h-full flex-col gap-4">
            <div className="flex items-start gap-3">
              <LoadingSkeleton variant="rect" className="size-11" />
              <div className="flex-1 space-y-2">
                <LoadingSkeleton variant="text" className="w-2/3" />
                <LoadingSkeleton variant="text" className="w-1/2" />
              </div>
            </div>
            <LoadingSkeleton variant="text" className="w-3/4" />
            <LoadingSkeleton variant="rect" className="h-14 w-full" />
          </GlassCard>
        </li>
      ))}
    </ul>
  );
}
