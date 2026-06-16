'use client';

import {
  AlertCircle,
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Download,
  ExternalLink,
  FileQuestion,
  Loader2,
  Share2,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import { EmptyState } from '@/components/ui/empty-state';
import { GlassCard } from '@/components/ui/glass-card';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { VaasenkButton } from '@/components/ui/vaasenk-button';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import {
  TAG_CHIP_CLASSES,
  TAG_LABELS,
  type NoteView,
} from '@/lib/notes-constants';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Strings
// ---------------------------------------------------------------------------

const MSG = {
  back: 'Back to classroom',
  bookmark: 'Bookmark',
  bookmarked: 'Bookmarked',
  download: 'Download',
  share: 'Share',
  shareCopied: 'Link copied to clipboard',
  shareUnsupported: 'Couldn’t copy. Long-press the address bar to copy manually.',
  openInNewTab: 'Open in new tab',
  errorTitle: 'Couldn’t load this note',
  notFoundTitle: 'Note not found or no longer available',
  notFoundDescription:
    'This note may have been removed by your teacher, or you may no longer have access to its classroom.',
  fallbackTitle: 'Preview unavailable',
  fallbackDescription:
    'We can’t render this file inline. Open it in a new tab to view the original.',
  loadingHint: 'Loading note…',
  loadingText: 'Loading note text…',
  noTeacher: 'Teacher',
} as const;

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function NoteViewerClient({
  classroomId,
  noteId,
}: {
  classroomId: string;
  noteId: string;
}) {
  const [note, setNote] = useState<NoteView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ status: number; message: string } | null>(
    null,
  );
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkPending, setBookmarkPending] = useState(false);
  const [transient, setTransient] = useState<string | null>(null);
  const transientTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -------------------------------------------------------------------------
  // Fetch the note + the bookmark state in parallel. The bookmark state is
  // derived from /bookmarks?limit=100 like on the feed page; if the lookup
  // fails we default to "not bookmarked" rather than blocking the viewer.
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [noteResult, bookmarksResult] = await Promise.allSettled([
          apiFetch<{ note: NoteView }>(`/api/v1/notes/${noteId}`),
          apiFetch<NoteView[]>(`/api/v1/bookmarks?limit=100`),
        ]);
        if (cancelled) return;

        if (noteResult.status === 'rejected') {
          const err = noteResult.reason;
          if (err instanceof ApiClientError) {
            setError({ status: err.status, message: err.message });
          } else if (err instanceof Error) {
            setError({ status: 0, message: err.message });
          } else {
            setError({ status: 0, message: 'Something went wrong.' });
          }
          setNote(null);
        } else {
          setNote(noteResult.value.note);
        }

        if (bookmarksResult.status === 'fulfilled') {
          const ids = new Set(bookmarksResult.value.map((n) => n.id));
          setBookmarked(ids.has(noteId));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  // -------------------------------------------------------------------------
  // Transient banner helper
  // -------------------------------------------------------------------------
  const flashTransient = useCallback((msg: string) => {
    setTransient(msg);
    if (transientTimer.current) clearTimeout(transientTimer.current);
    transientTimer.current = setTimeout(() => setTransient(null), 2800);
  }, []);

  useEffect(() => {
    return () => {
      if (transientTimer.current) clearTimeout(transientTimer.current);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Bookmark toggle — optimistic, rolls back on failure
  // -------------------------------------------------------------------------
  const handleToggleBookmark = useCallback(async () => {
    if (bookmarkPending) return;
    setBookmarkPending(true);
    const wasBookmarked = bookmarked;
    setBookmarked(!wasBookmarked);
    try {
      const result = await apiFetch<{ bookmarked: boolean }>(
        `/api/v1/notes/${noteId}/bookmark`,
        { method: 'POST' },
      );
      setBookmarked(result.bookmarked);
    } catch {
      setBookmarked(wasBookmarked);
      flashTransient('Could not update bookmark. Try again.');
    } finally {
      setBookmarkPending(false);
    }
  }, [bookmarkPending, bookmarked, noteId, flashTransient]);

  // -------------------------------------------------------------------------
  // Share — copy the viewer URL to the clipboard
  // -------------------------------------------------------------------------
  const handleShare = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        flashTransient(MSG.shareCopied);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        flashTransient(MSG.shareCopied);
      }
    } catch {
      flashTransient(MSG.shareUnsupported);
    }
  }, [flashTransient]);

  const backHref = `/student/classrooms/${classroomId}`;

  // -------------------------------------------------------------------------
  // Loading state — full-page skeleton sized to mimic the final chrome
  // -------------------------------------------------------------------------
  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy
        className="flex min-h-screen flex-col"
      >
        <span className="sr-only">{MSG.loadingHint}</span>
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-(--vaasenk-line-sand)/60 bg-white/65 px-4 py-3 backdrop-blur-xl sm:px-6">
          <LoadingSkeleton variant="rect" className="h-10 w-40" />
          <div className="flex-1">
            <LoadingSkeleton variant="text" className="w-1/2" />
          </div>
        </header>
        <main className="flex flex-1 items-center justify-center px-4 py-8">
          <LoadingSkeleton
            variant="rect"
            className="aspect-[3/4] w-full max-w-3xl"
          />
        </main>
        <div className="sticky bottom-0 z-30 flex items-center justify-between gap-3 border-t border-(--vaasenk-line-sand)/60 bg-white/65 px-4 py-3 backdrop-blur-xl sm:px-6">
          <LoadingSkeleton variant="rect" className="h-11 w-32" />
          <LoadingSkeleton variant="rect" className="h-11 w-36" />
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error / not-found state
  // -------------------------------------------------------------------------
  if (error || !note) {
    const isNotFound = error?.status === 404 || error?.status === 403;
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6">
        <Link
          href={backHref}
          className="inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-(--vaasenk-deep-maroon) transition-colors hover:bg-(--vaasenk-rose-wash) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {MSG.back}
        </Link>
        {isNotFound ? (
          <EmptyState
            title={MSG.notFoundTitle}
            description={MSG.notFoundDescription}
            icon={<FileQuestion className="size-7" aria-hidden />}
            action={{
              label: MSG.back,
              href: backHref,
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
              {error?.message ?? 'Unknown error.'}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <Link href={backHref}>
                <VaasenkButton variant="secondary" size="md">
                  {MSG.back}
                </VaasenkButton>
              </Link>
            </div>
          </GlassCard>
        )}
      </div>
    );
  }

  const mime = note.mimeType ?? note.fileType ?? null;
  const fileUrl = note.fileSignedUrl;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top bar — glass surface, sticky */}
      <header
        className={cn(
          'sticky top-0 z-30 flex items-center gap-3 border-b border-(--vaasenk-line-sand)/60 bg-white/72 px-4 py-3 backdrop-blur-xl sm:px-6',
        )}
      >
        <Link
          href={backHref}
          aria-label={MSG.back}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-(--vaasenk-deep-maroon) transition-colors hover:bg-(--vaasenk-rose-wash) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30"
        >
          <ArrowLeft className="size-4" aria-hidden />
          <span className="hidden sm:inline">{MSG.back}</span>
        </Link>

        <h1
          className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-(--vaasenk-ink) sm:text-base"
          title={note.title}
        >
          {note.title}
        </h1>

        <div className="hidden items-center gap-2 lg:flex">
          {note.tags.slice(0, 2).map((tag) => (
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
          <span className="text-xs text-(--vaasenk-muted)">
            {note.teacher.name || MSG.noTeacher}
          </span>
          {note.publishedAt ? (
            <time
              dateTime={note.publishedAt}
              className="text-xs text-(--vaasenk-subtle)"
            >
              {formatDate(note.publishedAt)}
            </time>
          ) : null}
        </div>
      </header>

      {/* Transient banner — sits below the top bar, dismisses itself */}
      {transient ? (
        <div
          role="status"
          aria-live="polite"
          className="sticky top-[60px] z-20 mx-auto mt-2 inline-flex items-center gap-2 self-center rounded-full border border-(--vaasenk-success)/30 bg-(--vaasenk-success)/10 px-4 py-2 text-sm font-medium text-(--vaasenk-success)"
        >
          {transient}
        </div>
      ) : null}

      {/* Viewer body */}
      <main className="flex flex-1 items-stretch">
        <ViewerSurface mimeType={mime} fileUrl={fileUrl} title={note.title} />
      </main>

      {/* Bottom action bar — glass, sticky, safe-area aware */}
      <div
        className={cn(
          'sticky bottom-0 z-30 border-t border-(--vaasenk-line-sand)/60 bg-white/72 px-4 backdrop-blur-xl sm:px-6',
          // Respect the iOS home indicator on mobile web installs.
          'pb-[max(env(safe-area-inset-bottom),0px)] pt-3',
        )}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 pb-3">
          <button
            type="button"
            onClick={handleToggleBookmark}
            aria-pressed={bookmarked}
            aria-label={bookmarked ? MSG.bookmarked : MSG.bookmark}
            disabled={bookmarkPending}
            className={cn(
              'inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-semibold transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30 focus-visible:ring-offset-2 focus-visible:ring-offset-(--vaasenk-warm-canvas)',
              bookmarked
                ? 'border border-(--vaasenk-gold)/40 bg-(--vaasenk-gold)/15 text-(--vaasenk-deep-maroon) hover:bg-(--vaasenk-gold)/25'
                : 'border border-(--vaasenk-line-sand) bg-white/80 text-(--vaasenk-deep-maroon) hover:border-(--vaasenk-red)/40 hover:bg-white',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            {bookmarkPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : bookmarked ? (
              <BookmarkCheck className="size-4 fill-(--vaasenk-gold)" aria-hidden />
            ) : (
              <Bookmark className="size-4" aria-hidden />
            )}
            <span>{bookmarked ? MSG.bookmarked : MSG.bookmark}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              aria-label={MSG.share}
              className={cn(
                'inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-full px-3 text-sm font-medium transition-colors',
                'border border-(--vaasenk-line-sand) bg-white/80 text-(--vaasenk-deep-maroon)',
                'hover:border-(--vaasenk-red)/40 hover:bg-white',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30 focus-visible:ring-offset-2 focus-visible:ring-offset-(--vaasenk-warm-canvas)',
              )}
            >
              <Share2 className="size-4" aria-hidden />
              <span className="hidden sm:inline">{MSG.share}</span>
            </button>

            {fileUrl ? (
              <a
                href={fileUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${MSG.download} ${note.title}`}
                className={cn(
                  'inline-flex min-h-[44px] items-center gap-2 rounded-full bg-(image:--gradient-brand-flame) px-5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(160,0,0,0.18)] transition-all',
                  'hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(160,0,0,0.28)]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/40 focus-visible:ring-offset-2 focus-visible:ring-offset-(--vaasenk-warm-canvas)',
                )}
              >
                <Download className="size-4" aria-hidden />
                <span>{MSG.download}</span>
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Sub-components
// ===========================================================================

/**
 * Polymorphic viewer surface. Picks a render strategy based on mime type:
 *   • image/*           → pinch-zoom / pan via react-zoom-pan-pinch
 *   • application/pdf   → native browser PDF iframe
 *   • text/plain        → fetched + rendered inline in a glass card
 *   • everything else   → friendly fallback with "Open in new tab"
 */
function ViewerSurface({
  mimeType,
  fileUrl,
  title,
}: {
  mimeType: string | null;
  fileUrl: string | null;
  title: string;
}) {
  if (!fileUrl) {
    return <FallbackSurface fileUrl={null} />;
  }

  const isImage = mimeType?.startsWith('image/') ?? false;
  const isPdf = mimeType === 'application/pdf';
  const isText = mimeType === 'text/plain';

  if (isImage) {
    return <ImageSurface fileUrl={fileUrl} title={title} />;
  }
  if (isPdf) {
    return <PdfSurface fileUrl={fileUrl} title={title} />;
  }
  if (isText) {
    return <TextSurface fileUrl={fileUrl} />;
  }
  return <FallbackSurface fileUrl={fileUrl} />;
}

// ---- Image surface (pinch-zoom) -------------------------------------------

function ImageSurface({
  fileUrl,
  title,
}: {
  fileUrl: string;
  title: string;
}) {
  return (
    <div
      className="relative flex w-full flex-1 items-stretch justify-center"
      style={{ minHeight: '60vh' }}
    >
      <TransformWrapper
        minScale={0.5}
        maxScale={5}
        initialScale={1}
        centerOnInit
        doubleClick={{ mode: 'reset' }}
        wheel={{ step: 0.15 }}
        pinch={{ step: 5 }}
      >
        <TransformComponent
          wrapperClass="!w-full !h-auto !flex-1"
          contentClass="!w-full"
        >
          {/* The image is intentionally rendered with a plain <img>: Next's
              Image component fights TransformComponent for sizing and the
              signed URL doesn't benefit from Next's optimizer anyway
              (Supabase already serves transforms upstream). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fileUrl}
            alt={title}
            draggable={false}
            className="mx-auto h-auto max-h-[80vh] w-auto max-w-full select-none object-contain"
          />
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}

// ---- PDF surface (native iframe) ------------------------------------------

function PdfSurface({
  fileUrl,
  title,
}: {
  fileUrl: string;
  title: string;
}) {
  return (
    <iframe
      src={fileUrl}
      title={title}
      // h-screen would be too tall once the top + bottom bars are accounted
      // for; we let flex-1 stretch the iframe to the remaining viewport.
      className="h-full min-h-[70vh] w-full flex-1 border-0 bg-white"
    />
  );
}

// ---- Text surface ---------------------------------------------------------

function TextSurface({ fileUrl }: { fileUrl: string }) {
  const [text, setText] = useState<string | null>(null);
  const [textError, setTextError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.text();
        if (!cancelled) setText(body);
      } catch (err) {
        if (cancelled) return;
        setTextError(
          err instanceof Error ? err.message : 'Could not load text.',
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileUrl]);

  if (textError) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <FallbackSurface fileUrl={fileUrl} />
      </div>
    );
  }

  if (text === null) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6"
      >
        <span className="sr-only">{MSG.loadingText}</span>
        <GlassCard padding="lg">
          <div className="space-y-3">
            <LoadingSkeleton variant="text" className="w-3/4" />
            <LoadingSkeleton variant="text" className="w-5/6" />
            <LoadingSkeleton variant="text" className="w-2/3" />
            <LoadingSkeleton variant="text" className="w-4/5" />
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <GlassCard padding="lg">
        <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words font-vaasenk text-sm leading-relaxed text-(--vaasenk-ink)">
          {text}
        </pre>
      </GlassCard>
    </div>
  );
}

// ---- Fallback surface -----------------------------------------------------

function FallbackSurface({ fileUrl }: { fileUrl: string | null }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl items-center justify-center px-4 py-12 sm:px-6">
      <GlassCard padding="lg" className="w-full text-center">
        <div
          aria-hidden
          className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-(--vaasenk-peach-wash) text-(--vaasenk-red)"
        >
          <FileQuestion className="size-6" />
        </div>
        <h3 className="text-xl font-semibold text-(--vaasenk-ink)">
          {MSG.fallbackTitle}
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-(--vaasenk-muted)">
          {MSG.fallbackDescription}
        </p>
        {fileUrl ? (
          <div className="mt-5 inline-flex">
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'inline-flex min-h-[44px] items-center gap-2 rounded-full bg-(image:--gradient-brand-flame) px-5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(160,0,0,0.18)] transition-all',
                'hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(160,0,0,0.28)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/40 focus-visible:ring-offset-2 focus-visible:ring-offset-(--vaasenk-warm-canvas)',
              )}
            >
              <ExternalLink className="size-4" aria-hidden />
              {MSG.openInNewTab}
            </a>
          </div>
        ) : null}
      </GlassCard>
    </div>
  );
}

// ---- Utilities ------------------------------------------------------------

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
