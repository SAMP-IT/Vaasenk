'use client';

import {
  AlertCircle,
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  BookOpen,
  Calculator,
  ClipboardList,
  Download,
  FileQuestion,
  FileText,
  Highlighter,
  Loader2,
  RotateCw,
  Sparkles,
  User,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { GlassCard } from '@/components/ui/glass-card';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { VaasenkButton } from '@/components/ui/vaasenk-button';
import { ApiClientError, apiFetch, apiFetchEnvelope } from '@/lib/api-client';
import {
  NOTE_TAGS,
  TAG_CHIP_CLASSES,
  TAG_LABELS,
  type NoteTag,
  type NoteView,
} from '@/lib/notes-constants';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Strings — kept in a single MSG bag for a future i18n sweep (en-IN → ta-IN).
// ---------------------------------------------------------------------------

const MSG = {
  backToDashboard: 'Back to dashboard',
  eyebrow: 'Classroom',
  notesCount: (n: number) => `${n} ${n === 1 ? 'note' : 'notes'} published`,
  filterLabel: 'Filter notes',
  allTags: 'All',
  searchEmpty: 'No notes match this filter.',
  clearFilter: 'Clear filter',
  noNotesTitle: 'No notes published yet',
  noNotesDescription:
    'Your teacher hasn’t shared anything in this classroom yet. Check back soon!',
  noNotesCta: 'Back to dashboard',
  forbiddenTitle: 'This classroom isn’t available',
  forbiddenDescription:
    'You don’t have access to this classroom, or it may have been removed. Head back and try another.',
  errorTitle: 'Couldn’t load these notes',
  retry: 'Retry',
  prev: 'Previous',
  next: 'Next',
  showing: (from: number, to: number, total: number) =>
    `Showing ${from}–${to} of ${total}`,
  bookmark: 'Bookmark',
  bookmarked: 'Bookmarked',
  download: 'Download',
  open: 'Open note',
  noTeacher: 'Teacher',
  loadingHint: 'Loading notes…',
} as const;

// ---------------------------------------------------------------------------
// API contract types — mirror what the backend ships. Kept inline because
// the NestJS DTOs use class-validator decorators that don't carry through
// a type-only import.
// ---------------------------------------------------------------------------

type ClassroomDetailView = {
  id: string;
  name: string;
  status: string;
  class: { id: string; name: string; gradeLevel?: number | null } | null;
  section: { id: string; name: string } | null;
  subject: { id: string; name: string } | null;
  teacher: {
    id: string;
    name: string;
    email?: string | null;
    avatarUrl: string | null;
  } | null;
  academicYear: { id: string; name: string; isActive?: boolean } | null;
  _count: { members: number; notes: number };
};

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const PAGE_SIZE = 12;
const BOOKMARK_CACHE_LIMIT = 100;

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ClassroomFeedClient({ classroomId }: { classroomId: string }) {
  // Classroom header data
  const [classroom, setClassroom] = useState<ClassroomDetailView | null>(null);
  const [classroomLoading, setClassroomLoading] = useState(true);
  const [classroomError, setClassroomError] = useState<{
    status: number;
    message: string;
  } | null>(null);

  // Notes feed data
  const [tagFilter, setTagFilter] = useState<NoteTag | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [notes, setNotes] = useState<NoteView[]>([]);
  const [total, setTotal] = useState(0);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesRefreshing, setNotesRefreshing] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const seenInitialMount = useRef(false);

  // Bookmark cache — one Set<noteId> shared across all rendered cards.
  // Built from /bookmarks?limit=100 on mount, mutated optimistically on
  // toggle so the UI stays snappy. See Step 2 of the spec.
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [pendingBookmarkId, setPendingBookmarkId] = useState<string | null>(
    null,
  );

  // -------------------------------------------------------------------------
  // Initial header + bookmark-cache fetch (runs once)
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setClassroomLoading(true);
      setClassroomError(null);
      try {
        const result = await apiFetch<{ classroom: ClassroomDetailView }>(
          `/api/v1/classrooms/${classroomId}`,
        );
        if (cancelled) return;
        setClassroom(result.classroom);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiClientError) {
          setClassroomError({ status: err.status, message: err.message });
        } else if (err instanceof Error) {
          setClassroomError({ status: 0, message: err.message });
        } else {
          setClassroomError({ status: 0, message: 'Something went wrong.' });
        }
      } finally {
        if (!cancelled) setClassroomLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classroomId]);

  // Bookmark cache — non-blocking. A new student with zero bookmarks may
  // get a 404 from this endpoint; we swallow it because an empty set is
  // the correct default.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await apiFetchEnvelope<NoteView[]>(
          `/api/v1/bookmarks?limit=${BOOKMARK_CACHE_LIMIT}`,
        );
        if (cancelled) return;
        setBookmarkedIds(
          new Set((result.data ?? []).map((n) => n.id)),
        );
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiClientError) {
          // eslint-disable-next-line no-console
          console.warn('[student feed] bookmark cache fetch failed', err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Notes feed fetch — refires on tag / page / classroom change
  // -------------------------------------------------------------------------
  const fetchNotes = useCallback(async () => {
    setNotesError(null);
    if (!seenInitialMount.current) {
      setNotesLoading(true);
    } else {
      setNotesRefreshing(true);
    }
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      params.set('sort', 'publishedAt:desc');
      // Backend auto-applies status=PUBLISHED for STUDENT role, but we send
      // it anyway for safety + caching predictability.
      params.set('status', 'PUBLISHED');
      if (tagFilter !== 'ALL') params.set('tag', tagFilter);

      const result = await apiFetchEnvelope<NoteView[]>(
        `/api/v1/classrooms/${classroomId}/notes?${params.toString()}`,
      );
      setNotes(result.data ?? []);
      setTotal(result.meta?.total ?? (result.data ?? []).length);
    } catch (err) {
      setNotesError(
        err instanceof Error ? err.message : 'Something went wrong.',
      );
      setNotes([]);
      setTotal(0);
    } finally {
      setNotesLoading(false);
      setNotesRefreshing(false);
      seenInitialMount.current = true;
    }
  }, [classroomId, page, tagFilter]);

  useEffect(() => {
    // Only fetch the feed once we know the student has access (i.e. the
    // header request didn't 404). If the header errored, the feed body is
    // replaced by the forbidden state anyway.
    if (classroomError) return;
    fetchNotes();
  }, [fetchNotes, classroomError]);

  // -------------------------------------------------------------------------
  // Bookmark toggle — optimistic, with rollback on failure
  // -------------------------------------------------------------------------
  const handleToggleBookmark = useCallback(
    async (noteId: string) => {
      if (pendingBookmarkId) return;
      setPendingBookmarkId(noteId);

      const wasBookmarked = bookmarkedIds.has(noteId);
      const next = new Set(bookmarkedIds);
      if (wasBookmarked) next.delete(noteId);
      else next.add(noteId);
      setBookmarkedIds(next);

      try {
        const result = await apiFetch<{ bookmarked: boolean }>(
          `/api/v1/notes/${noteId}/bookmark`,
          { method: 'POST' },
        );
        // Sync to the server's authoritative answer.
        setBookmarkedIds((prev) => {
          const reconciled = new Set(prev);
          if (result.bookmarked) reconciled.add(noteId);
          else reconciled.delete(noteId);
          return reconciled;
        });
      } catch {
        // Roll back.
        setBookmarkedIds((prev) => {
          const rolled = new Set(prev);
          if (wasBookmarked) rolled.add(noteId);
          else rolled.delete(noteId);
          return rolled;
        });
      } finally {
        setPendingBookmarkId(null);
      }
    },
    [bookmarkedIds, pendingBookmarkId],
  );

  // -------------------------------------------------------------------------
  // Derived UI helpers
  // -------------------------------------------------------------------------
  const hasActiveFilter = tagFilter !== 'ALL';
  const rangeFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeTo = Math.min(page * PAGE_SIZE, total);
  const canPrev = page > 1 && !notesLoading;
  const canNext = page * PAGE_SIZE < total && !notesLoading;

  // -------------------------------------------------------------------------
  // Forbidden / 404 state — same chrome as the rest of the page so the user
  // never lands on a blank box.
  // -------------------------------------------------------------------------
  if (!classroomLoading && classroomError) {
    const isNotFound =
      classroomError.status === 404 || classroomError.status === 403;
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <Link
          href="/student"
          className="inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-(--vaasenk-deep-maroon) transition-colors hover:bg-(--vaasenk-rose-wash) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {MSG.backToDashboard}
        </Link>
        {isNotFound ? (
          <EmptyState
            title={MSG.forbiddenTitle}
            description={MSG.forbiddenDescription}
            icon={<BookOpen className="size-7" aria-hidden />}
            action={{
              label: MSG.backToDashboard,
              href: '/student',
            }}
          />
        ) : (
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
              {classroomError.message}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <VaasenkButton
                variant="secondary"
                size="md"
                onClick={() => window.location.reload()}
              >
                {MSG.retry}
              </VaasenkButton>
              <Link href="/student">
                <VaasenkButton variant="ghost" size="md">
                  {MSG.backToDashboard}
                </VaasenkButton>
              </Link>
            </div>
          </GlassCard>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {/* Back link */}
      <Link
        href="/student"
        className="inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-(--vaasenk-deep-maroon) transition-colors hover:bg-(--vaasenk-rose-wash) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {MSG.backToDashboard}
      </Link>

      {/* Classroom hero — Student Coral. Loading state shows skeleton text on
          the same coral surface so the page doesn't pop in. */}
      <ClassroomHero loading={classroomLoading} classroom={classroom} />

      {/* Filter chips — visible even while notes are loading so the page
          structure stays stable. */}
      <FilterChipRow
        active={tagFilter}
        onChange={(t) => {
          setTagFilter(t);
          setPage(1);
        }}
        refreshing={notesRefreshing}
        disabled={notesLoading && notes.length === 0}
      />

      {/* Body — feed list / loading / empty / error */}
      {notesError ? (
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
              <p className="mt-1 text-(--vaasenk-danger)/85">{notesError}</p>
            </div>
          </div>
          <div className="mt-3">
            <VaasenkButton
              variant="secondary"
              size="sm"
              onClick={() => {
                setNotesError(null);
                fetchNotes();
              }}
            >
              {MSG.retry}
            </VaasenkButton>
          </div>
        </div>
      ) : null}

      {!notesError && notesLoading ? <FeedSkeleton /> : null}

      {!notesError && !notesLoading && notes.length === 0 ? (
        hasActiveFilter ? (
          <GlassCard padding="lg" className="text-center">
            <p className="text-sm text-(--vaasenk-muted)">{MSG.searchEmpty}</p>
            <div className="mt-4 inline-flex">
              <VaasenkButton
                variant="secondary"
                size="sm"
                onClick={() => {
                  setTagFilter('ALL');
                  setPage(1);
                }}
              >
                {MSG.clearFilter}
              </VaasenkButton>
            </div>
          </GlassCard>
        ) : (
          <EmptyState
            title={MSG.noNotesTitle}
            description={MSG.noNotesDescription}
            icon={<Sparkles className="size-7" aria-hidden />}
            action={{
              label: MSG.noNotesCta,
              href: '/student',
            }}
          />
        )
      ) : null}

      {!notesError && !notesLoading && notes.length > 0 ? (
        <>
          <ul className="flex flex-col gap-4">
            {notes.map((note) => (
              <li key={note.id}>
                <StudentNoteCard
                  note={note}
                  classroomId={classroomId}
                  bookmarked={bookmarkedIds.has(note.id)}
                  bookmarkPending={pendingBookmarkId === note.id}
                  onToggleBookmark={() => handleToggleBookmark(note.id)}
                />
              </li>
            ))}
          </ul>

          {total > 0 ? (
            <footer className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <p className="text-xs text-(--vaasenk-muted)" aria-live="polite">
                {MSG.showing(rangeFrom, rangeTo, total)}
              </p>
              <div className="flex items-center gap-2">
                <VaasenkButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!canPrev}
                >
                  {MSG.prev}
                </VaasenkButton>
                <VaasenkButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!canNext}
                >
                  {MSG.next}
                </VaasenkButton>
              </div>
            </footer>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

// ===========================================================================
// Sub-components
// ===========================================================================

// ---- Classroom hero -------------------------------------------------------

function ClassroomHero({
  loading,
  classroom,
}: {
  loading: boolean;
  classroom: ClassroomDetailView | null;
}) {
  const subject = classroom?.subject?.name ?? classroom?.name ?? '';
  const classSectionParts = [
    classroom?.class?.name,
    classroom?.section?.name,
  ]
    .filter(Boolean)
    .join(' · ');
  const teacherName = classroom?.teacher?.name ?? '';
  const noteCount = classroom?._count?.notes ?? 0;

  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-[28px] p-7 sm:p-9 text-white',
        // Student Coral per design-docs §4 — the warm welcoming student
        // gradient (Cream Sunrise is reserved for the dashboard hero).
        'bg-(image:--gradient-student-coral)',
        'shadow-[0_24px_60px_rgba(255,92,122,0.24)]',
      )}
      aria-busy={loading || undefined}
    >
      {/* Decorative blobs — "soft floating shapes" from design-docs §9 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-white/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-16 left-1/4 size-56 rounded-full bg-vaasenk-gold/30 blur-3xl"
      />

      <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/85">
            {MSG.eyebrow}
          </p>
          {loading ? (
            <div className="mt-3 space-y-3">
              <LoadingSkeleton
                variant="text"
                className="h-9 w-2/3 bg-white/40"
              />
              <LoadingSkeleton
                variant="text"
                className="h-4 w-3/5 bg-white/30"
              />
            </div>
          ) : (
            <>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                {subject || 'Classroom'}
              </h1>
              {classSectionParts || teacherName ? (
                <p className="mt-3 text-sm text-white/90 sm:text-base">
                  {[classSectionParts, teacherName]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              ) : null}
            </>
          )}
        </div>

        {!loading ? (
          <span
            aria-label={MSG.notesCount(noteCount)}
            className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full bg-white/20 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur"
          >
            <FileText className="size-3.5" aria-hidden />
            {MSG.notesCount(noteCount)}
          </span>
        ) : null}
      </div>
    </section>
  );
}

// ---- Filter chip row ------------------------------------------------------

function FilterChipRow({
  active,
  onChange,
  refreshing,
  disabled,
}: {
  active: NoteTag | 'ALL';
  onChange: (next: NoteTag | 'ALL') => void;
  refreshing: boolean;
  disabled: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label={MSG.filterLabel}
      className="-mx-2 flex flex-nowrap items-center gap-2 overflow-x-auto px-2 pb-1 sm:flex-wrap sm:overflow-visible"
    >
      <FilterChip
        active={active === 'ALL'}
        onClick={() => onChange('ALL')}
        disabled={disabled}
      >
        {MSG.allTags}
      </FilterChip>
      {NOTE_TAGS.map((tag) => (
        <FilterChip
          key={tag}
          active={active === tag}
          onClick={() => onChange(tag)}
          disabled={disabled}
        >
          {TAG_LABELS[tag]}
        </FilterChip>
      ))}
      {refreshing ? (
        <span
          role="status"
          aria-live="polite"
          className="ml-2 inline-flex items-center gap-1.5 text-xs text-(--vaasenk-subtle)"
        >
          <Loader2 className="size-3 animate-spin" aria-hidden />
          Updating…
        </span>
      ) : null}
    </div>
  );
}

function FilterChip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex shrink-0 min-h-[36px] items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30 focus-visible:ring-offset-2 focus-visible:ring-offset-(--vaasenk-warm-canvas)',
        active
          ? 'bg-(image:--gradient-brand-flame) text-white shadow-[0_8px_24px_rgba(160,0,0,0.18)]'
          : 'border border-(--vaasenk-line-sand) bg-white/70 text-(--vaasenk-deep-maroon) hover:border-(--vaasenk-red)/40 hover:bg-white',
        'disabled:cursor-not-allowed disabled:opacity-60',
      )}
    >
      {children}
    </button>
  );
}

// ---- Student note card ----------------------------------------------------

const TAG_THUMB_ICON: Record<NoteTag, React.ComponentType<{ className?: string }>> = {
  IMPORTANT: BookOpen,
  HOMEWORK: ClipboardList,
  EXAM: Highlighter,
  ASSIGNMENT: FileText,
  REVISION: RotateCw,
  FORMULA: Calculator,
};

function StudentNoteCard({
  note,
  classroomId,
  bookmarked,
  bookmarkPending,
  onToggleBookmark,
}: {
  note: NoteView;
  classroomId: string;
  bookmarked: boolean;
  bookmarkPending: boolean;
  onToggleBookmark: () => void;
}) {
  const viewerHref = `/student/classrooms/${classroomId}/notes/${note.id}`;
  const mime = note.mimeType ?? note.fileType ?? null;
  const isImage = mime?.startsWith('image/') ?? false;
  const visibleTags = note.tags.slice(0, 3);
  const overflowTagCount = note.tags.length - visibleTags.length;
  const primaryTag = note.tags[0];
  const PlaceholderIcon = primaryTag
    ? TAG_THUMB_ICON[primaryTag]
    : FileQuestion;

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-[24px] border border-(--vaasenk-line-sand) bg-white/82 backdrop-blur-[12px]',
        'shadow-[0_8px_24px_rgba(160,0,0,0.08)]',
        'transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(74,5,8,0.12)]',
      )}
    >
      {/* Card body — the Link wraps title/thumbnail/meta only, NOT the
          action row. This keeps the action buttons outside the anchor and
          avoids the nested-button anti-pattern. */}
      <Link
        href={viewerHref}
        aria-label={`${MSG.open}: ${note.title}`}
        className={cn(
          'flex flex-col gap-3 focus-visible:outline-none',
          'focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30',
        )}
      >
        {/* Thumbnail */}
        <div className="relative aspect-[16/9] w-full overflow-hidden">
          {note.thumbnailSignedUrl ? (
            <Image
              src={note.thumbnailSignedUrl}
              alt=""
              fill
              unoptimized
              sizes="(min-width: 768px) 720px, 100vw"
              className="object-cover"
            />
          ) : note.fileSignedUrl && isImage ? (
            <Image
              src={note.fileSignedUrl}
              alt=""
              fill
              unoptimized
              sizes="(min-width: 768px) 720px, 100vw"
              className="object-cover"
            />
          ) : (
            <div
              aria-hidden
              className={cn(
                'flex h-full w-full items-center justify-center',
                primaryTag
                  ? TAG_CHIP_CLASSES[primaryTag]
                  : 'bg-(--vaasenk-peach-wash) text-(--vaasenk-red)',
              )}
            >
              <PlaceholderIcon className="size-12" />
            </div>
          )}
        </div>

        {/* Title + description + tags + meta */}
        <div className="flex flex-col gap-2 px-5 pt-1">
          <h3
            className="line-clamp-2 text-lg font-semibold text-(--vaasenk-ink)"
            title={note.title}
          >
            {note.title}
          </h3>
          {note.description ? (
            <p className="line-clamp-2 text-sm text-(--vaasenk-muted)">
              {note.description}
            </p>
          ) : null}

          {visibleTags.length > 0 ? (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {visibleTags.map((tag) => (
                <span
                  key={tag}
                  className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                    TAG_CHIP_CLASSES[tag],
                  )}
                >
                  {TAG_LABELS[tag]}
                </span>
              ))}
              {overflowTagCount > 0 ? (
                <span className="text-[11px] font-medium text-(--vaasenk-muted)">
                  +{overflowTagCount} more
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-(--vaasenk-subtle)">
            <div className="flex min-w-0 items-center gap-2">
              <TeacherAvatar
                name={note.teacher.name}
                url={note.teacher.avatarUrl}
              />
              <span className="truncate font-medium text-(--vaasenk-muted)">
                {note.teacher.name || MSG.noTeacher}
              </span>
            </div>
            <time
              dateTime={note.publishedAt ?? note.createdAt}
              className="shrink-0"
            >
              {formatRelative(note.publishedAt ?? note.createdAt)}
            </time>
          </div>
        </div>
      </Link>

      {/* Action row — separate from the link so bookmark/download don't nest
          inside an anchor (causes hydration warnings + screen-reader noise). */}
      <div className="flex items-center justify-between gap-2 border-t border-(--vaasenk-line-sand)/70 bg-white/60 px-3 py-2.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleBookmark();
          }}
          aria-pressed={bookmarked}
          aria-label={bookmarked ? MSG.bookmarked : MSG.bookmark}
          disabled={bookmarkPending}
          className={cn(
            'inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-full px-3 text-sm font-medium transition-all',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30',
            bookmarked
              ? 'text-(--vaasenk-deep-maroon) hover:bg-(--vaasenk-gold)/15'
              : 'text-(--vaasenk-muted) hover:bg-(--vaasenk-rose-wash) hover:text-(--vaasenk-red)',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {bookmarkPending ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : bookmarked ? (
            <BookmarkCheck className="size-5 fill-(--vaasenk-gold)" aria-hidden />
          ) : (
            <Bookmark className="size-5" aria-hidden />
          )}
          <span className="hidden sm:inline">
            {bookmarked ? MSG.bookmarked : MSG.bookmark}
          </span>
        </button>

        {note.fileSignedUrl ? (
          <a
            href={note.fileSignedUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              // Don't let the surrounding Link swallow the download.
              e.stopPropagation();
            }}
            aria-label={`${MSG.download} ${note.title}`}
            className={cn(
              'inline-flex min-h-[44px] items-center gap-2 rounded-full bg-(image:--gradient-brand-flame) px-4 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(160,0,0,0.18)] transition-all',
              'hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(160,0,0,0.28)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/40 focus-visible:ring-offset-2 focus-visible:ring-offset-(--vaasenk-warm-canvas)',
            )}
          >
            <Download className="size-4" aria-hidden />
            <span>{MSG.download}</span>
          </a>
        ) : null}
      </div>
    </article>
  );
}

// ---- Teacher avatar -------------------------------------------------------

function TeacherAvatar({
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
        className="size-6 shrink-0 rounded-full object-cover ring-1 ring-(--vaasenk-line-sand)"
      />
    );
  }
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') ||
    // Fall back to a generic icon glyph if the name is unusable.
    '';
  if (!initials) {
    return (
      <span
        aria-hidden
        className="grid size-6 shrink-0 place-items-center rounded-full bg-(image:--gradient-student-coral) text-white"
      >
        <User className="size-3" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="grid size-6 shrink-0 place-items-center rounded-full bg-(image:--gradient-student-coral) text-[10px] font-semibold text-white"
    >
      {initials}
    </span>
  );
}

// ---- Loading skeleton -----------------------------------------------------

function FeedSkeleton() {
  return (
    <ul
      role="status"
      aria-live="polite"
      aria-busy
      className="flex flex-col gap-4"
    >
      <span className="sr-only">{MSG.loadingHint}</span>
      {Array.from({ length: 4 }).map((_, i) => (
        <li
          key={i}
          className="overflow-hidden rounded-[24px] border border-(--vaasenk-line-sand) bg-white/70"
        >
          <LoadingSkeleton variant="rect" className="aspect-[16/9] w-full" />
          <div className="space-y-3 p-5">
            <LoadingSkeleton variant="text" className="w-4/5" />
            <LoadingSkeleton variant="text" className="w-3/5" />
            <div className="flex gap-2 pt-1">
              <LoadingSkeleton variant="text" className="h-5 w-16" />
              <LoadingSkeleton variant="text" className="h-5 w-20" />
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-(--vaasenk-line-sand)/70 bg-white/60 px-3 py-2.5">
            <LoadingSkeleton variant="rect" className="h-9 w-24" />
            <LoadingSkeleton variant="rect" className="h-9 w-28" />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---- Utilities ------------------------------------------------------------

function formatRelative(iso: string): string {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return '—';
  const now = new Date();
  const diffMs = now.getTime() - target.getTime();
  const minute = 1000 * 60;
  const hour = minute * 60;
  const day = hour * 24;
  if (diffMs < minute) return 'Just now';
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  const days = Math.floor(diffMs / day);
  if (days < 2) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return target.toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    ...(now.getFullYear() === target.getFullYear() ? {} : { year: 'numeric' }),
  });
}
