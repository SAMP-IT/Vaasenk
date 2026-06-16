'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  Loader2,
  MessagesSquare,
  Sparkles,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { VaasenkButton } from '@/components/ui/vaasenk-button';
import { ApiClientError, apiFetch, apiFetchEnvelope } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { AiChatView } from './ai-chat-view';
import {
  AiSessionSidebar,
  type ChatSessionListItem,
} from './ai-session-sidebar';

// -----------------------------------------------------------------------------
// Wire types — kept thin; the chat-view component owns message-level types.
// -----------------------------------------------------------------------------

type ClassroomForAi = {
  id: string;
  name: string;
  subject: { id: string; name: string } | null;
  class: { id: string; name: string } | null;
  section: { id: string; name: string } | null;
  syllabus: { id: string; name: string; status: string } | null;
  aiChatbot: {
    id: string;
    status: string;
    enabledForStudents: boolean;
  } | null;
};

type ServerSession = {
  id: string;
  title: string | null;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
};

// -----------------------------------------------------------------------------
// en-IN copy — extracted to one constant for i18n.
// -----------------------------------------------------------------------------

const MSG = {
  heroEyebrow: 'Vaasenk AI',
  heroTitle: 'Vaasenk AI',
  heroSubtitle: (subject: string, classLabel: string) =>
    `Ask anything about the ${subject} syllabus for ${classLabel}. Cited from the curriculum, never made up.`,
  disclaimer: 'AI can make mistakes. Verify important information.',
  // Status banners
  bannerProcessingTitle: 'Syllabus is still being prepared for AI',
  bannerProcessingBody:
    'This usually takes 1–2 minutes. We will switch chat on the moment indexing finishes.',
  bannerFailedTitle: 'The syllabus could not be processed',
  bannerFailedBody:
    'Ask your admin to reprocess the syllabus from the admin library. Chat is paused until indexing succeeds.',
  bannerFailedGotoAdmin: 'Open admin syllabus library',
  bannerCreditsTitle: 'AI credits exhausted for this institution',
  bannerCreditsBody:
    'Your monthly AI credits are used up. Ask your admin to upgrade the plan or wait until the next cycle.',
  // No syllabus mapped
  noSyllabusTitle: 'No syllabus mapped to this classroom',
  noSyllabusDescription:
    'Ask your admin to map a syllabus. AI features need a syllabus to ground responses.',
  noSyllabusCta: 'Back to notes',
  // History errors
  sessionsErrorTitle: 'Could not load your chats',
  sessionsRetry: 'Retry',
  showHistory: 'Show chat history',
  hideHistory: 'Close chat history',
  newChatFailed: 'Could not start a new chat.',
  // Disabled-input reasons
  disabledForSyllabus:
    'Vaasenk AI is paused while the syllabus finishes indexing.',
  disabledForCredits:
    'Vaasenk AI is paused — your institution is out of AI credits.',
} as const;

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export type AiAssistantTabProps = {
  classroomId: string;
  classroom: ClassroomForAi;
  /**
   * Lets the parent tab strip switch the active tab — used by the
   * "Back to notes" CTA in the no-syllabus empty state.
   */
  onSwitchTab?: (tab: 'NOTES') => void;
};

export function AiAssistantTab({
  classroomId,
  classroom,
  onSwitchTab,
}: AiAssistantTabProps) {
  const syllabusStatus = classroom.syllabus?.status ?? null;
  const hasSyllabus = Boolean(classroom.syllabus);
  const aiReady = syllabusStatus === 'AI_READY';

  // -------------------------------------------------------------------------
  // Sessions list
  // -------------------------------------------------------------------------
  const [sessions, setSessions] = useState<ChatSessionListItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [creditsExhausted, setCreditsExhausted] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Mobile drawer for the history rail.
  const [historyOpen, setHistoryOpen] = useState(false);

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const res = await apiFetchEnvelope<ServerSession[]>(
        `/api/v1/classrooms/${classroomId}/ai/sessions?page=1&limit=50`,
      );
      const rows: ChatSessionListItem[] = (res.data ?? []).map((s) => ({
        id: s.id,
        title: s.title,
        messageCount: s.messageCount,
        lastMessageAt: s.lastMessageAt,
        createdAt: s.createdAt,
      }));
      setSessions(rows);
      setActiveSessionId((current) => {
        if (current && rows.some((r) => r.id === current)) return current;
        return rows[0]?.id ?? null;
      });
    } catch (err) {
      setSessionsError(
        err instanceof Error
          ? err.message
          : 'Network error while loading chats.',
      );
    } finally {
      setSessionsLoading(false);
    }
  }, [classroomId]);

  useEffect(() => {
    if (aiReady) {
      fetchSessions();
    } else {
      // Skip fetching while the syllabus isn't ready — there are no sessions
      // to talk about, and the backend would refuse anyway.
      setSessionsLoading(false);
    }
  }, [aiReady, fetchSessions]);

  // -------------------------------------------------------------------------
  // New chat
  // -------------------------------------------------------------------------
  const handleNewChat = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await apiFetch<{ session: ServerSession }>(
        `/api/v1/classrooms/${classroomId}/ai/sessions`,
        { method: 'POST', body: {} },
      );
      const created: ChatSessionListItem = {
        id: res.session.id,
        title: res.session.title,
        messageCount: res.session.messageCount,
        lastMessageAt: res.session.lastMessageAt,
        createdAt: res.session.createdAt,
      };
      setSessions((prev) => [created, ...prev]);
      setActiveSessionId(created.id);
      setHistoryOpen(false);
    } catch (err) {
      // 402 = AI credits exhausted (from the API contract).
      // 412 = syllabus not ready — shouldn't happen here since we gate the
      //       CTA on aiReady, but handle defensively.
      if (err instanceof ApiClientError) {
        if (err.status === 402) {
          setCreditsExhausted(true);
          setCreateError(err.message || MSG.bannerCreditsBody);
        } else {
          setCreateError(err.message || MSG.newChatFailed);
        }
      } else {
        setCreateError(
          err instanceof Error ? err.message : MSG.newChatFailed,
        );
      }
    } finally {
      setCreating(false);
    }
  }, [classroomId, creating]);

  // -------------------------------------------------------------------------
  // Refresh sessions whenever a message finishes (count + lastMessageAt).
  // -------------------------------------------------------------------------
  const handleSessionTouched = useCallback(() => {
    if (!aiReady) return;
    fetchSessions();
  }, [aiReady, fetchSessions]);

  const handleSelectSession = useCallback((id: string) => {
    setActiveSessionId(id);
    setHistoryOpen(false);
  }, []);

  // -------------------------------------------------------------------------
  // Derived strings
  // -------------------------------------------------------------------------
  const subjectLabel = classroom.subject?.name ?? 'this classroom';
  const classroomLabel = useMemo(() => {
    const bits: string[] = [];
    if (classroom.class?.name) bits.push(classroom.class.name);
    if (classroom.section?.name) bits.push(classroom.section.name);
    if (bits.length === 0) return classroom.name;
    return bits.join(' · ');
  }, [classroom.class, classroom.section, classroom.name]);

  const disabledReason = useMemo(() => {
    if (creditsExhausted) return MSG.disabledForCredits;
    if (!aiReady) return MSG.disabledForSyllabus;
    return undefined;
  }, [creditsExhausted, aiReady]);

  // -------------------------------------------------------------------------
  // Render — short-circuit on "no syllabus mapped".
  // -------------------------------------------------------------------------
  if (!hasSyllabus) {
    return (
      <EmptyState
        icon={<MessagesSquare className="size-7" />}
        title={MSG.noSyllabusTitle}
        description={MSG.noSyllabusDescription}
        action={{
          label: MSG.noSyllabusCta,
          onClick: () => onSwitchTab?.('NOTES'),
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Hero — Deep AI Glow */}
      <section
        className={cn(
          'relative overflow-hidden rounded-[28px] p-6 text-white sm:p-7',
          'bg-(image:--gradient-deep-ai-glow)',
          'shadow-[0_24px_60px_rgba(90,0,19,0.30)]',
        )}
        aria-labelledby="ai-hero-title"
      >
        <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 max-w-2xl items-start gap-3">
            <div
              aria-hidden
              className={cn(
                'mt-1 grid size-11 shrink-0 place-items-center rounded-2xl',
                'bg-(--vaasenk-gold)/20 text-(--vaasenk-gold)',
                'shadow-[inset_0_0_0_1px_rgba(254,202,2,0.30)]',
              )}
            >
              <Sparkles className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-white/70">
                {MSG.heroEyebrow}
              </p>
              <h2
                id="ai-hero-title"
                className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl"
              >
                {MSG.heroTitle}
              </h2>
              <p className="mt-2 text-sm text-white/85 sm:text-base">
                {MSG.heroSubtitle(subjectLabel, classroomLabel)}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
            <span
              className={cn(
                'inline-flex max-w-xs items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur',
                'border-white/25 bg-white/15 text-white/90',
              )}
            >
              <Info className="size-3.5 shrink-0" aria-hidden />
              <span className="line-clamp-2 text-left md:text-right">
                {MSG.disclaimer}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              aria-label={MSG.showHistory}
              className={cn(
                'inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition-colors',
                'hover:bg-white/25',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
                'lg:hidden',
              )}
            >
              <MessagesSquare className="size-3.5" aria-hidden />
              Chats ({sessions.length})
            </button>
          </div>
        </div>

        {/* Decorative blobs */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-(--vaasenk-gold)/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 -left-10 size-64 rounded-full bg-(--vaasenk-deep-maroon)/40 blur-3xl"
        />
      </section>

      {/* Status banners */}
      {syllabusStatus === 'PROCESSING' || syllabusStatus === 'UPLOADED' ? (
        <StatusBanner
          tone="warning"
          icon={<Loader2 className="size-4 animate-spin" aria-hidden />}
          title={MSG.bannerProcessingTitle}
          description={MSG.bannerProcessingBody}
        />
      ) : null}
      {syllabusStatus === 'FAILED' ? (
        <StatusBanner
          tone="danger"
          icon={<AlertTriangle className="size-4" aria-hidden />}
          title={MSG.bannerFailedTitle}
          description={MSG.bannerFailedBody}
          action={{ href: '/admin/syllabus', label: MSG.bannerFailedGotoAdmin }}
        />
      ) : null}
      {creditsExhausted ? (
        <StatusBanner
          tone="danger"
          icon={<AlertCircle className="size-4" aria-hidden />}
          title={MSG.bannerCreditsTitle}
          description={MSG.bannerCreditsBody}
        />
      ) : null}
      {createError && !creditsExhausted ? (
        <StatusBanner
          tone="danger"
          icon={<AlertCircle className="size-4" aria-hidden />}
          title={MSG.newChatFailed}
          description={createError}
        />
      ) : null}

      {/* Two-column layout */}
      <div className="grid min-h-[600px] grid-cols-1 gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Desktop sidebar */}
        <div className="hidden min-h-[600px] lg:block">
          <AiSessionSidebar
            sessions={sessions}
            loading={sessionsLoading}
            error={sessionsError}
            creating={creating}
            activeSessionId={activeSessionId}
            onSelectSession={handleSelectSession}
            onNewChat={handleNewChat}
            onRetry={fetchSessions}
          />
        </div>

        {/* Mobile drawer */}
        <Dialog.Root open={historyOpen} onOpenChange={setHistoryOpen}>
          <Dialog.Portal>
            <Dialog.Overlay
              className={cn(
                'fixed inset-0 z-40 bg-(--vaasenk-deep-maroon)/30 backdrop-blur-sm',
                'data-[state=open]:animate-in data-[state=open]:fade-in-0',
                'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
                'lg:hidden',
              )}
            />
            <Dialog.Content
              className={cn(
                'fixed inset-y-0 left-0 z-50 flex w-[88%] max-w-sm flex-col p-3',
                'bg-(image:--gradient-cream-sunrise)',
                'border-r border-(--vaasenk-line-sand)',
                'shadow-[0_32px_90px_rgba(160,0,0,0.18)] focus:outline-none',
                'data-[state=open]:animate-in data-[state=open]:slide-in-from-left',
                'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left',
                'lg:hidden',
              )}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <Dialog.Title className="text-sm font-semibold text-(--vaasenk-ink)">
                  Chat history
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label={MSG.hideHistory}
                    className="inline-flex size-9 items-center justify-center rounded-full border border-(--vaasenk-line-sand) bg-white/80 text-(--vaasenk-deep-maroon) transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30"
                  >
                    <X className="size-4" />
                  </button>
                </Dialog.Close>
              </div>
              <div className="min-h-0 flex-1">
                <AiSessionSidebar
                  sessions={sessions}
                  loading={sessionsLoading}
                  error={sessionsError}
                  creating={creating}
                  activeSessionId={activeSessionId}
                  onSelectSession={handleSelectSession}
                  onNewChat={handleNewChat}
                  onRetry={fetchSessions}
                />
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {/* Active chat column */}
        <div className="min-h-[600px]">
          {!aiReady ? (
            <AiInactivePlaceholder
              status={syllabusStatus}
              syllabusName={classroom.syllabus?.name ?? null}
            />
          ) : sessionsLoading && !activeSessionId ? (
            <AiInactivePlaceholder status="LOADING" syllabusName={null} />
          ) : activeSessionId ? (
            <AiChatView
              key={activeSessionId}
              classroomId={classroomId}
              sessionId={activeSessionId}
              disabledReason={disabledReason}
              onSessionTouched={handleSessionTouched}
            />
          ) : (
            <NoActiveSessionCard
              onNewChat={handleNewChat}
              creating={creating}
              error={sessionsError}
              onRetry={fetchSessions}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Small helpers — local to this tab so the file stays one-stop.
// -----------------------------------------------------------------------------

function StatusBanner({
  tone,
  icon,
  title,
  description,
  action,
}: {
  tone: 'warning' | 'danger';
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: { href: string; label: string };
}) {
  const toneClasses =
    tone === 'warning'
      ? 'border-(--vaasenk-warning)/30 bg-(--vaasenk-warning)/10 text-(--vaasenk-deep-maroon)'
      : 'border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 text-(--vaasenk-danger)';
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      aria-live="polite"
      className={cn(
        'flex flex-col gap-2 rounded-2xl border px-4 py-3 text-sm sm:flex-row sm:items-start sm:justify-between',
        toneClasses,
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          <p className="mt-0.5 text-xs opacity-90 sm:text-sm">{description}</p>
        </div>
      </div>
      {action ? (
        <a
          href={action.href}
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold',
            tone === 'warning'
              ? 'bg-(--vaasenk-warning)/20 hover:bg-(--vaasenk-warning)/30'
              : 'bg-(--vaasenk-danger)/15 hover:bg-(--vaasenk-danger)/25',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30',
          )}
        >
          {action.label}
        </a>
      ) : null}
    </div>
  );
}

function AiInactivePlaceholder({
  status,
  syllabusName,
}: {
  status: string | null;
  syllabusName: string | null;
}) {
  const copy = (() => {
    switch (status) {
      case 'UPLOADED':
      case 'PROCESSING':
        return {
          title: 'Indexing your syllabus',
          body: syllabusName
            ? `“${syllabusName}” is being read and embedded. Chat opens automatically once it’s ready.`
            : 'Your syllabus is being read and embedded. Chat opens automatically once it’s ready.',
        };
      case 'FAILED':
        return {
          title: 'Syllabus indexing failed',
          body: 'Ask your institution admin to reprocess this syllabus from /admin/syllabus.',
        };
      case 'LOADING':
        return {
          title: 'Loading your chats…',
          body: 'Just a moment while we fetch your AI history.',
        };
      default:
        return {
          title: 'Vaasenk AI is paused',
          body: 'Chat will open once the syllabus is fully indexed.',
        };
    }
  })();

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex h-full min-h-[420px] flex-col items-center justify-center gap-4 rounded-[24px] border border-dashed border-(--vaasenk-line-sand)',
        'bg-white/50 p-8 text-center backdrop-blur-[20px]',
      )}
    >
      <div
        aria-hidden
        className="grid size-14 place-items-center rounded-2xl bg-(image:--gradient-deep-ai-glow) text-(--vaasenk-gold) shadow-[0_18px_50px_rgba(74,5,8,0.22)]"
      >
        <Sparkles className="size-6" />
      </div>
      <div className="max-w-sm">
        <h3 className="text-lg font-semibold text-(--vaasenk-ink)">
          {copy.title}
        </h3>
        <p className="mt-1 text-sm text-(--vaasenk-muted)">{copy.body}</p>
      </div>
    </div>
  );
}

function NoActiveSessionCard({
  onNewChat,
  creating,
  error,
  onRetry,
}: {
  onNewChat: () => void;
  creating: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <div
      className={cn(
        'flex h-full min-h-[420px] flex-col items-center justify-center gap-4 rounded-[24px] border border-(--vaasenk-line-sand)',
        'bg-white/72 p-8 text-center backdrop-blur-[20px] shadow-[0_8px_24px_rgba(160,0,0,0.06)]',
      )}
    >
      <div
        aria-hidden
        className="grid size-14 place-items-center rounded-2xl bg-(image:--gradient-deep-ai-glow) text-(--vaasenk-gold) shadow-[0_18px_50px_rgba(74,5,8,0.22)]"
      >
        <Sparkles className="size-6" />
      </div>
      <div className="max-w-sm">
        <h3 className="text-lg font-semibold text-(--vaasenk-ink)">
          Start your first chat
        </h3>
        <p className="mt-1 text-sm text-(--vaasenk-muted)">
          Ask anything from this classroom’s syllabus — Vaasenk AI replies with
          chapter and topic citations.
        </p>
      </div>
      {error ? (
        <div
          role="alert"
          className="w-full max-w-sm rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-3 py-2 text-xs text-(--vaasenk-danger)"
        >
          <p className="font-semibold">{MSG.sessionsErrorTitle}</p>
          <p>{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 rounded-full bg-(--vaasenk-danger)/15 px-3 py-1 font-semibold transition-colors hover:bg-(--vaasenk-danger)/25"
          >
            {MSG.sessionsRetry}
          </button>
        </div>
      ) : null}
      <VaasenkButton
        variant="primary"
        size="md"
        onClick={onNewChat}
        disabled={creating}
      >
        {creating ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Creating…
          </>
        ) : (
          <>
            <Sparkles className="size-4" aria-hidden />
            New chat
          </>
        )}
      </VaasenkButton>
    </div>
  );
}
