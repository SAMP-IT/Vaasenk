'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  AlertCircle,
  BookOpen,
  Calculator,
  ClipboardList,
  Eye,
  EyeOff,
  FileQuestion,
  FileText,
  Highlighter,
  Image as ImageIcon,
  Loader2,
  MoreHorizontal,
  Plus,
  RotateCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { VaasenkButton } from '@/components/ui/vaasenk-button';
import { ApiClientError, apiFetch, apiFetchEnvelope } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  NOTE_TAGS,
  TAG_CHIP_CLASSES,
  TAG_LABELS,
  type NoteStatus,
  type NoteTag,
} from '@/lib/notes-constants';
import { UploadNoteDrawer } from './upload-note-drawer';

const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 300;

const MSG = {
  searchPlaceholder: 'Search notes by title or description…',
  allTags: 'All tags',
  status: {
    PUBLISHED: 'Published',
    DRAFT: 'Drafts',
    ALL: 'All',
  },
  upload: 'Upload note',
  noNotesTitle: 'No notes published yet',
  noNotesDescription:
    'Photograph your board, share a study PDF, or attach a write-up — students will see it the moment you publish.',
  emptyCta: 'Upload your first note',
  noMatch: 'No notes match these filters.',
  clearFilters: 'Clear filters',
  errorTitle: 'Couldn’t load notes',
  retry: 'Retry',
  showing: (from: number, to: number, total: number) =>
    `Showing ${from}–${to} of ${total}`,
  prev: 'Previous',
  next: 'Next',
  rowActions: 'Note actions',
  publish: 'Publish',
  unpublish: 'Move to draft',
  edit: 'Edit (coming soon)',
  remove: 'Delete',
  draftPill: 'Draft',
  publishedPill: 'Published',
  uploadSuccessPublished: 'Note published. Students will see it in their feed.',
  uploadSuccessDraft: 'Saved as draft. Publish it when you’re ready.',
  loadingHint: 'Loading notes…',
} as const;

type StatusFilter = 'PUBLISHED' | 'DRAFT' | 'ALL';

type NoteRow = {
  id: string;
  classroomId: string;
  title: string;
  description: string | null;
  tags: NoteTag[];
  status: NoteStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  fileSignedUrl: string | null;
  thumbnailSignedUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  downloadCount: number;
  teacher: {
    id: string;
    name: string;
    email: string | null;
    avatarUrl: string | null;
  };
};

type ListNotesResponse = NoteRow[];

export function NotesTab({
  classroomId,
  classroomName,
  apiBaseUrl,
  accessToken,
  onTransientBanner,
}: {
  classroomId: string;
  classroomName: string;
  apiBaseUrl: string;
  accessToken: string | null;
  onTransientBanner: (msg: string) => void;
}) {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<NoteTag | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PUBLISHED');
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<NoteRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pendingNoteId, setPendingNoteId] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const seenInitialMount = useRef(false);

  // Debounce search (~300ms).
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchNotes = useCallback(async () => {
    setError(null);
    if (!seenInitialMount.current) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      params.set('sort', 'publishedAt:desc');
      if (tagFilter !== 'ALL') params.set('tag', tagFilter);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);

      const result = await apiFetchEnvelope<ListNotesResponse>(
        `/api/v1/classrooms/${classroomId}/notes?${params.toString()}`,
      );
      setRows(result.data ?? []);
      setTotal(result.meta?.total ?? (result.data ?? []).length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
      setRefreshing(false);
      seenInitialMount.current = true;
    }
  }, [classroomId, page, tagFilter, statusFilter, debouncedSearch]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleTogglePublish = async (note: NoteRow) => {
    if (pendingNoteId) return;
    setPendingNoteId(note.id);
    const nextStatus: NoteStatus =
      note.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    try {
      await apiFetch(`/api/v1/notes/${note.id}`, {
        method: 'PATCH',
        body: { status: nextStatus },
      });
      onTransientBanner(
        nextStatus === 'PUBLISHED'
          ? `“${note.title}” is now published.`
          : `“${note.title}” moved to draft.`,
      );
      await fetchNotes();
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Action failed.';
      onTransientBanner(msg);
    } finally {
      setPendingNoteId(null);
    }
  };

  const handleDelete = async (note: NoteRow) => {
    if (pendingNoteId) return;
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        `Delete “${note.title}”? Students will lose access immediately. You can ask an admin to restore it later.`,
      );
      if (!ok) return;
    }
    setPendingNoteId(note.id);
    try {
      await apiFetch(`/api/v1/notes/${note.id}`, { method: 'DELETE' });
      onTransientBanner(`“${note.title}” deleted.`);
      await fetchNotes();
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Delete failed.';
      onTransientBanner(msg);
    } finally {
      setPendingNoteId(null);
    }
  };

  const handleUploadSuccess = (status: 'DRAFT' | 'PUBLISHED') => {
    setDrawerOpen(false);
    onTransientBanner(
      status === 'PUBLISHED'
        ? MSG.uploadSuccessPublished
        : MSG.uploadSuccessDraft,
    );
    // Bring the user to the relevant tab + first page so the new note is
    // visible immediately.
    setStatusFilter(status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT');
    setPage(1);
    fetchNotes();
  };

  const hasActiveFilters =
    debouncedSearch !== '' ||
    tagFilter !== 'ALL' ||
    statusFilter !== 'PUBLISHED';

  const clearFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setTagFilter('ALL');
    setStatusFilter('PUBLISHED');
    setPage(1);
  };

  const rangeFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeTo = Math.min(page * PAGE_SIZE, total);
  const canPrev = page > 1 && !loading;
  const canNext = page * PAGE_SIZE < total && !loading;

  return (
    <div className="flex flex-col gap-6">
      {/* Filter row */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Search */}
          <div className="relative w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-(--vaasenk-subtle)" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={MSG.searchPlaceholder}
              aria-label={MSG.searchPlaceholder}
              disabled={loading && rows.length === 0}
              className="min-h-[44px] w-full rounded-full border border-(--vaasenk-line-sand) bg-white/80 py-2.5 pl-11 pr-4 text-sm text-(--vaasenk-ink) placeholder:text-(--vaasenk-subtle) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-70"
            />
          </div>

          {/* Status chips */}
          <div
            role="tablist"
            aria-label="Filter by status"
            className="flex flex-wrap items-center gap-2"
          >
            {(['PUBLISHED', 'DRAFT', 'ALL'] as StatusFilter[]).map((s) => (
              <FilterChip
                key={s}
                active={statusFilter === s}
                onClick={() => {
                  setStatusFilter(s);
                  setPage(1);
                }}
                disabled={loading && rows.length === 0}
              >
                {MSG.status[s]}
              </FilterChip>
            ))}

            <div className="hidden lg:block">
              <VaasenkButton
                variant="primary"
                size="md"
                onClick={() => setDrawerOpen(true)}
              >
                <Plus className="size-4" />
                {MSG.upload}
              </VaasenkButton>
            </div>
          </div>
        </div>

        {/* Tag chips — second row */}
        <div
          role="tablist"
          aria-label="Filter by tag"
          className="-mx-2 flex flex-nowrap items-center gap-2 overflow-x-auto px-2 pb-1 sm:flex-wrap sm:overflow-visible"
        >
          <FilterChip
            active={tagFilter === 'ALL'}
            onClick={() => {
              setTagFilter('ALL');
              setPage(1);
            }}
            disabled={loading && rows.length === 0}
          >
            {MSG.allTags}
          </FilterChip>
          {NOTE_TAGS.map((tag) => (
            <FilterChip
              key={tag}
              active={tagFilter === tag}
              onClick={() => {
                setTagFilter(tag);
                setPage(1);
              }}
              disabled={loading && rows.length === 0}
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
              <Loader2 className="size-3 animate-spin" />
              Updating…
            </span>
          ) : null}
        </div>
      </div>

      {/* Body */}
      {error ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-4 py-4 text-sm text-(--vaasenk-danger)"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
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
              onClick={() => {
                setError(null);
                fetchNotes();
              }}
            >
              {MSG.retry}
            </VaasenkButton>
          </div>
        </div>
      ) : null}

      {!error && loading ? <NotesGridSkeleton /> : null}

      {!error && !loading && rows.length === 0 ? (
        hasActiveFilters ? (
          <div className="rounded-3xl border border-(--vaasenk-line-sand) bg-white/60 p-12 text-center">
            <p className="text-sm text-(--vaasenk-muted)">{MSG.noMatch}</p>
            <div className="mt-4 inline-flex">
              <VaasenkButton
                variant="secondary"
                size="sm"
                onClick={clearFilters}
              >
                {MSG.clearFilters}
              </VaasenkButton>
            </div>
          </div>
        ) : (
          <EmptyState
            title={MSG.noNotesTitle}
            description={MSG.noNotesDescription}
            icon={<Upload className="size-7" />}
            action={{
              label: MSG.emptyCta,
              onClick: () => setDrawerOpen(true),
            }}
          />
        )
      ) : null}

      {!error && !loading && rows.length > 0 ? (
        <>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((note) => (
              <li key={note.id}>
                <NoteCard
                  note={note}
                  inFlight={pendingNoteId === note.id}
                  onTogglePublish={handleTogglePublish}
                  onDelete={handleDelete}
                />
              </li>
            ))}
          </ul>

          {total > 0 ? (
            <footer className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <p
                className="text-xs text-(--vaasenk-muted)"
                aria-live="polite"
              >
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

      {/* Mobile floating Action Button — primary CTA on small screens. */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label={MSG.upload}
        className="fixed bottom-6 right-6 z-30 inline-flex size-14 items-center justify-center rounded-full bg-(image:--gradient-brand-flame) text-white shadow-[0_18px_50px_rgba(160,0,0,0.28)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red) focus-visible:ring-offset-2 focus-visible:ring-offset-(--vaasenk-warm-canvas) lg:hidden"
      >
        <Plus className="size-6" />
      </button>

      {/* Upload drawer */}
      {drawerOpen ? (
        <UploadNoteDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          classroomId={classroomId}
          onSuccess={handleUploadSuccess}
          apiBaseUrl={apiBaseUrl}
          accessToken={accessToken}
        />
      ) : null}

      {/* Suppress unused warning when classroomName is reserved for future
          use (e.g. drawer success copy). Kept on props for stability. */}
      <span className="sr-only">{classroomName}</span>
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

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

function NotesGridSkeleton() {
  return (
    <ul
      role="status"
      aria-live="polite"
      aria-busy
      className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
    >
      <span className="sr-only">{MSG.loadingHint}</span>
      {Array.from({ length: 6 }).map((_, i) => (
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
            <div className="flex items-center gap-2 pt-3">
              <LoadingSkeleton variant="circle" className="size-7" />
              <LoadingSkeleton variant="text" className="w-1/3" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Note card
// ---------------------------------------------------------------------------

const TAG_THUMB_ICON: Record<NoteTag, React.ComponentType<{ className?: string }>> = {
  IMPORTANT: BookOpen,
  HOMEWORK: ClipboardList,
  EXAM: Highlighter,
  ASSIGNMENT: FileText,
  REVISION: RotateCw,
  FORMULA: Calculator,
};

function NoteCard({
  note,
  inFlight,
  onTogglePublish,
  onDelete,
}: {
  note: NoteRow;
  inFlight: boolean;
  onTogglePublish: (note: NoteRow) => void;
  onDelete: (note: NoteRow) => void;
}) {
  const isPublished = note.status === 'PUBLISHED';
  const isImage = note.mimeType?.startsWith('image/') ?? false;
  const visibleTags = note.tags.slice(0, 3);
  const overflowTagCount = note.tags.length - visibleTags.length;
  const primaryTag = note.tags[0];
  const PlaceholderIcon =
    primaryTag ? TAG_THUMB_ICON[primaryTag] : FileQuestion;

  return (
    <article
      className={cn(
        'group flex h-full flex-col overflow-hidden rounded-[24px] border border-(--vaasenk-line-sand) bg-white/82 backdrop-blur-[12px] transition-all',
        'shadow-[0_8px_24px_rgba(160,0,0,0.08)]',
        'hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(74,5,8,0.12)]',
      )}
    >
      {/* Thumbnail */}
      <div
        className={cn(
          'relative aspect-[16/9] w-full overflow-hidden',
          isPublished ? '' : 'opacity-90',
        )}
      >
        {note.thumbnailSignedUrl ? (
          <Image
            src={note.thumbnailSignedUrl}
            alt=""
            fill
            unoptimized
            sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
        ) : note.fileSignedUrl && isImage ? (
          <Image
            src={note.fileSignedUrl}
            alt=""
            fill
            unoptimized
            sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
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
            <PlaceholderIcon className="size-10" />
          </div>
        )}
        {/* Status pill, top-right */}
        <div className="absolute right-3 top-3">
          {isPublished ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-(--vaasenk-success)/90 px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_4px_12px_rgba(22,163,74,0.24)]">
              <Eye className="size-3" />
              {MSG.publishedPill}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-(--vaasenk-deep-maroon)/85 px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_4px_12px_rgba(74,5,8,0.24)]">
              <EyeOff className="size-3" />
              {MSG.draftPill}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <h3
            className="line-clamp-1 text-base font-semibold text-(--vaasenk-ink)"
            title={note.title}
          >
            {note.title}
          </h3>
          <NoteRowMenu
            note={note}
            inFlight={inFlight}
            onTogglePublish={onTogglePublish}
            onDelete={onDelete}
          />
        </div>
        {note.description ? (
          <p className="line-clamp-2 text-sm text-(--vaasenk-muted)">
            {note.description}
          </p>
        ) : (
          <p className="line-clamp-2 text-sm text-(--vaasenk-subtle)">
            No description.
          </p>
        )}

        {/* Tag pills */}
        {note.tags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
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

        {/* Footer meta */}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-xs text-(--vaasenk-subtle)">
          <div className="flex min-w-0 items-center gap-2">
            <NoteAvatar
              name={note.teacher.name}
              url={note.teacher.avatarUrl}
            />
            <span className="truncate font-medium text-(--vaasenk-muted)">
              {note.teacher.name}
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
    </article>
  );
}

function NoteRowMenu({
  note,
  inFlight,
  onTogglePublish,
  onDelete,
}: {
  note: NoteRow;
  inFlight: boolean;
  onTogglePublish: (note: NoteRow) => void;
  onDelete: (note: NoteRow) => void;
}) {
  const isPublished = note.status === 'PUBLISHED';
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={MSG.rowActions}
          disabled={inFlight}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-(--vaasenk-muted) transition-colors hover:bg-(--vaasenk-rose-wash) hover:text-(--vaasenk-red) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {inFlight ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <MoreHorizontal className="size-4" />
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-[200px] overflow-hidden rounded-2xl border border-(--vaasenk-line-sand) bg-white/95 p-1.5 shadow-[0_18px_50px_rgba(74,5,8,0.16)] backdrop-blur-xl"
        >
          <MenuItem
            icon={isPublished ? EyeOff : Eye}
            onSelect={() => onTogglePublish(note)}
            tone="default"
          >
            {isPublished ? MSG.unpublish : MSG.publish}
          </MenuItem>
          <MenuItem
            icon={FileText}
            onSelect={() => {
              /* Edit drawer lands in Sprint 2.5 — title + description + tags */
            }}
            tone="default"
            disabled
            hint="Inline edit is coming in Sprint 2.5."
          >
            {MSG.edit}
          </MenuItem>
          <DropdownMenu.Separator className="my-1 h-px bg-(--vaasenk-line-sand)/60" />
          <MenuItem
            icon={Trash2}
            onSelect={() => onDelete(note)}
            tone="danger"
          >
            {MSG.remove}
          </MenuItem>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MenuItem({
  icon: Icon,
  children,
  onSelect,
  disabled,
  tone,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  tone: 'default' | 'danger';
  hint?: string;
}) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={(e) => {
        e.preventDefault();
        if (!disabled) onSelect();
      }}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium outline-none transition-colors',
        tone === 'danger'
          ? 'text-(--vaasenk-danger) data-highlighted:bg-(--vaasenk-danger)/10'
          : 'text-(--vaasenk-deep-maroon) data-highlighted:bg-(--vaasenk-rose-wash)',
        'data-disabled:cursor-not-allowed data-disabled:opacity-50',
      )}
      title={hint}
    >
      <Icon className="size-4" />
      <span className="flex-1">{children}</span>
    </DropdownMenu.Item>
  );
}

function NoteAvatar({
  name,
  url,
}: {
  name: string;
  url: string | null;
}) {
  const initials = useMemo(() => {
    return (
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? '')
        .join('') || '?'
    );
  }, [name]);
  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={28}
        height={28}
        unoptimized
        className="size-7 shrink-0 rounded-full object-cover ring-1 ring-(--vaasenk-line-sand)"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="grid size-7 shrink-0 place-items-center rounded-full bg-(image:--gradient-teacher-orange) text-[10px] font-semibold text-white"
    >
      {initials}
    </span>
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

/**
 * Image is used implicitly via thumbnail rendering; ImageIcon kept for
 * future inline previews and to keep the icon set co-located.
 */
void ImageIcon;
