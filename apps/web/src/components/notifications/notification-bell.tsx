'use client';

/**
 * NotificationBell — Sprint 6.2.
 *
 * Sits in the dashboard topbar. Composes Radix's DropdownMenu (the same
 * primitive used by the teachers admin table — see `teachers-client.tsx`)
 * with the {@link useNotifications} hook for state and the
 * {@link NotificationCenter} component for the dropdown body.
 *
 * Visual states (per CLAUDE.md §5):
 *   • Default     — bell + gold dot when unread > 0
 *   • Loading     — bell with a subtle pulse on the dot tile (no count yet)
 *   • Empty       — bell, no badge, no extra decoration
 *   • Error       — bell with a Vaasenk-Red ring + Error tooltip
 *   • Disconnected — bell with muted/desaturated badge + tooltip explaining
 *
 * Accessibility:
 *   • `aria-label` updates dynamically with the unread count.
 *   • `aria-expanded` is driven by Radix's open state.
 *   • Pulse animation only fires when a fresh notification arrives — not
 *     on every state churn — and respects prefers-reduced-motion.
 */

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Bell, BellOff } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/lib/notifications/use-notifications';
import { NotificationCenter } from './notification-center';

const MSG = {
  baseLabel: 'Notifications',
  unreadLabel: (n: number) =>
    `Notifications, ${n} unread`,
  loadingLabel: 'Notifications, loading',
  errorLabel: 'Notifications, couldn’t load',
  disconnectedLabel: 'Notifications, reconnecting',
} as const;

export function NotificationBell() {
  const [open, setOpen] = React.useState(false);
  const notifications = useNotifications();

  // Track the previous unread total so we can pulse the badge ONLY on a
  // fresh increment, not every render. The pulse class is cleared via a
  // setTimeout to match the keyframes duration.
  const [pulse, setPulse] = React.useState(false);
  const previousUnreadRef = React.useRef(notifications.unreadTotal);
  React.useEffect(() => {
    if (notifications.unreadTotal > previousUnreadRef.current) {
      setPulse(true);
      const t = window.setTimeout(() => setPulse(false), 1600);
      previousUnreadRef.current = notifications.unreadTotal;
      return () => window.clearTimeout(t);
    }
    previousUnreadRef.current = notifications.unreadTotal;
    return undefined;
  }, [notifications.unreadTotal]);

  const unreadDisplay =
    notifications.unreadTotal > 9 ? '9+' : String(notifications.unreadTotal);
  const hasUnread = notifications.unreadTotal > 0;
  const isError = notifications.error !== null;
  const isDisconnected =
    !notifications.isLoading &&
    !notifications.isConnected &&
    notifications.connectionState !== 'idle' &&
    notifications.connectionState !== 'connecting';

  const ariaLabel = (() => {
    if (isError) return MSG.errorLabel;
    if (notifications.isLoading && !hasUnread) return MSG.loadingLabel;
    if (isDisconnected) return MSG.disconnectedLabel;
    if (hasUnread) return MSG.unreadLabel(notifications.unreadTotal);
    return MSG.baseLabel;
  })();

  // Tooltip-via-title for hover hints. Radix Tooltip would be heavier than
  // needed here — the title attribute is sufficient for an icon button.
  const title = (() => {
    if (isError) return 'Couldn’t load notifications. Click to retry.';
    if (isDisconnected) return 'Reconnecting to live updates…';
    return MSG.baseLabel;
  })();

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          title={title}
          // Matches the prior placeholder bell at layout.tsx:113-123 so
          // the topbar visually doesn't shift when we drop this in.
          className={cn(
            'relative grid size-10 place-items-center rounded-full border bg-white/80 text-(--vaasenk-deep-maroon) transition-colors',
            'hover:bg-white',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/40 focus-visible:ring-offset-2 focus-visible:ring-offset-(--vaasenk-warm-canvas)',
            isError
              ? 'border-(--vaasenk-danger)/40'
              : 'border-(--vaasenk-line-sand)',
          )}
        >
          {isDisconnected ? (
            <BellOff className="size-4" />
          ) : (
            <Bell className="size-4" />
          )}

          {/* ---- Badge ----------------------------------------------- */}

          {isError ? (
            // Error state: small red dot, no count
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-(--vaasenk-danger) ring-2 ring-white"
            />
          ) : hasUnread ? (
            <span
              aria-hidden
              className={cn(
                'absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ring-2 ring-white',
                // Disconnected: gray; connected with unread: brand-flame
                // gradient + white text per CLAUDE.md §4 (red+gold tasteful).
                isDisconnected
                  ? 'bg-(--vaasenk-muted)/80 text-white'
                  : 'bg-linear-to-br from-vaasenk-red to-vaasenk-sunrise-orange text-white',
                pulse && 'animate-[vaasenk-bell-pulse_1.4s_ease-out_1]',
              )}
            >
              {unreadDisplay}
            </span>
          ) : notifications.isLoading ? (
            // Loading hint while we haven't received the first count yet —
            // a small pulsing gold dot to signal activity.
            <span
              aria-hidden
              className="absolute right-2 top-2 size-2 rounded-full bg-(--vaasenk-gold)/80 animate-pulse"
            />
          ) : null}

          {/* Pulse keyframes — scoped local style so we don't pollute the
              global stylesheet. Respects prefers-reduced-motion via the
              media query inside. */}
          <style>{`
            @keyframes vaasenk-bell-pulse {
              0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(160,0,0,0.45); }
              60% { transform: scale(1.12); box-shadow: 0 0 0 8px rgba(160,0,0,0); }
              100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(160,0,0,0); }
            }
            @media (prefers-reduced-motion: reduce) {
              [class*="vaasenk-bell-pulse"] { animation: none !important; }
            }
          `}</style>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={10}
          collisionPadding={12}
          // Width matches the design-doc 360px desktop spec; on small
          // viewports we let it grow with collisionPadding doing the work.
          className={cn(
            'z-50 w-[min(360px,calc(100vw-1.5rem))] overflow-hidden',
            'rounded-[24px] border border-(--vaasenk-line-sand) bg-white/95',
            'shadow-[0_24px_64px_rgba(74,5,8,0.18)] backdrop-blur-xl',
            'p-0',
            // Radix open/close transitions — keep them subtle.
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          )}
        >
          <NotificationCenter
            notifications={notifications.notifications}
            unreadTotal={notifications.unreadTotal}
            isLoading={notifications.isLoading}
            error={notifications.error}
            isConnected={notifications.isConnected}
            onMarkRead={notifications.markRead}
            onMarkAllRead={notifications.markAllRead}
            onRetry={notifications.refetch}
            onItemSelected={() => setOpen(false)}
          />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
