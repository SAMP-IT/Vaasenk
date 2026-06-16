'use client';

import {
  AlertCircle,
  ArrowRight,
  Bookmark,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  FileQuestion,
  Sparkles,
  Sunrise,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { GlassCard } from '@/components/ui/glass-card';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { VaasenkButton } from '@/components/ui/vaasenk-button';
import { ApiClientError, apiFetch, apiFetchEnvelope } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { JoinClassroomCard } from './join-classroom-card';

// ---------------------------------------------------------------------------
// Strings — kept in a single MSG bag for a future i18n sweep (en-IN → ta-IN).
// ---------------------------------------------------------------------------

const MSG = {
  eyebrow: 'Your home',
  fallbackGreeting: 'Welcome to Vaasenk',
  morning: (name: string) => `Good morning, ${name}`,
  afternoon: (name: string) => `Good afternoon, ${name}`,
  evening: (name: string) => `Good evening, ${name}`,
  subtitleEmpty:
    'Welcome to Vaasenk. Join your first classroom to start collecting notes.',
  subtitleWithStats: (classrooms: number, newNotesThisWeek: number) => {
    const cls = `You’re in ${classrooms} ${classrooms === 1 ? 'classroom' : 'classrooms'}`;
    if (newNotesThisWeek === 0) {
      return `${cls}. No new notes this week — check back soon.`;
    }
    return `${cls}. ${newNotesThisWeek} new ${newNotesThisWeek === 1 ? 'note' : 'notes'} this week.`;
  },
  bookmarksTitle: 'Your bookmarks',
  bookmarksSubtitle: (n: number) =>
    n === 0 ? 'Save notes for quick exam revision' : `${n} saved ${n === 1 ? 'note' : 'notes'}`,
  downloadsTitle: 'Downloads',
  downloadsSubtitle: 'Offline access — coming soon',
  recentTitle: 'Recent notes',
  recentSubtitle: 'Latest published in your classrooms',
  recentEmpty:
    'Your teachers haven’t published any notes yet. Check back soon!',
  classroomsTitle: 'My classrooms',
  classroomsSubtitle: 'Tap to open the latest notes',
  emptyTitle: 'Join your first classroom',
  emptyDescription:
    'Ask your teacher for an invite code, or talk to your institution admin. Once you’re in, every note shows up here.',
  emptyCta: 'Join a classroom',
  errorTitle: 'We couldn’t load your dashboard',
  retry: 'Try again',
  partialNotesError: (name: string) =>
    `Couldn’t load notes from ${name}. The rest of your feed is still here.`,
  comingSoonBookmarks: 'Bookmarks page lands in Sprint 2.5.',
  comingSoonDownloads: 'Downloads land in Sprint 7.',
  loadingDashboard: 'Loading your dashboard…',
} as const;

// ---------------------------------------------------------------------------
// API contract types — mirror notes.service.ts / classrooms.service.ts shapes
// the Backend Architect locked. We declare them inline (not from shared-types)
// because the NestJS DTOs use class-validator decorators that don't carry
// through a type-only import.
// ---------------------------------------------------------------------------

type AuthMeUser = {
  id: string;
  name: string;
  institutionId: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'TEACHER' | 'STUDENT';
};

type ClassroomView = {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  inviteCode: string | null;
  class: { id: string; name: string; gradeLevel: number | null } | null;
  section: { id: string; name: string } | null;
  subject: { id: string; name: string } | null;
  teacher: { id: string; name: string; avatarUrl: string | null } | null;
  academicYear: { id: string; name: string; isActive: boolean } | null;
  _count: { members: number; notes: number };
  createdAt: string;
};

type NoteView = {
  id: string;
  classroomId: string;
  title: string;
  description: string | null;
  fileSignedUrl: string | null;
  thumbnailSignedUrl: string | null;
  mimeType?: string | null;
  tags: string[];
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt: string | null;
  createdAt: string;
  downloadCount: number;
  teacher: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  classroom?: { id: string; name: string };
};

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const RECENT_NOTES_PER_CLASSROOM = 5;
const RECENT_NOTES_TOTAL = 10;
const CLASSROOMS_LIMIT = 20;
const BOOKMARKS_PEEK_LIMIT = 5;
const SUCCESS_BANNER_MS = 4200;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function StudentDashboardClient() {
  // Identity
  const [me, setMe] = useState<AuthMeUser | null>(null);

  // Data
  const [classrooms, setClassrooms] = useState<ClassroomView[]>([]);
  const [recentNotes, setRecentNotes] = useState<NoteView[]>([]);
  const [bookmarksTotal, setBookmarksTotal] = useState<number>(0);
  const [partialNoteErrors, setPartialNoteErrors] = useState<string[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -------------------------------------------------------------------------
  // Initial fetch — runs on mount + when refreshAll() is invoked
  // -------------------------------------------------------------------------
  const fetchAll = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    setLoading(true);
    setPartialNoteErrors([]);

    try {
      // /auth/me is cheap and we need the user's display name; the bookmarks
      // + classrooms calls can run in parallel with it.
      const [meRes, classroomsRes, bookmarksRes] = await Promise.all([
        apiFetch<{ user: AuthMeUser }>('/api/v1/auth/me'),
        apiFetchEnvelope<ClassroomView[]>(
          `/api/v1/classrooms?status=ACTIVE&limit=${CLASSROOMS_LIMIT}`,
        ),
        // The bookmarks endpoint paginates; we only need `meta.total` for the
        // tile subtitle, so a tiny `limit` keeps this fast.
        apiFetchEnvelope<NoteView[]>(
          `/api/v1/bookmarks?limit=${BOOKMARKS_PEEK_LIMIT}`,
        ).catch((err: unknown) => {
          // Bookmarks are non-critical — if the endpoint fails for any reason
          // (e.g. brand-new student with no rows), don't blow up the page.
          if (err instanceof ApiClientError) {
            console.warn('[student] bookmarks fetch failed', err);
          }
          return { data: [] as NoteView[], meta: { total: 0 } };
        }),
      ]);

      if (signal?.aborted) return;

      setMe(meRes.user);
      const classroomList = classroomsRes.data ?? [];
      setClassrooms(classroomList);
      setBookmarksTotal(bookmarksRes.meta?.total ?? bookmarksRes.data.length);

      // -------------------------------------------------------------------
      // N+1 design note (intentional, documented):
      // The current notes API exposes per-classroom listings only — there is
      // no "all notes across my classrooms" endpoint yet (deferred to a
      // Sprint 5+ feed module). Until then we fan out one request per
      // enrolled classroom in parallel. For a typical student (N = 1–10)
      // this is well under 1 sec on a warm Railway box. If/when N grows we
      // either (a) add a /students/me/notes/feed aggregator, or (b) move
      // this to a server component that hits Prisma directly.
      // -------------------------------------------------------------------
      const noteSettled = await Promise.allSettled(
        classroomList.map((c) =>
          apiFetchEnvelope<NoteView[]>(
            `/api/v1/classrooms/${c.id}/notes?status=PUBLISHED&limit=${RECENT_NOTES_PER_CLASSROOM}&sort=publishedAt:desc`,
          ).then((env) => ({ classroom: c, notes: env.data ?? [] })),
        ),
      );

      if (signal?.aborted) return;

      const merged: NoteView[] = [];
      const partialErrors: string[] = [];
      noteSettled.forEach((r, i) => {
        const classroom = classroomList[i];
        if (!classroom) return; // Defensive — index/length parity is guaranteed by Promise.allSettled.
        if (r.status === 'fulfilled') {
          for (const note of r.value.notes) {
            // Stamp the classroom on each note so the recent-notes card
            // can link back even though the endpoint nests it under the
            // path rather than the payload.
            merged.push({
              ...note,
              classroom: note.classroom ?? {
                id: classroom.id,
                name: classroom.name,
              },
            });
          }
        } else {
          partialErrors.push(MSG.partialNotesError(classroom.name));
        }
      });

      // Sort by publishedAt desc; fall back to createdAt if a note slipped
      // through without a published timestamp (shouldn't happen for status
      // PUBLISHED, but defensive).
      merged.sort((a, b) => {
        const at = new Date(a.publishedAt ?? a.createdAt).getTime();
        const bt = new Date(b.publishedAt ?? b.createdAt).getTime();
        return bt - at;
      });

      setRecentNotes(merged.slice(0, RECENT_NOTES_TOTAL));
      setPartialNoteErrors(partialErrors);
    } catch (err) {
      if (signal?.aborted) return;
      const msg =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Something went wrong.';
      setError(msg);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchAll(ctrl.signal);
    return () => ctrl.abort();
  }, [fetchAll]);

  // -------------------------------------------------------------------------
  // Banner helpers
  // -------------------------------------------------------------------------
  const flashBanner = useCallback((msg: string) => {
    setBanner(msg);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), SUCCESS_BANNER_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Derived
  // -------------------------------------------------------------------------
  const newNotesThisWeek = useMemo(() => {
    const cutoff = Date.now() - WEEK_MS;
    return recentNotes.filter((n) => {
      const ts = new Date(n.publishedAt ?? n.createdAt).getTime();
      return ts >= cutoff;
    }).length;
  }, [recentNotes]);

  const greeting = useMemo(() => greetingFor(me?.name?.trim() || ''), [me]);
  const hasClassrooms = classrooms.length > 0;
  const hasRecentNotes = recentNotes.length > 0;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      {/* Greeting hero — Cream Sunrise per Playbook prompt 13 */}
      <GreetingHero
        loading={loading}
        greeting={greeting}
        subtitle={
          loading
            ? null
            : hasClassrooms
              ? MSG.subtitleWithStats(classrooms.length, newNotesThisWeek)
              : MSG.subtitleEmpty
        }
      />

      {/* Transient success banner (e.g. "Joined Trigonometry — Class 10A!") */}
      {banner ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2.5 rounded-2xl border border-(--vaasenk-success)/30 bg-(--vaasenk-success)/10 px-4 py-3 text-sm font-medium text-(--vaasenk-success)"
        >
          <CheckCircle2 className="size-4" aria-hidden />
          {banner}
        </div>
      ) : null}

      {/* Top-level fetch error — blocks the page, offers retry */}
      {error ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-4 py-4 text-sm text-(--vaasenk-danger)"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="flex-1">
              <p className="font-medium text-(--vaasenk-danger)">
                {MSG.errorTitle}
              </p>
              <p className="mt-1 text-(--vaasenk-danger)/85">{error}</p>
            </div>
          </div>
          <div className="mt-3">
            <VaasenkButton
              variant="secondary"
              size="sm"
              onClick={() => fetchAll()}
            >
              {MSG.retry}
            </VaasenkButton>
          </div>
        </div>
      ) : null}

      {/* Partial errors (one classroom's notes failed) — non-blocking */}
      {partialNoteErrors.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {partialNoteErrors.map((msg) => (
            <p
              key={msg}
              role="alert"
              className="text-xs text-(--vaasenk-muted)"
            >
              {msg}
            </p>
          ))}
        </div>
      ) : null}

      {/* Quick actions row — always rendered (even in zero-classroom state,
          since Join is the primary action in that case). */}
      <section
        aria-label="Quick actions"
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        <JoinClassroomCard
          onJoined={(name) => {
            flashBanner(`Joined ${name}!`);
            fetchAll();
          }}
        />
        <BookmarksTile
          count={bookmarksTotal}
          onClick={() => flashBanner(MSG.comingSoonBookmarks)}
          loading={loading}
        />
        <DownloadsTile
          onClick={() => flashBanner(MSG.comingSoonDownloads)}
        />
      </section>

      {/* Loading state — body */}
      {loading ? (
        <DashboardBodySkeleton />
      ) : !error && !hasClassrooms ? (
        // Empty state (no enrolled classrooms at all)
        <EmptyState
          title={MSG.emptyTitle}
          description={MSG.emptyDescription}
          icon={<Sparkles className="size-7" />}
          action={{
            // Visual emphasis only — the real action is the Join tile above.
            // Clicking scrolls to it so screen readers / keyboard users land
            // on the same place.
            label: MSG.emptyCta,
            onClick: () => {
              if (typeof window !== 'undefined') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            },
          }}
        />
      ) : !error && hasClassrooms ? (
        <>
          {/* Recent notes */}
          <section aria-labelledby="student-recent-notes-heading">
            <SectionHeader
              id="student-recent-notes-heading"
              title={MSG.recentTitle}
              subtitle={MSG.recentSubtitle}
            />
            {hasRecentNotes ? (
              <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {recentNotes.map((note) => (
                  <li key={note.id}>
                    <RecentNoteCard note={note} />
                  </li>
                ))}
              </ul>
            ) : (
              <GlassCard padding="md">
                <p className="text-sm text-(--vaasenk-muted)">
                  {MSG.recentEmpty}
                </p>
              </GlassCard>
            )}
          </section>

          {/* My classrooms (horizontal scroll) */}
          <section aria-labelledby="student-classrooms-heading">
            <SectionHeader
              id="student-classrooms-heading"
              title={MSG.classroomsTitle}
              subtitle={MSG.classroomsSubtitle}
            />
            <ClassroomScrollRow classrooms={classrooms} />
          </section>
        </>
      ) : null}
    </div>
  );
}

// ===========================================================================
// Sub-components
// ===========================================================================

// ---- Greeting hero --------------------------------------------------------

function GreetingHero({
  loading,
  greeting,
  subtitle,
}: {
  loading: boolean;
  greeting: string;
  subtitle: string | null;
}) {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-[28px] p-8 sm:p-10',
        // Cream Sunrise per Playbook 13 — light, breathable, gold radial accent
        'bg-(image:--gradient-cream-sunrise)',
        'border border-(--vaasenk-line-sand)',
        'shadow-[0_18px_50px_rgba(74,5,8,0.08)]',
      )}
      aria-busy={loading || undefined}
    >
      <div className="relative z-10 max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--vaasenk-deep-maroon)/70">
          {MSG.eyebrow}
        </p>
        {loading ? (
          <div className="mt-3 space-y-3">
            <LoadingSkeleton variant="text" className="h-9 w-2/3" />
            <LoadingSkeleton variant="text" className="h-4 w-3/4" />
          </div>
        ) : (
          <>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-(--vaasenk-ink) sm:text-4xl">
              {greeting}
            </h1>
            {subtitle ? (
              <p className="mt-2 max-w-xl text-base text-(--vaasenk-muted)">
                {subtitle}
              </p>
            ) : null}
          </>
        )}
      </div>

      {/* Decorative gold sunrise icon — design-docs §9 calls out "soft floating
          shapes" and "sparkle moments". Kept subtle: a 24-radius blurred halo
          behind a gold-tinted icon. */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-6 top-6 hidden sm:block"
      >
        <div className="relative grid size-20 place-items-center">
          <div className="absolute inset-0 rounded-full bg-(--vaasenk-gold)/30 blur-2xl" />
          <Sunrise className="relative size-9 text-(--vaasenk-deep-maroon)/80" />
        </div>
      </div>
    </section>
  );
}

function greetingFor(name: string): string {
  // Defensive: if the Date API misbehaves (SSR/clock weirdness), fall back
  // to a static "Welcome" so we never render a broken string.
  const displayName = name || 'there';
  try {
    const hour = new Date().getHours();
    if (Number.isNaN(hour)) return `${MSG.fallbackGreeting}, ${displayName}`;
    if (hour < 12) return MSG.morning(displayName);
    if (hour < 18) return MSG.afternoon(displayName);
    return MSG.evening(displayName);
  } catch {
    return `${MSG.fallbackGreeting}, ${displayName}`;
  }
}

// ---- Quick action tiles ---------------------------------------------------

function BookmarksTile({
  count,
  onClick,
  loading,
}: {
  count: number;
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={MSG.bookmarksTitle}
      className={cn(
        'group relative flex w-full flex-col items-start gap-3 rounded-[24px] p-6 text-left',
        'border border-(--vaasenk-line-sand) bg-white/72 backdrop-blur-[20px]',
        'shadow-[0_8px_24px_rgba(160,0,0,0.08)]',
        'transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(74,5,8,0.12)] hover:border-(--vaasenk-red)/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red) focus-visible:ring-offset-2 focus-visible:ring-offset-(--vaasenk-warm-canvas)',
        'min-h-[44px]',
      )}
    >
      <span
        aria-hidden
        className="grid size-11 place-items-center rounded-xl bg-(--vaasenk-gold)/25 text-(--vaasenk-deep-maroon)"
      >
        <Bookmark className="size-5" />
      </span>
      <h3 className="text-lg font-semibold text-(--vaasenk-ink)">
        {MSG.bookmarksTitle}
      </h3>
      <p className="text-sm text-(--vaasenk-muted)">
        {loading ? '—' : MSG.bookmarksSubtitle(count)}
      </p>
    </button>
  );
}

function DownloadsTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={MSG.downloadsTitle}
      className={cn(
        'group relative flex w-full flex-col items-start gap-3 rounded-[24px] p-6 text-left',
        'border border-(--vaasenk-line-sand) bg-white/72 backdrop-blur-[20px]',
        'shadow-[0_8px_24px_rgba(160,0,0,0.08)]',
        'transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(74,5,8,0.12)] hover:border-(--vaasenk-red)/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red) focus-visible:ring-offset-2 focus-visible:ring-offset-(--vaasenk-warm-canvas)',
        'min-h-[44px]',
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span
          aria-hidden
          className="grid size-11 place-items-center rounded-xl bg-(--vaasenk-peach-wash) text-(--vaasenk-red)"
        >
          <Download className="size-5" />
        </span>
        <span className="inline-flex items-center rounded-full border border-(--vaasenk-line-sand) bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-(--vaasenk-muted)">
          Sprint 7
        </span>
      </div>
      <h3 className="text-lg font-semibold text-(--vaasenk-ink)">
        {MSG.downloadsTitle}
      </h3>
      <p className="text-sm text-(--vaasenk-muted)">{MSG.downloadsSubtitle}</p>
    </button>
  );
}

// ---- Section header -------------------------------------------------------

function SectionHeader({
  id,
  title,
  subtitle,
}: {
  id: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <div>
        <h2
          id={id}
          className="text-xl font-semibold tracking-tight text-(--vaasenk-ink) sm:text-2xl"
        >
          {title}
        </h2>
        <p className="mt-0.5 text-sm text-(--vaasenk-muted)">{subtitle}</p>
      </div>
    </div>
  );
}

// ---- Recent note card -----------------------------------------------------

function RecentNoteCard({ note }: { note: NoteView }) {
  // Link target lands in Sprint 2.5 (/student/classrooms/[id]). We wire the
  // anchor now so the card is keyboard-navigable; the destination 404s
  // until that route ships.
  const href = `/student/classrooms/${note.classroomId}`;
  const isImage = note.mimeType?.startsWith('image/') ?? false;
  const visibleTags = note.tags.slice(0, 3);
  const overflowTagCount = note.tags.length - visibleTags.length;

  return (
    <Link
      href={href}
      className={cn(
        'group flex h-full overflow-hidden rounded-[24px] border border-(--vaasenk-line-sand) bg-white/82 backdrop-blur-[12px]',
        'shadow-[0_8px_24px_rgba(160,0,0,0.08)]',
        'transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(74,5,8,0.12)] hover:border-(--vaasenk-red)/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red) focus-visible:ring-offset-2 focus-visible:ring-offset-(--vaasenk-warm-canvas)',
      )}
    >
      {/* Compact thumbnail — square on the left, narrower than the teacher
          card's wide 16:9 since student grid is 1–2 columns and we want
          density without cramping. */}
      <div className="relative aspect-square w-28 shrink-0 overflow-hidden bg-(--vaasenk-peach-wash) sm:w-32">
        {note.thumbnailSignedUrl ? (
          <Image
            src={note.thumbnailSignedUrl}
            alt=""
            fill
            unoptimized
            sizes="128px"
            className="object-cover"
          />
        ) : note.fileSignedUrl && isImage ? (
          <Image
            src={note.fileSignedUrl}
            alt=""
            fill
            unoptimized
            sizes="128px"
            className="object-cover"
          />
        ) : (
          <div
            aria-hidden
            className="flex h-full w-full items-center justify-center text-(--vaasenk-red)"
          >
            <FileQuestion className="size-8" />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h3
            className="line-clamp-2 text-base font-semibold text-(--vaasenk-ink)"
            title={note.title}
          >
            {note.title}
          </h3>
          {note.classroom ? (
            <p className="truncate text-xs font-medium text-(--vaasenk-deep-maroon)/80">
              {note.classroom.name}
            </p>
          ) : null}
        </div>

        {note.description ? (
          <p className="line-clamp-2 text-sm text-(--vaasenk-muted)">
            {note.description}
          </p>
        ) : null}

        {visibleTags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {visibleTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-(--vaasenk-rose-wash) px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-(--vaasenk-deep-maroon)"
              >
                {tag.toLowerCase()}
              </span>
            ))}
            {overflowTagCount > 0 ? (
              <span className="text-[10px] font-medium text-(--vaasenk-subtle)">
                +{overflowTagCount}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-(--vaasenk-subtle)">
          <div className="flex min-w-0 items-center gap-2">
            <MiniAvatar
              name={note.teacher.name}
              url={note.teacher.avatarUrl}
            />
            <span className="truncate font-medium text-(--vaasenk-muted)">
              {note.teacher.name}
            </span>
          </div>
          <time
            dateTime={note.publishedAt ?? note.createdAt}
            className="inline-flex shrink-0 items-center gap-1"
          >
            <Clock className="size-3" aria-hidden />
            {formatRelative(note.publishedAt ?? note.createdAt)}
          </time>
        </div>
      </div>
    </Link>
  );
}

function MiniAvatar({
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
        width={20}
        height={20}
        unoptimized
        className="size-5 shrink-0 rounded-full object-cover ring-1 ring-(--vaasenk-line-sand)"
      />
    );
  }
  const initials = initialsOf(name);
  return (
    <span
      aria-hidden
      className="grid size-5 shrink-0 place-items-center rounded-full bg-(image:--gradient-teacher-orange) text-[9px] font-semibold text-white"
    >
      {initials}
    </span>
  );
}

// ---- Classroom horizontal scroll -----------------------------------------

function ClassroomScrollRow({
  classrooms,
}: {
  classrooms: ClassroomView[];
}) {
  return (
    <div
      role="list"
      aria-label={MSG.classroomsTitle}
      // Negative margin lets the cards bleed to the page edge on mobile for
      // that "tap-friendly carousel" feel called out in design-docs §11.
      className="-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-2 sm:mx-0 sm:px-0"
    >
      {classrooms.map((c) => (
        <ClassroomCard key={c.id} classroom={c} />
      ))}
    </div>
  );
}

function ClassroomCard({ classroom }: { classroom: ClassroomView }) {
  // Sprint 2.5 destination — same TODO as RecentNoteCard.
  const href = `/student/classrooms/${classroom.id}`;
  const subject = classroom.subject?.name ?? classroom.name;
  const classSectionParts = [classroom.class?.name, classroom.section?.name]
    .filter(Boolean)
    .join(' · ');
  const teacherName = classroom.teacher?.name ?? 'Unassigned';
  const noteCount = classroom._count?.notes ?? 0;

  return (
    <Link
      href={href}
      role="listitem"
      aria-label={`${subject} — ${classSectionParts}. ${noteCount} notes.`}
      className={cn(
        'group relative flex min-w-[280px] max-w-[320px] shrink-0 snap-start flex-col overflow-hidden rounded-[24px] p-5 text-white',
        // Student Coral per design-docs §4 — the warm welcoming student
        // gradient (Cream Sunrise is reserved for the hero).
        'bg-(image:--gradient-student-coral)',
        'shadow-[0_18px_50px_rgba(255,92,122,0.24)]',
        'transition-all hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(255,92,122,0.32)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-(--vaasenk-warm-canvas)',
        'min-h-[180px]',
      )}
    >
      {/* Decorative gold halo — design-docs "soft floating shapes" */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-white/20 blur-2xl"
      />

      <div className="relative flex h-full flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <h3
            className="line-clamp-2 text-xl font-semibold leading-tight"
            title={subject}
          >
            {subject}
          </h3>
          <ArrowRight
            className="size-5 shrink-0 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </div>

        {classSectionParts ? (
          <p className="text-sm text-white/90">{classSectionParts}</p>
        ) : null}

        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div className="flex min-w-0 items-center gap-2">
            <ClassroomTeacherChip
              name={teacherName}
              url={classroom.teacher?.avatarUrl ?? null}
            />
            <span className="truncate text-xs font-medium text-white/90">
              {teacherName}
            </span>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
            {noteCount} {noteCount === 1 ? 'note' : 'notes'}
          </span>
        </div>
      </div>
    </Link>
  );
}

function ClassroomTeacherChip({
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
        width={24}
        height={24}
        unoptimized
        className="size-6 shrink-0 rounded-full object-cover ring-1 ring-white/40"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="grid size-6 shrink-0 place-items-center rounded-full bg-white/25 text-[10px] font-semibold text-white"
    >
      {initialsOf(name)}
    </span>
  );
}

// ---- Loading skeleton -----------------------------------------------------

function DashboardBodySkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy
      className="flex flex-col gap-8"
    >
      <span className="sr-only">{MSG.loadingDashboard}</span>

      {/* Recent notes grid skeleton */}
      <section>
        <div className="mb-4 space-y-2">
          <LoadingSkeleton variant="text" className="h-6 w-40" />
          <LoadingSkeleton variant="text" className="h-3 w-56" />
        </div>
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <li
              key={i}
              className="flex overflow-hidden rounded-[24px] border border-(--vaasenk-line-sand) bg-white/70"
            >
              <LoadingSkeleton
                variant="rect"
                className="aspect-square w-28 shrink-0 sm:w-32"
              />
              <div className="flex flex-1 flex-col gap-2 p-4">
                <LoadingSkeleton variant="text" className="w-4/5" />
                <LoadingSkeleton variant="text" className="w-3/5" />
                <div className="flex gap-1.5 pt-1">
                  <LoadingSkeleton variant="text" className="h-4 w-12" />
                  <LoadingSkeleton variant="text" className="h-4 w-14" />
                </div>
                <div className="mt-auto flex items-center gap-2 pt-2">
                  <LoadingSkeleton variant="circle" className="size-5" />
                  <LoadingSkeleton variant="text" className="w-1/3" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Classrooms scroll skeleton */}
      <section>
        <div className="mb-4 space-y-2">
          <LoadingSkeleton variant="text" className="h-6 w-44" />
          <LoadingSkeleton variant="text" className="h-3 w-60" />
        </div>
        <div className="-mx-6 flex gap-4 overflow-hidden px-6 sm:mx-0 sm:px-0">
          {Array.from({ length: 4 }).map((_, i) => (
            <LoadingSkeleton
              key={i}
              variant="rect"
              className="min-h-[180px] min-w-[280px] max-w-[320px] shrink-0"
            />
          ))}
        </div>
      </section>
    </div>
  );
}

// ---- Utilities ------------------------------------------------------------

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

function formatRelative(iso: string): string {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return '—';
  const now = new Date();
  const diffMs = now.getTime() - target.getTime();
  const minute = 1000 * 60;
  const hour = minute * 60;
  const day = hour * 24;
  if (diffMs < minute) return 'Just now';
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h`;
  const days = Math.floor(diffMs / day);
  if (days < 2) return 'Yesterday';
  if (days < 7) return `${days}d`;
  return target.toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    ...(now.getFullYear() === target.getFullYear() ? {} : { year: 'numeric' }),
  });
}

// Side-channel suppression: ChevronRight is reserved for future "see all"
// links on each section. Imported here so the icon set stays co-located.
void ChevronRight;
