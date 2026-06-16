'use client';

import { BookMarked, MoreHorizontal, RefreshCcw, SquarePen } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/utils';
import type { StructuredContent } from './wizard-types';

/**
 * Pure render of a QuestionPaperDetail's structured content.
 *
 * Designed to look like a real exam paper (not a Vaasenk gradient card):
 *  - Cream-tinted white surface (not a gradient — design-docs forbid long
 *    text on gradient surfaces).
 *  - Serif-adjacent feel achieved via Inter weight 600 for headings and
 *    400 for the body — keeps a single typeface (CLAUDE.md §4).
 *  - Numbered sections (Section A / B / ...) and questions, MCQ options
 *    rendered as lettered (a) (b) (c) (d).
 *  - "From: chapter · topic" source pill rendered below each question if
 *    available (CLAUDE.md §6.4: "AI responses MUST include source
 *    references when available").
 *
 * When `interactive` is true, each question gets an Edit / Regenerate
 * menu — used in step 5. In step 6 we render read-only.
 */

export type PaperPreviewProps = {
  content: StructuredContent;
  /** Title + duration override (controlled by parent during edit). */
  title?: string;
  durationMinutes?: number | null;
  totalMarks: number;
  examTypeLabel: string;
  interactive?: boolean;
  onEditQuestion?: (sectionIndex: number, questionIndex: number) => void;
  onRegenerateQuestion?: (sectionIndex: number, questionIndex: number) => void;
  /** Tracks which (section,question) coordinates are currently regenerating. */
  regeneratingCoord?: { sectionIndex: number; questionIndex: number } | null;
  showAnswerKey?: boolean;
};

const SECTION_LETTERS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
];

export function PaperPreview({
  content,
  title,
  durationMinutes,
  totalMarks,
  examTypeLabel,
  interactive = false,
  onEditQuestion,
  onRegenerateQuestion,
  regeneratingCoord,
  showAnswerKey = false,
}: PaperPreviewProps) {
  const headingId = useId();
  const effectiveTitle = title?.trim() || content.title;

  return (
    <article
      aria-labelledby={headingId}
      className={cn(
        'rounded-[20px] border border-(--vaasenk-line-sand) bg-white',
        'p-6 sm:p-8',
        'text-(--vaasenk-ink)',
        'shadow-[0_8px_24px_rgba(160,0,0,0.06)]',
      )}
    >
      {/* Paper header — exam-paper aesthetic, not a gradient block. */}
      <header className="border-b border-(--vaasenk-line-sand) pb-5 text-center">
        <h2
          id={headingId}
          className="text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          {effectiveTitle}
        </h2>
        <p className="mt-2 text-sm text-(--vaasenk-muted)">
          {examTypeLabel}
          <span className="px-2 text-(--vaasenk-subtle)">·</span>
          <span className="font-medium text-(--vaasenk-ink)">
            {totalMarks} marks
          </span>
          {typeof durationMinutes === 'number' && durationMinutes > 0 ? (
            <>
              <span className="px-2 text-(--vaasenk-subtle)">·</span>
              <span className="font-medium text-(--vaasenk-ink)">
                {formatDuration(durationMinutes)}
              </span>
            </>
          ) : null}
        </p>
      </header>

      {content.instructions?.trim() ? (
        <p className="mt-4 whitespace-pre-line text-sm italic text-(--vaasenk-muted) sm:text-base">
          {content.instructions}
        </p>
      ) : null}

      <div className="mt-6 space-y-8">
        {content.sections.map((section, sIdx) => {
          const sectionMarks = section.questions.reduce(
            (acc, q) => acc + (Number(q.marks) || 0),
            0,
          );
          const sectionLetter = SECTION_LETTERS[sIdx] ?? String(sIdx + 1);
          return (
            <section key={`${sIdx}-${section.name}`} className="space-y-4">
              <h3 className="flex flex-wrap items-baseline justify-between gap-2 border-b border-dashed border-(--vaasenk-line-sand) pb-2 text-sm font-semibold uppercase tracking-wider text-(--vaasenk-deep-maroon)">
                <span>
                  Section {sectionLetter}
                  {section.name ? (
                    <span className="ml-2 text-(--vaasenk-muted) normal-case tracking-normal">
                      — {section.name}
                    </span>
                  ) : null}
                </span>
                <span className="text-xs font-medium text-(--vaasenk-muted) normal-case tracking-normal">
                  {section.questions.length} question
                  {section.questions.length === 1 ? '' : 's'}
                  <span className="px-1.5 text-(--vaasenk-subtle)">·</span>
                  {sectionMarks} marks
                </span>
              </h3>

              <ol className="space-y-5">
                {section.questions.map((q, qIdx) => {
                  const isRegenerating =
                    regeneratingCoord &&
                    regeneratingCoord.sectionIndex === sIdx &&
                    regeneratingCoord.questionIndex === qIdx;
                  return (
                    <li
                      key={`${sIdx}-${qIdx}`}
                      className={cn(
                        'group rounded-2xl border border-transparent px-3 py-3 transition-colors',
                        interactive && 'hover:border-(--vaasenk-line-sand) hover:bg-(--vaasenk-warm-canvas)/60',
                        isRegenerating && 'border-(--vaasenk-gold)/40 bg-(--vaasenk-gold)/5',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 inline-flex min-w-[2rem] shrink-0 justify-end font-semibold text-(--vaasenk-deep-maroon)">
                          {qIdx + 1}.
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="whitespace-pre-line text-base leading-relaxed text-(--vaasenk-ink)">
                            {q.text}
                          </p>

                          {Array.isArray(q.options) && q.options.length > 0 ? (
                            <ol className="mt-3 space-y-1.5 pl-2 text-sm text-(--vaasenk-ink)">
                              {q.options.map((opt, oIdx) => (
                                <li
                                  key={`${sIdx}-${qIdx}-opt-${oIdx}`}
                                  className="flex items-start gap-2"
                                >
                                  <span className="font-medium text-(--vaasenk-muted)">
                                    ({String.fromCharCode(97 + oIdx)})
                                  </span>
                                  <span>{opt}</span>
                                </li>
                              ))}
                            </ol>
                          ) : null}

                          {showAnswerKey && q.answer ? (
                            <p className="mt-3 rounded-xl border border-(--vaasenk-success)/30 bg-(--vaasenk-success)/8 px-3 py-2 text-sm text-(--vaasenk-success)">
                              <span className="font-semibold">Answer: </span>
                              <span className="whitespace-pre-line text-(--vaasenk-ink)/85">
                                {q.answer}
                              </span>
                            </p>
                          ) : null}

                          {q.source &&
                          (q.source.chapter || q.source.topic) ? (
                            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-(--vaasenk-gold)/15 px-2.5 py-1 text-xs font-medium text-(--vaasenk-deep-maroon)">
                              <BookMarked
                                className="size-3"
                                aria-hidden="true"
                              />
                              <span className="font-semibold">From:</span>
                              {q.source.chapter ? <span>{q.source.chapter}</span> : null}
                              {q.source.chapter && q.source.topic ? (
                                <span className="text-(--vaasenk-subtle)">·</span>
                              ) : null}
                              {q.source.topic ? <span>{q.source.topic}</span> : null}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 items-start gap-2">
                          <span className="rounded-full border border-(--vaasenk-line-sand) bg-white px-2.5 py-1 text-xs font-semibold text-(--vaasenk-deep-maroon)">
                            [{q.marks} mark{q.marks === 1 ? '' : 's'}]
                          </span>
                          {interactive ? (
                            <QuestionActions
                              onEdit={() => onEditQuestion?.(sIdx, qIdx)}
                              onRegenerate={() =>
                                onRegenerateQuestion?.(sIdx, qIdx)
                              }
                              disabled={Boolean(isRegenerating)}
                            />
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Question actions — lightweight popover (no Radix dropdown to keep the
// preview component lean; two buttons in a popover-style cluster work fine
// on both desktop and mobile)
// ---------------------------------------------------------------------------

function QuestionActions({
  onEdit,
  onRegenerate,
  disabled,
}: {
  onEdit: () => void;
  onRegenerate: () => void;
  disabled: boolean;
}) {
  return (
    <div className="relative">
      <details className="group">
        <summary
          aria-label="Question actions"
          className="grid size-8 cursor-pointer list-none place-items-center rounded-full border border-(--vaasenk-line-sand) bg-white text-(--vaasenk-deep-maroon) shadow-[0_2px_6px_rgba(160,0,0,0.05)] transition-colors hover:border-(--vaasenk-red)/40 hover:bg-(--vaasenk-rose-wash) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30 [&::-webkit-details-marker]:hidden"
        >
          <MoreHorizontal className="size-4" />
        </summary>
        <div className="absolute right-0 top-9 z-30 flex w-44 flex-col gap-1 rounded-2xl border border-(--vaasenk-line-sand) bg-white p-1.5 shadow-[0_18px_50px_rgba(74,5,8,0.18)]">
          <button
            type="button"
            onClick={onEdit}
            disabled={disabled}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-(--vaasenk-ink) transition-colors hover:bg-(--vaasenk-rose-wash) focus-visible:bg-(--vaasenk-rose-wash) focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            <SquarePen className="size-4 text-(--vaasenk-deep-maroon)" />
            Edit question
          </button>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={disabled}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-(--vaasenk-ink) transition-colors hover:bg-(--vaasenk-gold)/15 focus-visible:bg-(--vaasenk-gold)/15 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw className="size-4 text-(--vaasenk-deep-maroon)" />
            Regenerate
          </button>
        </div>
      </details>
    </div>
  );
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} hour${h === 1 ? '' : 's'}`;
  return `${h} hour${h === 1 ? '' : 's'} ${m} min`;
}
