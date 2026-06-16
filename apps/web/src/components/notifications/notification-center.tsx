'use client';

/**
 * NotificationCenter — Sprint 6.2.
 *
 * The dropdown body rendered inside the NotificationBell trigger. Splits
 * the list into Today / Yesterday / This week / Older sections, hides empty
 * groups, and routes each row to its entity via {@link getNotificationHref}.
 *
 * Handles all five states (per CLAUDE.md §5):
 *   • Default     — grouped items
 *   • Loading     — three shimmer rows in the first group
 *   • Empty       — friendly "all caught up" + sparkle illustration
 *   • Error       — inline red banner + retry button
 *   • Disabled    — N/A here (component is only mounted when bell is open)
 *
 * Layout: ~360px wide on desktop (sized by parent), full-bleed friendly on
 * mobile via the `min(360px,calc(100vw-1.5rem))` clamp on the parent. We
 * deliberately don't use Radix Sheet — the prompt prefers a single dropdown
 * surface that stays attached to the bell.
 */

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  AlertCircle,
  BellOff,
  BookOpen,
  CheckCheck,
  FileText,
  Loader2,
  Megaphone,
  RefreshCw,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { getNotificationHref } from '@/lib/notifications/links';
import type {
  NotificationGroup,
  NotificationGroupKey,
  NotificationType,
  NotificationView,
} from '@/lib/notifications/types';
import { cn } from '@/lib/utils';

const MSG = {
  title: 'Notifications',
  markAllRead: 'Mark all read',
  markingAll: 'Marking all…',
  emptyTitle: 'You’re all caught up',
  emptyDescription:
    'We’ll let you know here when there’s something new — new notes, papers, or alerts.',
  errorTitle: 'Couldn’t load notifications',
  errorRetry: 'Retry',
  groupToday: 'Today',
  groupYesterday: 'Yesterday',
  groupThisWeek: 'This week',
  groupOlder: 'Older',
} as const;

// -------------------------------------------------------------------------
// Time formatting — tiny, dep-free relative + group bucket helpers.
//
// Avoids pulling in date-fns just for two utilities. en-IN copy.
// -------------------------------------------------------------------------

function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 45) return 'Just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  // Older than a week: show a clean date in en-IN (e.g. "12 Mar").
  return then.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

function startOfLocalDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function groupKeyFor(iso: string, now: Date = new Date()): NotificationGroupKey {
  const today = startOfLocalDay(now).getTime();
  const yesterday = today - 24 * 60 * 60 * 1000;
  const weekStart = today - 6 * 24 * 60 * 60 * 1000;
  const t = new Date(iso).getTime();
  if (t >= today) return 'today';
  if (t >= yesterday) return 'yesterday';
  if (t >= weekStart) return 'this-week';
  return 'older';
}

function groupNotifications(items: NotificationView[]): NotificationGroup[] {
  const now = new Date();
  const buckets: Record<NotificationGroupKey, NotificationView[]> = {
    today: [],
    yesterday: [],
    'this-week': [],
    older: [],
  };
  for (const item of items) {
    buckets[groupKeyFor(item.createdAt, now)].push(item);
  }
  const order: Array<{ key: NotificationGroupKey; label: string }> = [
    { key: 'today', label: MSG.groupToday },
    { key: 'yesterday', label: MSG.groupYesterday },
    { key: 'this-week', label: MSG.groupThisWeek },
    { key: 'older', label: MSG.groupOlder },
  ];
  return order
    .filter((g) => buckets[g.key].length > 0)
    .map((g) => ({ key: g.key, label: g.label, items: buckets[g.key] }));
}

// -------------------------------------------------------------------------
// Icon mapping — keyed on NotificationType. Legacy values fall back to the
// closest canonical sibling. Unknown server values land on Megaphone.
// -------------------------------------------------------------------------

function iconFor(type: NotificationType): LucideIcon {
  switch (type) {
    case 'NOTE_PUBLISHED':
      return BookOpen;
    case 'PAPER_GENERATED':
    case 'PAPER_READY':
      return FileText;
    case 'PAPER_FAILED':
    case 'SYLLABUS_FAILED':
      return AlertCircle;
    case 'SYLLABUS_READY':
    case 'SYLLABUS_PROCESSED':
    case 'AI_READY':
      return Sparkles;
    case 'CLASSROOM_JOINED':
    case 'CLASSROOM_INVITE':
      return UserPlus;
    case 'AI_CREDITS_LOW':
      return Sparkles;
    case 'DOUBT_RECEIVED':
    case 'DOUBT_REPLIED':
      return BookOpen;
    case 'SYSTEM_ANNOUNCEMENT':
    case 'SYSTEM':
    default:
      return Megaphone;
  }
}

/**
 * Visual tone for a notification's icon tile. Keeps the brand palette
 * tasteful: success-green for completion, danger-red for failures, gold
 * for AI / sparkly stuff, default rose-wash for everything else.
 */
function toneFor(type: NotificationType): 'default' | 'success' | 'danger' | 'gold' {
  if (type === 'PAPER_FAILED' || type === 'SYLLABUS_FAILED') return 'danger';
  if (type === 'AI_CREDITS_LOW') return 'gold';
  if (
    type === 'SYLLABUS_READY' ||
    type === 'PAPER_GENERATED' ||
    type === 'PAPER_READY' ||
    type === 'CLASSROOM_JOINED'
  ) {
    return 'success';
  }
  return 'default';
}

// -------------------------------------------------------------------------
// Component
// -------------------------------------------------------------------------

export type NotificationCenterProps = {
  notifications: NotificationView[];
  unreadTotal: number;
  isLoading: boolean;
  error: { message: string } | null;
  isConnected: boolean;
  onMarkRead: (id: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onRetry: () => Promise<void>;
  /** Called after navigating to a notification so the parent can close. */
  onItemSelected: () => void;
};

export function NotificationCenter({
  notifications,
  unreadTotal,
  isLoading,
  error,
  isConnected,
  onMarkRead,
  onMarkAllRead,
  onRetry,
  onItemSelected,
}: NotificationCenterProps) {
  const router = useRouter();
  const [isMarkingAll, setIsMarkingAll] = React.useState(false);
  const [isRetrying, setIsRetrying] = React.useState(false);

  const groups = React.useMemo(
    () => groupNotifications(notifications),
    [notifications],
  );

  const handleSelect = React.useCallback(
    async (n: NotificationView) => {
      const href = getNotificationHref(n);
      // Optimistic mark-as-read; navigate regardless of network outcome.
      if (n.readAt === null) {
        // Fire-and-forget: the hook reconciles in the background.
        onMarkRead(n.id).catch(() => {
          /* hook already logs + rolls back */
        });
      }
      onItemSelected();
      router.push(href);
    },
    [onItemSelected, onMarkRead, router],
  );

  const handleMarkAllRead = React.useCallback(async () => {
    if (isMarkingAll || unreadTotal === 0) return;
    setIsMarkingAll(true);
    try {
      await onMarkAllRead();
    } catch {
      /* hook logged */
    } finally {
      setIsMarkingAll(false);
    }
  }, [isMarkingAll, onMarkAllRead, unreadTotal]);

  const handleRetry = React.useCallback(async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  }, [isRetrying, onRetry]);

  return (
    <div className="flex max-h-[min(560px,80vh)] flex-col">
      {/* ---- Header --------------------------------------------------- */}
      <header className="flex items-center justify-between gap-3 border-b border-(--vaasenk-line-sand) px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-(--vaasenk-ink)">
            {MSG.title}
          </h2>
          <p className="mt-0.5 text-xs text-(--vaasenk-muted)">
            {unreadTotal > 0
              ? `${unreadTotal} unread`
              : isConnected
                ? 'Live updates on'
                : 'Reconnecting…'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleMarkAllRead}
          disabled={unreadTotal === 0 || isMarkingAll}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/40',
            unreadTotal === 0 || isMarkingAll
              ? 'cursor-not-allowed text-(--vaasenk-subtle)'
              : 'text-(--vaasenk-red) hover:bg-(--vaasenk-rose-wash)',
          )}
        >
          {isMarkingAll ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <CheckCheck className="size-3.5" />
          )}
          {isMarkingAll ? MSG.markingAll : MSG.markAllRead}
        </button>
      </header>

      {/* ---- Body ----------------------------------------------------- */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {error ? (
          <ErrorState
            message={error.message}
            onRetry={handleRetry}
            isRetrying={isRetrying}
          />
        ) : isLoading && notifications.length === 0 ? (
          <LoadingRows />
        ) : notifications.length === 0 ? (
          <EmptyContents />
        ) : (
          groups.map((group) => (
            <section key={group.key} className="mb-2 last:mb-0">
              <DropdownMenu.Label
                className="px-3 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-wider text-(--vaasenk-subtle)"
              >
                {group.label}
              </DropdownMenu.Label>
              {group.items.map((n) => (
                <DropdownMenu.Item
                  key={n.id}
                  onSelect={(e) => {
                    // Prevent Radix's auto-close — we close manually after
                    // the optimistic write so the visual stays smooth.
                    e.preventDefault();
                    void handleSelect(n);
                  }}
                  className={cn(
                    'group relative flex cursor-pointer items-start gap-3 rounded-2xl px-3 py-3 outline-none transition-colors',
                    'data-highlighted:bg-(--vaasenk-rose-wash)',
                    'focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30',
                  )}
                >
                  <IconTile icon={iconFor(n.type)} tone={toneFor(n.type)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={cn(
                          'truncate text-sm',
                          n.readAt === null
                            ? 'font-semibold text-(--vaasenk-ink)'
                            : 'font-medium text-(--vaasenk-ink)/85',
                        )}
                      >
                        {n.title}
                      </p>
                      <time
                        dateTime={n.createdAt}
                        className="shrink-0 whitespace-nowrap text-[11px] text-(--vaasenk-subtle)"
                      >
                        {formatRelativeTime(n.createdAt)}
                      </time>
                    </div>
                    {n.body ? (
                      <p
                        className={cn(
                          'mt-0.5 line-clamp-2 text-xs',
                          n.readAt === null
                            ? 'text-(--vaasenk-muted)'
                            : 'text-(--vaasenk-muted)/80',
                        )}
                      >
                        {n.body}
                      </p>
                    ) : null}
                  </div>
                  {n.readAt === null ? (
                    <span
                      aria-hidden
                      title="Unread"
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-(--vaasenk-gold) shadow-[0_0_0_2px_rgba(254,202,2,0.25)]"
                    />
                  ) : null}
                </DropdownMenu.Item>
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Sub-pieces
// -------------------------------------------------------------------------

function IconTile({
  icon: Icon,
  tone,
}: {
  icon: LucideIcon;
  tone: 'default' | 'success' | 'danger' | 'gold';
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl',
        tone === 'default' &&
          'bg-(--vaasenk-rose-wash) text-(--vaasenk-red)',
        tone === 'success' &&
          'bg-(--vaasenk-success)/12 text-(--vaasenk-success)',
        tone === 'danger' &&
          'bg-(--vaasenk-danger)/12 text-(--vaasenk-danger)',
        tone === 'gold' &&
          'bg-(--vaasenk-gold)/20 text-(--vaasenk-deep-maroon)',
      )}
    >
      <Icon className="size-[18px]" />
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="px-3 py-2">
      <p className="px-1 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-(--vaasenk-subtle)">
        {MSG.groupToday}
      </p>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-start gap-3 rounded-2xl px-1 py-3"
        >
          <LoadingSkeleton className="size-10 shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <LoadingSkeleton className="h-3 w-3/4" variant="text" />
            <LoadingSkeleton className="h-3 w-full" variant="text" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyContents() {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div
        aria-hidden
        className="mb-3 grid size-14 place-items-center rounded-2xl bg-[linear-gradient(135deg,#FFE3D2_0%,#FFF0F4_100%)] text-(--vaasenk-red) shadow-[inset_0_0_0_1px_rgba(234,215,207,0.6)]"
      >
        <BellOff className="size-6" />
      </div>
      <h3 className="text-sm font-semibold text-(--vaasenk-ink)">
        {MSG.emptyTitle}
      </h3>
      <p className="mt-1 max-w-[260px] text-xs text-(--vaasenk-muted)">
        {MSG.emptyDescription}
      </p>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
  isRetrying,
}: {
  message: string;
  onRetry: () => void;
  isRetrying: boolean;
}) {
  return (
    <div className="px-3 py-3">
      <div
        role="alert"
        aria-live="polite"
        className="rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-4 py-3"
      >
        <p className="text-sm font-semibold text-(--vaasenk-danger)">
          {MSG.errorTitle}
        </p>
        <p className="mt-1 text-xs text-(--vaasenk-danger)/85">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          className={cn(
            'mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium',
            'bg-white text-(--vaasenk-danger) border border-(--vaasenk-danger)/30',
            'hover:bg-(--vaasenk-danger)/5',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-danger)/40',
            'disabled:cursor-not-allowed disabled:opacity-70',
          )}
        >
          {isRetrying ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          {MSG.errorRetry}
        </button>
      </div>
    </div>
  );
}
