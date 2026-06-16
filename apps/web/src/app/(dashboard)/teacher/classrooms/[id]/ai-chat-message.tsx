'use client';

import { AlertCircle, BookMarked, Loader2, OctagonX, Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { Citation } from '@/lib/ai-chat-stream';
import { cn } from '@/lib/utils';

/**
 * Per-message lifecycle status. Drives the small affordances inside the
 * bubble (typing dots, error pill, aborted note, citation chips).
 */
export type AiMessageStatus =
  | 'sending'
  | 'streaming'
  | 'complete'
  | 'error'
  | 'aborted';

export type AiChatMessage = {
  /** Stable id — for streaming messages this is a temporary client id. */
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  citations: Citation[];
  status: AiMessageStatus;
  /** Surface error code/message when status === 'error'. */
  errorMessage?: string | null;
  createdAt?: string;
};

const STATUS_COPY = {
  aborted: 'You stopped Vaasenk AI mid-response.',
  errorRetry: 'Tap to retry the request.',
} as const;

/**
 * A single chat bubble.
 *
 * User messages sit on the right with the Brand Flame gradient. Assistant
 * messages sit on the left in a glass card with a small Vaasenk AI sparkle
 * avatar. Streaming bubbles announce incremental tokens via aria-live.
 */
export function AiChatMessageBubble({
  message,
  onRetry,
}: {
  message: AiChatMessage;
  onRetry?: () => void;
}) {
  if (message.role === 'USER') {
    return <UserBubble message={message} />;
  }
  return <AssistantBubble message={message} onRetry={onRetry} />;
}

function UserBubble({ message }: { message: AiChatMessage }) {
  return (
    <div className="flex justify-end">
      <div
        className={cn(
          'max-w-[75%] rounded-[24px] rounded-tr-md px-4 py-3 text-sm leading-relaxed text-white',
          'bg-(image:--gradient-brand-flame)',
          'shadow-[0_10px_28px_rgba(160,0,0,0.18)]',
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        {message.status === 'sending' ? (
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-white/80">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Sending…
          </p>
        ) : null}
      </div>
    </div>
  );
}

function AssistantBubble({
  message,
  onRetry,
}: {
  message: AiChatMessage;
  onRetry?: () => void;
}) {
  const isStreaming = message.status === 'streaming';
  const hasError = message.status === 'error';
  const wasAborted = message.status === 'aborted';

  return (
    <div className="flex gap-3">
      <div
        aria-hidden
        className={cn(
          'mt-1 grid size-9 shrink-0 place-items-center rounded-full',
          'bg-(image:--gradient-deep-ai-glow) text-(--vaasenk-gold)',
          'shadow-[0_10px_28px_rgba(90,0,19,0.25)]',
        )}
      >
        <Sparkles className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div
          role={isStreaming ? 'status' : undefined}
          aria-live={isStreaming ? 'polite' : 'off'}
          aria-busy={isStreaming || undefined}
          className={cn(
            'max-w-[85%] rounded-[24px] rounded-tl-md border border-(--vaasenk-line-sand) px-4 py-3 text-sm leading-relaxed text-(--vaasenk-ink)',
            'bg-white/82 backdrop-blur-[20px]',
            'shadow-[0_8px_24px_rgba(160,0,0,0.06)]',
          )}
        >
          {message.content ? (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : isStreaming ? (
            <TypingDots />
          ) : (
            <p className="italic text-(--vaasenk-subtle)">
              Vaasenk AI didn’t return any content.
            </p>
          )}
          {isStreaming && message.content ? (
            <span
              aria-hidden
              className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-[vaasenk-caret_900ms_steps(2)_infinite] bg-(--vaasenk-red) align-middle"
            />
          ) : null}

          {wasAborted ? (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-(--vaasenk-subtle)">
              <OctagonX className="size-3.5" aria-hidden />
              {STATUS_COPY.aborted}
            </p>
          ) : null}

          {hasError ? (
            <div
              role="alert"
              className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-3 py-2 text-xs text-(--vaasenk-danger)"
            >
              <AlertCircle className="size-3.5" aria-hidden />
              <span className="font-medium">
                {message.errorMessage ?? 'Stream interrupted.'}
              </span>
              {onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="ml-auto rounded-full bg-(--vaasenk-danger)/15 px-3 py-1 font-semibold transition-colors hover:bg-(--vaasenk-danger)/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-danger)/40"
                >
                  {STATUS_COPY.errorRetry}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Citation chips */}
        {message.citations.length > 0 ? (
          <CitationChips citations={message.citations} />
        ) : null}
      </div>

      <style jsx>{`
        @keyframes vaasenk-caret {
          50% {
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}

function TypingDots() {
  return (
    <span
      aria-hidden
      className="inline-flex items-center gap-1.5 text-(--vaasenk-subtle)"
    >
      <Dot delay="0ms" />
      <Dot delay="120ms" />
      <Dot delay="240ms" />
      <span className="sr-only">Vaasenk AI is thinking…</span>
    </span>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="block size-1.5 animate-bounce rounded-full bg-(--vaasenk-red)/70"
      style={{ animationDelay: delay }}
    />
  );
}

function CitationChips({ citations }: { citations: Citation[] }) {
  const [open, setOpen] = useState<Citation | null>(null);
  return (
    <div className="mt-3 flex max-w-[85%] flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-(--vaasenk-deep-maroon)/80">
        <BookMarked className="size-3" aria-hidden />
        Sources
      </span>
      {citations.map((c) => {
        const label = formatCitationLabel(c);
        const tooltip = formatCitationTooltip(c);
        return (
          <button
            key={`${c.index}-${c.chapter ?? ''}-${c.topic ?? ''}`}
            type="button"
            onClick={() => setOpen(c)}
            title={tooltip}
            aria-label={`Citation ${c.index}: ${label}. ${tooltip}`}
            className={cn(
              'inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium',
              'bg-(--vaasenk-gold)/15 text-(--vaasenk-deep-maroon)',
              'border border-(--vaasenk-gold)/30',
              'transition-colors hover:bg-(--vaasenk-gold)/25',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30',
            )}
          >
            <span className="font-semibold">[{c.index}]</span>
            <span className="truncate">{label}</span>
          </button>
        );
      })}
      {open ? (
        <CitationPopup citation={open} onClose={() => setOpen(null)} />
      ) : null}
    </div>
  );
}

function CitationPopup({
  citation,
  onClose,
}: {
  citation: Citation;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Citation [${citation.index}] details`}
      className="fixed inset-0 z-50 grid place-items-center bg-(--vaasenk-deep-maroon)/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-full max-w-md rounded-[24px] border border-(--vaasenk-line-sand)',
          'bg-(image:--gradient-cream-sunrise) p-6 shadow-[0_32px_90px_rgba(160,0,0,0.18)]',
        )}
      >
        <p className="text-[11px] font-medium uppercase tracking-wider text-(--vaasenk-deep-maroon)/80">
          Citation [{citation.index}]
        </p>
        <h4 className="mt-1 text-lg font-semibold text-(--vaasenk-ink)">
          {citation.chapter ?? 'Untitled chapter'}
        </h4>
        {citation.topic ? (
          <p className="mt-0.5 text-sm text-(--vaasenk-muted)">
            {citation.topic}
          </p>
        ) : null}
        <dl className="mt-4 space-y-2 text-sm">
          {citation.syllabusName ? (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-(--vaasenk-deep-maroon)">Syllabus</dt>
              <dd className="truncate text-(--vaasenk-ink)">
                {citation.syllabusName}
                {citation.syllabusVersion
                  ? ` · ${citation.syllabusVersion}`
                  : ''}
              </dd>
            </div>
          ) : null}
          {citation.pageNumber ? (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-(--vaasenk-deep-maroon)">Page</dt>
              <dd className="text-(--vaasenk-ink)">{citation.pageNumber}</dd>
            </div>
          ) : null}
        </dl>
        <p className="mt-4 rounded-2xl border border-(--vaasenk-line-sand) bg-white/60 p-3 text-xs text-(--vaasenk-muted)">
          Full chunk preview lands in Sprint 4.5. For now, open the syllabus
          in the admin library to read the source passage in context.
        </p>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-(--vaasenk-line-sand) bg-white/70 px-4 py-2 text-sm font-medium text-(--vaasenk-deep-maroon) transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function formatCitationLabel(c: Citation): string {
  const parts: string[] = [];
  if (c.chapter) parts.push(c.chapter);
  if (c.topic) parts.push(c.topic);
  if (parts.length === 0) return `Source ${c.index}`;
  const label = parts.join(' · ');
  return c.pageNumber ? `${label} · p.${c.pageNumber}` : label;
}

function formatCitationTooltip(c: Citation): string {
  const bits: string[] = [];
  if (c.syllabusName) {
    bits.push(
      c.syllabusVersion
        ? `${c.syllabusName} (${c.syllabusVersion})`
        : c.syllabusName,
    );
  }
  if (c.pageNumber) bits.push(`Page ${c.pageNumber}`);
  return bits.length > 0 ? bits.join(' — ') : 'Syllabus reference';
}
