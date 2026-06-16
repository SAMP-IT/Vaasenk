'use client';

import { BookOpenCheck, Info, X } from 'lucide-react';
import { useId, useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { WizardData } from './wizard-types';

/**
 * Step 1 — Portion Selection.
 *
 * Free-text comma-separated entry. The backend filter is case-insensitive
 * substring match against syllabusChunk.chapter AND .topic, so user input
 * doesn't need exact case. If nothing matches, the worker falls back to
 * the first 40 chunks of the syllabus.
 *
 * A "Whole syllabus" toggle disables the input and sends a sentinel value
 * that triggers the worker's fallback path (any non-matching string would
 * do — we send the literal "Whole syllabus").
 *
 * The visual chapter picker arrives in Sprint 5.4 once the backend ships
 * GET /syllabus/:id/chapters.
 */

const MSG = {
  heading: 'Which portions should the paper cover?',
  helper:
    'Enter chapter or topic names exactly as they appear in your syllabus, separated by commas. We match case-insensitively, so capitalisation doesn’t need to be perfect.',
  comingSoon:
    'Visual chapter picker arrives in Sprint 5.4 once the syllabus chapter endpoint ships.',
  textareaLabel: 'Chapters or topics',
  textareaPlaceholder:
    'e.g. Algebra, Geometry, Trigonometry, Set Theory',
  wholeSyllabusLabel: 'Use the whole syllabus',
  wholeSyllabusHint:
    'Sends the entire syllabus to Vaasenk AI — best for revision tests or short syllabi.',
  suggestionsLabel: 'Suggestions',
  chipsLabel: 'Selected portions',
  removeChip: (name: string) => `Remove ${name}`,
  none: 'No portions added yet.',
  validation: 'Add at least one portion or toggle “Use the whole syllabus”.',
  maxChars: 800,
  maxCharsHint: (used: number, max: number) => `${used} / ${max} characters`,
} as const;

const QUICK_SUGGESTIONS = [
  'Last chapter',
  'Mid-term portion',
  'First half',
  'Second half',
];

export function StepPortionSelection({
  data,
  onChange,
}: {
  data: WizardData;
  onChange: (patch: Partial<WizardData>) => void;
}) {
  const inputId = useId();
  const textareaId = useId();

  const parsedChips = useMemo(() => {
    if (data.wholeSyllabus) return [] as string[];
    const seen = new Set<string>();
    return data.portionsInput
      .split(',')
      .map((s) => s.trim())
      .filter((s) => {
        if (s.length === 0) return false;
        const key = s.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [data.portionsInput, data.wholeSyllabus]);

  const setPortionsInput = (next: string) => {
    onChange({
      portionsInput: next.slice(0, MSG.maxChars),
      portions: nextChipsFor(next),
    });
  };

  const removeChip = (chip: string) => {
    const remaining = parsedChips.filter((c) => c !== chip);
    const newText = remaining.join(', ');
    onChange({ portionsInput: newText, portions: remaining });
  };

  const appendSuggestion = (suggestion: string) => {
    if (parsedChips.some((c) => c.toLowerCase() === suggestion.toLowerCase())) {
      return;
    }
    const next =
      data.portionsInput.trim().length === 0
        ? suggestion
        : `${data.portionsInput.replace(/\s*,\s*$/, '')}, ${suggestion}`;
    setPortionsInput(next);
  };

  const toggleWhole = (checked: boolean) => {
    onChange({
      wholeSyllabus: checked,
      ...(checked
        ? { portions: ['Whole syllabus'], portionsInput: '' }
        : { portions: parsedChips }),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight text-(--vaasenk-ink)">
          {MSG.heading}
        </h2>
        <p className="text-sm text-(--vaasenk-muted)">{MSG.helper}</p>
      </header>

      {/* Sprint 5.4 disclosure */}
      <p className="flex items-start gap-2 rounded-2xl border border-(--vaasenk-gold)/40 bg-(--vaasenk-gold)/10 px-3 py-2.5 text-xs text-(--vaasenk-deep-maroon)">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>{MSG.comingSoon}</span>
      </p>

      {/* Whole syllabus toggle */}
      <div>
        <label
          htmlFor={inputId}
          className="inline-flex w-full cursor-pointer items-start gap-3 rounded-2xl border border-(--vaasenk-line-sand) bg-white/70 px-4 py-3 text-sm text-(--vaasenk-ink) transition-colors hover:border-(--vaasenk-red)/30 sm:items-center"
        >
          <input
            id={inputId}
            type="checkbox"
            checked={data.wholeSyllabus}
            onChange={(e) => toggleWhole(e.target.checked)}
            className="mt-0.5 size-4 cursor-pointer accent-(--vaasenk-red) sm:mt-0"
          />
          <span className="flex-1">
            <span className="inline-flex items-center gap-1.5 font-semibold text-(--vaasenk-deep-maroon)">
              <BookOpenCheck className="size-4" aria-hidden />
              {MSG.wholeSyllabusLabel}
            </span>
            <span className="mt-1 block text-xs text-(--vaasenk-muted)">
              {MSG.wholeSyllabusHint}
            </span>
          </span>
        </label>
      </div>

      {/* Free-text input — disabled when whole syllabus is on */}
      <div className="space-y-2">
        <label
          htmlFor={textareaId}
          className="block text-sm font-medium text-(--vaasenk-deep-maroon)"
        >
          {MSG.textareaLabel}
          <span className="ml-1 text-(--vaasenk-red)" aria-hidden>
            *
          </span>
        </label>
        <textarea
          id={textareaId}
          value={data.portionsInput}
          onChange={(e) => setPortionsInput(e.target.value)}
          disabled={data.wholeSyllabus}
          maxLength={MSG.maxChars}
          rows={3}
          placeholder={MSG.textareaPlaceholder}
          aria-describedby={`${textareaId}-help`}
          className={cn(
            'min-h-[88px] w-full resize-y rounded-2xl border border-(--vaasenk-line-sand) bg-white/85 px-4 py-3 text-base text-(--vaasenk-ink) placeholder:text-(--vaasenk-subtle)',
            'focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        />
        <p
          id={`${textareaId}-help`}
          className="flex items-center justify-between text-xs text-(--vaasenk-subtle)"
        >
          <span>Separate values with commas.</span>
          <span>{MSG.maxCharsHint(data.portionsInput.length, MSG.maxChars)}</span>
        </p>
      </div>

      {/* Suggestions */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-(--vaasenk-subtle)">
          {MSG.suggestionsLabel}
        </p>
        <div className="flex flex-wrap gap-2">
          {QUICK_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => appendSuggestion(s)}
              disabled={data.wholeSyllabus}
              className="inline-flex min-h-[36px] items-center rounded-full border border-dashed border-(--vaasenk-red)/40 bg-white/70 px-3 py-1.5 text-xs font-medium text-(--vaasenk-red) transition-colors hover:bg-(--vaasenk-rose-wash) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              + {s}
            </button>
          ))}
        </div>
      </div>

      {/* Chips */}
      {!data.wholeSyllabus ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-(--vaasenk-subtle)">
            {MSG.chipsLabel} ({parsedChips.length})
          </p>
          {parsedChips.length === 0 ? (
            <p className="text-sm text-(--vaasenk-subtle)">{MSG.none}</p>
          ) : (
            <ul
              role="list"
              aria-label={MSG.chipsLabel}
              className="flex flex-wrap gap-2"
            >
              {parsedChips.map((chip) => (
                <li
                  key={chip}
                  className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full border border-(--vaasenk-line-sand) bg-(--vaasenk-rose-wash) pl-3 pr-1 py-1 text-xs font-medium text-(--vaasenk-deep-maroon)"
                >
                  <span className="max-w-[180px] truncate">{chip}</span>
                  <button
                    type="button"
                    onClick={() => removeChip(chip)}
                    aria-label={MSG.removeChip(chip)}
                    className="grid size-6 place-items-center rounded-full text-(--vaasenk-deep-maroon) transition-colors hover:bg-(--vaasenk-danger)/15 hover:text-(--vaasenk-danger) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="rounded-2xl border border-(--vaasenk-gold)/40 bg-(--vaasenk-gold)/10 px-3 py-2.5 text-xs text-(--vaasenk-deep-maroon)">
          Whole syllabus mode is on — Vaasenk AI will draw from the entire
          indexed syllabus.
        </p>
      )}
    </div>
  );
}

function nextChipsFor(raw: string): string[] {
  const seen = new Set<string>();
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => {
      if (!s) return false;
      const k = s.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}
