'use client';

import {
  AlertCircle,
  ChevronDown,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  StopCircle,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { apiFetch } from '@/lib/api-client';
import { streamAiChat, type Citation } from '@/lib/ai-chat-stream';
import { cn } from '@/lib/utils';
import { AiChatMessageBubble, type AiChatMessage } from './ai-chat-message';

// -----------------------------------------------------------------------------
// Wire types — match the backend AI chat module envelope.
// -----------------------------------------------------------------------------

type ServerChatMessage = {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  citations?: Citation[];
  createdAt: string;
};

type ServerChatSession = {
  id: string;
  title: string | null;
  messageCount: number;
  createdAt: string;
};

type SessionDetailResponse = {
  session: ServerChatSession;
  messages: ServerChatMessage[];
};

// -----------------------------------------------------------------------------
// Strings (en-IN). Extracted for future ta-IN translation per SKILL §11.
// -----------------------------------------------------------------------------

const MSG = {
  inputPlaceholder: 'Ask Vaasenk AI…',
  send: 'Send message',
  stop: 'Stop generating',
  disabledSyllabus:
    'Chat is paused while the syllabus is being prepared for AI.',
  disabledStreaming: 'Wait for the response to finish before sending again.',
  emptyTitle: 'Ask anything from the syllabus',
  emptyDescription:
    'Vaasenk AI answers only from this classroom’s syllabus, with chapter and topic citations. Pick a quick prompt below or type your own question.',
  loadingTitle: 'Loading chat…',
  errorTitle: 'Couldn’t load this chat',
  errorRetry: 'Retry',
  retry: 'Try again',
  scrollToLatest: 'Jump to latest',
  thinkingSteps: [
    'Reading syllabus…',
    'Finding relevant content…',
    'Generating response…',
  ] as const,
  messageCount: (n: number) => `${n} message${n === 1 ? '' : 's'}`,
  defaultTitle: 'Vaasenk AI session',
} as const;

const QUICK_PROMPTS: { label: string; prompt: string }[] = [
  {
    label: 'Summary',
    prompt:
      'Summarise the key concepts from the current chapter in 5 bullet points.',
  },
  {
    label: 'Important questions',
    prompt:
      'List 8 important questions from the current chapter, grouped by mark weight (2-mark, 5-mark, 10-mark).',
  },
  {
    label: 'Lesson plan',
    prompt:
      'Draft a 40-minute lesson plan for the next class — include warm-up, core teaching, examples, and a wrap-up activity.',
  },
  {
    label: 'Quiz',
    prompt:
      'Generate a 10-question quick quiz (MCQ + short answer) covering the current chapter. Include an answer key at the end.',
  },
  {
    label: 'Explain simply',
    prompt:
      'Explain the most difficult topic in this chapter in simple language suitable for a Class 10 student.',
  },
];

const MAX_INPUT_LENGTH = 4000;

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function AiChatView({
  classroomId,
  sessionId,
  disabledReason,
  onSessionTouched,
}: {
  classroomId: string;
  sessionId: string;
  /** When set, the input is disabled and the reason is surfaced. */
  disabledReason?: string;
  /**
   * Notify the parent whenever a message round-trips so the sessions list
   * can refresh count + lastMessageAt.
   */
  onSessionTouched?: () => void;
}) {
  const [session, setSession] = useState<ServerChatSession | null>(null);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [thinkingStep, setThinkingStep] = useState(0);
  const [showThinking, setShowThinking] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);
  // Track the in-flight assistant message id so we can reconcile error /
  // abort updates without searching the whole array on every token.
  const inFlightAssistantIdRef = useRef<string | null>(null);

  // ---------- Load session detail -----------------------------------------
  const fetchSession = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiFetch<SessionDetailResponse>(
        `/api/v1/classrooms/${classroomId}/ai/sessions/${sessionId}`,
      );
      setSession(res.session);
      setMessages(
        res.messages.map<AiChatMessage>((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          citations: m.citations ?? [],
          status: 'complete',
          createdAt: m.createdAt,
        })),
      );
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : 'Could not load this chat. Try again.',
      );
      setSession(null);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [classroomId, sessionId]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // Cancel any in-flight stream when the session changes or the component
  // unmounts. The stream uses an AbortController so this cleanup is enough.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, [sessionId]);

  // ---------- Auto-scroll behaviour --------------------------------------
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    // Stick to bottom unless the user has scrolled up — gives them control
    // during long streams without ripping them away on every token.
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 96;
    if (nearBottom) {
      el.scrollTop = el.scrollHeight;
      setShowScrollHint(false);
    } else {
      setShowScrollHint(true);
    }
  }, [messages]);

  const handleScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 96;
    setShowScrollHint(!nearBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  // ---------- Thinking step ticker ----------------------------------------
  useEffect(() => {
    if (!showThinking) return;
    const id = window.setInterval(() => {
      setThinkingStep((s) => (s + 1) % MSG.thinkingSteps.length);
    }, 700);
    return () => window.clearInterval(id);
  }, [showThinking]);

  // ---------- Send ---------------------------------------------------------
  const submitDisabled =
    streaming ||
    Boolean(disabledReason) ||
    input.trim().length === 0 ||
    input.length > MAX_INPUT_LENGTH;

  const sendMessage = useCallback(async () => {
    const content = input.trim();
    if (!content) return;
    if (content.length > MAX_INPUT_LENGTH) return;
    if (streaming || disabledReason) return;

    const userId = `tmp-user-${crypto.randomUUID()}`;
    const assistantId = `tmp-ai-${crypto.randomUUID()}`;
    inFlightAssistantIdRef.current = assistantId;

    // Optimistic update — append user + skeleton assistant bubble.
    setMessages((prev) => [
      ...prev,
      {
        id: userId,
        role: 'USER',
        content,
        citations: [],
        status: 'sending',
      },
      {
        id: assistantId,
        role: 'ASSISTANT',
        content: '',
        citations: [],
        status: 'streaming',
      },
    ]);
    setInput('');
    setStreaming(true);
    setShowThinking(true);
    setThinkingStep(0);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      for await (const event of streamAiChat({
        classroomId,
        sessionId,
        content,
        signal: ac.signal,
      })) {
        if (event.type === 'token') {
          setShowThinking(false);
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id === userId && m.status === 'sending') {
                return { ...m, status: 'complete' };
              }
              if (m.id === assistantId) {
                return { ...m, content: m.content + event.content };
              }
              return m;
            }),
          );
        } else if (event.type === 'usage') {
          setShowThinking(false);
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id === userId && m.status === 'sending') {
                return { ...m, status: 'complete' };
              }
              if (m.id === assistantId) {
                return {
                  ...m,
                  status: 'complete',
                  citations: event.citations ?? [],
                };
              }
              return m;
            }),
          );
        } else if (event.type === 'error') {
          setShowThinking(false);
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id === userId && m.status === 'sending') {
                return { ...m, status: 'complete' };
              }
              if (m.id === assistantId) {
                return {
                  ...m,
                  status: 'error',
                  errorMessage: event.message,
                };
              }
              return m;
            }),
          );
        }
      }
    } catch (err) {
      const aborted = (err as { name?: string })?.name === 'AbortError';
      setShowThinking(false);
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === userId && m.status === 'sending') {
            return { ...m, status: 'complete' };
          }
          if (m.id === assistantId) {
            if (aborted) {
              return {
                ...m,
                status: m.content ? 'aborted' : 'aborted',
              };
            }
            return {
              ...m,
              status: 'error',
              errorMessage:
                err instanceof Error
                  ? err.message
                  : 'Stream interrupted.',
            };
          }
          return m;
        }),
      );
    } finally {
      setStreaming(false);
      setShowThinking(false);
      inFlightAssistantIdRef.current = null;
      abortRef.current = null;
      onSessionTouched?.();
      // Refocus the input so the teacher can keep typing.
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [classroomId, sessionId, input, streaming, disabledReason, onSessionTouched]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ---------- Quick prompts -----------------------------------------------
  const applyQuickPrompt = useCallback((prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
    // Move caret to the end so the teacher can extend it.
    window.setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }, 0);
  }, []);

  // ---------- Auto-grow the textarea --------------------------------------
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      const el = e.target;
      el.style.height = 'auto';
      // 6 lines @ ~24px line-height ≈ 144px. Then scroll inside the textarea.
      const max = 6 * 24 + 24;
      el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    },
    [],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        if (!submitDisabled) void sendMessage();
      }
    },
    [submitDisabled, sendMessage],
  );

  const charCountState = useMemo(() => {
    const remaining = MAX_INPUT_LENGTH - input.length;
    return {
      remaining,
      isWarn: remaining < 300 && remaining >= 0,
      isOver: remaining < 0,
    };
  }, [input.length]);

  // ---------- Render -------------------------------------------------------
  if (loading) {
    return <ChatViewSkeleton />;
  }

  if (loadError) {
    return (
      <div
        role="alert"
        className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 rounded-[24px] border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 p-8 text-center"
      >
        <AlertCircle className="size-7 text-(--vaasenk-danger)" aria-hidden />
        <p className="text-base font-semibold text-(--vaasenk-danger)">
          {MSG.errorTitle}
        </p>
        <p className="max-w-md text-sm text-(--vaasenk-danger)/85">
          {loadError}
        </p>
        <button
          type="button"
          onClick={fetchSession}
          className="mt-2 rounded-full bg-(--vaasenk-danger)/15 px-4 py-2 text-sm font-semibold text-(--vaasenk-danger) transition-colors hover:bg-(--vaasenk-danger)/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-danger)/40"
        >
          {MSG.errorRetry}
        </button>
      </div>
    );
  }

  const title = session?.title?.trim() || MSG.defaultTitle;
  const messageCountForHeader = session
    ? Math.max(session.messageCount, messages.filter((m) => m.status === 'complete').length)
    : messages.length;

  return (
    <section
      aria-label="Vaasenk AI chat"
      className={cn(
        'relative flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border border-(--vaasenk-line-sand)',
        'bg-white/72 backdrop-blur-[20px]',
        'shadow-[0_8px_24px_rgba(160,0,0,0.06)]',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-(--vaasenk-line-sand)/60 px-5 py-3">
        <div className="min-w-0">
          <p className="line-clamp-1 text-sm font-semibold text-(--vaasenk-ink)">
            {title}
          </p>
          <p className="text-xs text-(--vaasenk-muted)">
            {MSG.messageCount(messageCountForHeader)}
          </p>
        </div>
        {streaming ? (
          <span
            role="status"
            aria-live="polite"
            className="inline-flex items-center gap-1.5 rounded-full bg-(--vaasenk-rose-wash) px-3 py-1 text-xs font-semibold text-(--vaasenk-deep-maroon)"
          >
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Streaming
          </span>
        ) : null}
      </div>

      {/* Message thread */}
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="relative min-h-[360px] flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6"
      >
        {messages.length === 0 ? (
          <EmptyChatHint
            quickPrompts={QUICK_PROMPTS}
            onPick={applyQuickPrompt}
            disabled={Boolean(disabledReason)}
          />
        ) : (
          messages.map((m, idx) => (
            <AiChatMessageBubble
              key={m.id}
              message={m}
              onRetry={
                m.status === 'error' && idx === messages.length - 1
                  ? () => {
                      // Drop the failed assistant + paired user bubble, restore
                      // input to the user's last question, let them re-send.
                      setMessages((prev) =>
                        prev.filter((_, i) => i < prev.length - 2),
                      );
                      const lastUser = [...messages]
                        .reverse()
                        .find((mm) => mm.role === 'USER');
                      if (lastUser) setInput(lastUser.content);
                      window.setTimeout(() => inputRef.current?.focus(), 0);
                    }
                  : undefined
              }
            />
          ))
        )}

        {showThinking ? (
          <ThinkingSteps step={thinkingStep} />
        ) : null}

        {showScrollHint ? (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label={MSG.scrollToLatest}
            className="sticky bottom-2 ml-auto inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-(--vaasenk-deep-maroon) shadow-[0_8px_24px_rgba(160,0,0,0.10)] backdrop-blur transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30"
          >
            <ChevronDown className="size-3.5" aria-hidden />
            Jump to latest
          </button>
        ) : null}
      </div>

      {/* Composer */}
      <div className="border-t border-(--vaasenk-line-sand)/60 bg-white/60 p-4 sm:p-5">
        {/* Quick prompt chips */}
        {messages.length > 0 ? (
          <div className="mb-3 -mx-1 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyQuickPrompt(p.prompt)}
                disabled={Boolean(disabledReason)}
                aria-label={`Insert prompt: ${p.label}`}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                  'border-(--vaasenk-line-sand) bg-white/80 text-(--vaasenk-deep-maroon)',
                  'hover:border-(--vaasenk-red)/40 hover:bg-white',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30',
                  'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-(--vaasenk-line-sand) disabled:hover:bg-white/80',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        ) : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage();
          }}
          className="flex flex-col gap-2"
        >
          <div
            className={cn(
              'flex items-end gap-2 rounded-[22px] border bg-white/85 p-2 transition-shadow',
              'focus-within:border-(--vaasenk-red) focus-within:shadow-[0_0_0_3px_rgba(160,0,0,0.18)]',
              charCountState.isOver
                ? 'border-(--vaasenk-danger)'
                : 'border-(--vaasenk-line-sand)',
              disabledReason ? 'opacity-70' : '',
            )}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              rows={1}
              aria-label={MSG.inputPlaceholder}
              aria-keyshortcuts="Enter"
              aria-describedby={
                disabledReason
                  ? 'ai-input-disabled-reason'
                  : streaming
                    ? 'ai-input-streaming-reason'
                    : undefined
              }
              placeholder={MSG.inputPlaceholder}
              disabled={Boolean(disabledReason)}
              maxLength={MAX_INPUT_LENGTH + 200 /* allow over-typing for UX */}
              className={cn(
                'min-h-[44px] flex-1 resize-none border-0 bg-transparent px-3 py-2 text-sm leading-6 text-(--vaasenk-ink) outline-none',
                'placeholder:text-(--vaasenk-subtle)',
                'disabled:cursor-not-allowed',
              )}
            />
            {streaming ? (
              <button
                type="button"
                onClick={handleStop}
                aria-label={MSG.stop}
                className={cn(
                  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-full px-4',
                  'border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 text-(--vaasenk-danger)',
                  'transition-colors hover:bg-(--vaasenk-danger)/20',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-danger)/40',
                )}
              >
                <StopCircle className="size-4" aria-hidden />
                <span className="hidden sm:inline text-sm font-semibold">
                  Stop
                </span>
              </button>
            ) : (
              <button
                type="submit"
                aria-label={MSG.send}
                aria-keyshortcuts="Enter"
                disabled={submitDisabled}
                className={cn(
                  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold text-white',
                  'bg-(image:--gradient-brand-flame)',
                  'shadow-[0_8px_24px_rgba(160,0,0,0.18)]',
                  'transition-[transform,box-shadow,filter] duration-200 ease-out',
                  'hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(160,0,0,0.28)] hover:brightness-[1.04]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30 focus-visible:ring-offset-2 focus-visible:ring-offset-(--vaasenk-warm-canvas)',
                  'disabled:pointer-events-none disabled:opacity-50',
                )}
              >
                <Send className="size-4" aria-hidden />
                <span className="hidden sm:inline">Send</span>
              </button>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 px-1 text-[11px]">
            <p className="text-(--vaasenk-subtle)">
              <span className="font-semibold text-(--vaasenk-deep-maroon)">
                Enter
              </span>{' '}
              to send · <span className="font-semibold">Shift + Enter</span> for
              a new line
            </p>
            <p
              className={cn(
                'tabular-nums',
                charCountState.isOver
                  ? 'font-semibold text-(--vaasenk-danger)'
                  : charCountState.isWarn
                    ? 'text-(--vaasenk-warning)'
                    : 'text-(--vaasenk-subtle)',
              )}
            >
              {input.length} / {MAX_INPUT_LENGTH}
            </p>
          </div>
          {disabledReason ? (
            <p
              id="ai-input-disabled-reason"
              className="rounded-2xl border border-(--vaasenk-warning)/30 bg-(--vaasenk-warning)/10 px-3 py-2 text-xs text-(--vaasenk-deep-maroon)"
            >
              {disabledReason}
            </p>
          ) : streaming ? (
            <p
              id="ai-input-streaming-reason"
              className="text-[11px] text-(--vaasenk-subtle)"
            >
              {MSG.disabledStreaming}
            </p>
          ) : null}
        </form>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Helpers — co-located so the chat-view file stays the single source of truth
// for the active-session UI.
// -----------------------------------------------------------------------------

function ThinkingSteps({ step }: { step: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex gap-3"
    >
      <div
        aria-hidden
        className="mt-1 grid size-9 shrink-0 place-items-center rounded-full bg-(image:--gradient-deep-ai-glow) text-(--vaasenk-gold) shadow-[0_10px_28px_rgba(90,0,19,0.25)]"
      >
        <Sparkles className="size-4 animate-pulse" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="inline-flex items-center gap-2 rounded-[24px] rounded-tl-md border border-(--vaasenk-line-sand) bg-white/82 px-4 py-3 text-sm text-(--vaasenk-muted) shadow-[0_8px_24px_rgba(160,0,0,0.06)] backdrop-blur-[20px]">
          <Loader2 className="size-3.5 animate-spin text-(--vaasenk-red)" aria-hidden />
          <span className="font-medium">
            {MSG.thinkingSteps[step] ?? MSG.thinkingSteps[0]}
          </span>
        </div>
      </div>
    </div>
  );
}

function EmptyChatHint({
  quickPrompts,
  onPick,
  disabled,
}: {
  quickPrompts: { label: string; prompt: string }[];
  onPick: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <div
        aria-hidden
        className={cn(
          'grid size-14 place-items-center rounded-2xl',
          'bg-(image:--gradient-deep-ai-glow) text-(--vaasenk-gold)',
          'shadow-[0_18px_50px_rgba(74,5,8,0.22)]',
        )}
      >
        <Sparkles className="size-6" />
      </div>
      <div className="max-w-md">
        <h3 className="text-lg font-semibold text-(--vaasenk-ink)">
          {MSG.emptyTitle}
        </h3>
        <p className="mt-1 text-sm text-(--vaasenk-muted)">
          {MSG.emptyDescription}
        </p>
      </div>
      <div className="flex max-w-md flex-wrap items-center justify-center gap-2">
        {quickPrompts.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onPick(p.prompt)}
            disabled={disabled}
            aria-label={`Insert prompt: ${p.label}`}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
              'border-(--vaasenk-line-sand) bg-white/80 text-(--vaasenk-deep-maroon)',
              'hover:border-(--vaasenk-red)/40 hover:bg-white',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30',
              'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-(--vaasenk-line-sand) disabled:hover:bg-white/80',
            )}
          >
            <MessageSquare className="size-3" aria-hidden />
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatViewSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy
      className="flex h-full min-h-[420px] flex-col gap-4 rounded-[24px] border border-(--vaasenk-line-sand) bg-white/72 p-6 backdrop-blur-[20px]"
    >
      <span className="sr-only">{MSG.loadingTitle}</span>
      <LoadingSkeleton variant="text" className="h-5 w-1/3" />
      <div className="flex justify-end">
        <LoadingSkeleton className="h-14 w-3/5" />
      </div>
      <div className="flex gap-3">
        <LoadingSkeleton variant="circle" className="size-9" />
        <LoadingSkeleton className="h-20 w-3/4" />
      </div>
      <div className="flex justify-end">
        <LoadingSkeleton className="h-14 w-1/2" />
      </div>
      <div className="mt-auto">
        <LoadingSkeleton className="h-14 w-full" />
      </div>
    </div>
  );
}
