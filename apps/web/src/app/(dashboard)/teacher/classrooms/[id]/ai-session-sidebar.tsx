'use client';

import { MessageSquarePlus, MessagesSquare, Loader2 } from 'lucide-react';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { cn } from '@/lib/utils';

export type ChatSessionListItem = {
  id: string;
  title: string | null;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
};

const MSG = {
  newChat: 'New chat',
  heading: 'Your chats',
  emptyTitle: 'No chats yet',
  emptyDescription: 'Start one to begin asking the syllabus anything.',
  errorTitle: 'Could not load chats',
  errorRetry: 'Retry',
  messageCount: (n: number) => `${n} message${n === 1 ? '' : 's'}`,
} as const;

/**
 * Session history list. Lives in the left rail on desktop, and inside a
 * drawer on mobile (the parent renders this component into either container).
 */
export function AiSessionSidebar({
  sessions,
  loading,
  error,
  creating,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onRetry,
}: {
  sessions: ChatSessionListItem[];
  loading: boolean;
  error: string | null;
  creating: boolean;
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onRetry: () => void;
}) {
  return (
    <aside
      aria-label="Vaasenk AI chat history"
      className={cn(
        'flex h-full min-h-0 flex-col gap-3 rounded-[24px] border border-(--vaasenk-line-sand)',
        'bg-white/72 backdrop-blur-[20px]',
        'shadow-[0_8px_24px_rgba(160,0,0,0.06)]',
        'p-4',
      )}
    >
      <button
        type="button"
        onClick={onNewChat}
        disabled={creating}
        aria-label={MSG.newChat}
        className={cn(
          'group inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white',
          'bg-(image:--gradient-brand-flame)',
          'shadow-[0_8px_24px_rgba(160,0,0,0.18)]',
          'transition-[transform,box-shadow,filter] duration-200 ease-out',
          'hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(160,0,0,0.28)] hover:brightness-[1.04]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30 focus-visible:ring-offset-2 focus-visible:ring-offset-(--vaasenk-warm-canvas)',
          'disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0',
        )}
      >
        {creating ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <MessageSquarePlus className="size-4" aria-hidden />
        )}
        {MSG.newChat}
      </button>

      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-(--vaasenk-deep-maroon)/80">
          {MSG.heading}
        </h2>
        {sessions.length > 0 ? (
          <span className="text-xs text-(--vaasenk-subtle)">
            {sessions.length}
          </span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {loading && sessions.length === 0 ? (
          <ul className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <li
                key={i}
                className="rounded-2xl border border-(--vaasenk-line-sand)/60 bg-white/60 p-3"
              >
                <LoadingSkeleton variant="text" className="w-3/4" />
                <LoadingSkeleton variant="text" className="mt-2 h-3 w-1/2" />
              </li>
            ))}
          </ul>
        ) : null}

        {!loading && error ? (
          <div
            role="alert"
            className="space-y-2 rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 p-3 text-sm text-(--vaasenk-danger)"
          >
            <p className="font-medium">{MSG.errorTitle}</p>
            <p className="text-xs">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-full bg-(--vaasenk-danger)/15 px-3 py-1 text-xs font-semibold transition-colors hover:bg-(--vaasenk-danger)/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-danger)/40"
            >
              {MSG.errorRetry}
            </button>
          </div>
        ) : null}

        {!loading && !error && sessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-(--vaasenk-line-sand) bg-white/60 p-5 text-center">
            <MessagesSquare
              className="mx-auto size-6 text-(--vaasenk-red)"
              aria-hidden
            />
            <p className="mt-2 text-sm font-medium text-(--vaasenk-ink)">
              {MSG.emptyTitle}
            </p>
            <p className="mt-1 text-xs text-(--vaasenk-muted)">
              {MSG.emptyDescription}
            </p>
          </div>
        ) : null}

        {sessions.length > 0 ? (
          <ul className="space-y-2">
            {sessions.map((s) => {
              const isActive = s.id === activeSessionId;
              const title = s.title?.trim() || fallbackTitle(s.createdAt);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onSelectSession(s.id)}
                    aria-current={isActive ? 'true' : undefined}
                    className={cn(
                      'group relative block w-full overflow-hidden rounded-2xl border px-3 py-2.5 text-left transition-all',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30',
                      isActive
                        ? 'border-(--vaasenk-red)/30 bg-white shadow-[0_8px_24px_rgba(160,0,0,0.10)]'
                        : 'border-(--vaasenk-line-sand)/60 bg-white/65 hover:border-(--vaasenk-red)/40 hover:bg-white/85',
                    )}
                  >
                    {isActive ? (
                      <span
                        aria-hidden
                        className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-(image:--gradient-brand-flame)"
                      />
                    ) : null}
                    <p
                      className={cn(
                        'line-clamp-1 text-sm font-semibold',
                        isActive
                          ? 'text-(--vaasenk-deep-maroon)'
                          : 'text-(--vaasenk-ink)',
                      )}
                    >
                      {title}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-(--vaasenk-muted)">
                      {MSG.messageCount(s.messageCount)}
                      {s.lastMessageAt ? (
                        <span className="ml-1.5 text-(--vaasenk-subtle)">
                          · {formatRelative(s.lastMessageAt)}
                        </span>
                      ) : null}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </aside>
  );
}

function fallbackTitle(createdAt: string): string {
  try {
    const d = new Date(createdAt);
    if (Number.isNaN(d.getTime())) return 'New chat';
    return `New chat · ${d.toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
    })}`;
  } catch {
    return 'New chat';
  }
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const diff = Date.now() - d.getTime();
    const min = 60_000;
    const hour = 60 * min;
    const day = 24 * hour;
    if (diff < min) return 'just now';
    if (diff < hour) return `${Math.floor(diff / min)}m`;
    if (diff < day) return `${Math.floor(diff / hour)}h`;
    if (diff < 7 * day) return `${Math.floor(diff / day)}d`;
    return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}
