'use client';

import {
  CheckCircle2,
  KeyRound,
  ListChecks,
  Plus,
  Sliders,
  Timer,
  Trash2,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useId, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  EXAM_TYPE_LABELS,
  EXAM_TYPE_VALUES,
  newRowId,
  QUESTION_TYPE_PRESETS,
  type ExamType,
  type QuestionTypeRow,
  type WizardData,
} from './wizard-types';

/**
 * Step 2 — Exam Configuration.
 *
 * Backend hard rules (mirror question-papers.dto.ts):
 *   • totalMarks: 10–500
 *   • durationMinutes: 15–360 (optional)
 *   • questionTypes: 1–20 rows
 *   • totalMarks must equal sum(count * marksEach) — enforced server-side
 *   • If difficulty is set, the three values must sum to 100
 */

const MSG = {
  heading: 'Configure the exam',
  helper:
    'Shape the paper to your test pattern — marks, duration, question mix, and difficulty.',

  examTypeLabel: 'Exam type',
  totalMarksLabel: 'Total marks',
  totalMarksHint: 'Between 10 and 500.',
  durationLabel: 'Duration (optional)',
  durationHint: 'Between 15 and 360 minutes.',
  durationUnit: 'minutes',

  qtSection: 'Question types',
  qtHelper:
    'At least one row. Total marks across all rows must equal the Total marks above.',
  qtAddRow: 'Add row',
  qtPresetsLabel: 'Quick add',
  qtTypeLabel: 'Type',
  qtCountLabel: 'Count',
  qtMarksEachLabel: 'Marks each',
  qtRemove: (i: number) => `Remove row ${i + 1}`,
  qtSubtotal: (s: number, target: number) =>
    `Total: ${s} of ${target} marks`,
  qtMatched: 'Marks match the total — ready to go.',
  qtMismatched: (diff: number) =>
    diff > 0
      ? `Need ${diff} more marks to reach the target.`
      : `Trim ${Math.abs(diff)} marks to match the target.`,

  diffToggle: 'Customise difficulty mix',
  diffHelper: 'Tell Vaasenk AI how much to lean easy / medium / hard.',
  diffEasy: 'Easy %',
  diffMedium: 'Medium %',
  diffHard: 'Hard %',
  diffSum: (s: number) => `Sum: ${s} / 100`,
  diffMatched: 'Difficulty mix is balanced.',
  diffMismatched: 'Easy + Medium + Hard must equal 100.',

  answerKeyLabel: 'Include answer key PDF',
  answerKeyHelper:
    'Generates a separate answer key PDF when you export. Recommended.',

  validationHeading: 'Almost there',
} as const;

export function StepExamConfig({
  data,
  onChange,
}: {
  data: WizardData;
  onChange: (patch: Partial<WizardData>) => void;
}) {
  const examTypeId = useId();
  const totalMarksId = useId();
  const durationId = useId();
  const diffToggleId = useId();
  const answerKeyId = useId();

  const subtotal = useMemo(
    () =>
      data.questionTypes.reduce(
        (acc, row) => acc + Number(row.count || 0) * Number(row.marksEach || 0),
        0,
      ),
    [data.questionTypes],
  );

  const marksMatched = subtotal === data.totalMarks;
  const diffSum =
    data.difficulty.easy + data.difficulty.medium + data.difficulty.hard;
  const diffMatched = !data.customizeDifficulty || diffSum === 100;

  // Validation summary bullets (CLAUDE.md §5 Error state — never silent).
  const issues = useMemo(() => {
    const list: string[] = [];
    if (data.questionTypes.length === 0) {
      list.push('Add at least one question type.');
    }
    if (data.questionTypes.some((r) => !r.type.trim())) {
      list.push('Every question type needs a name (e.g. MCQ, Short Answer).');
    }
    if (data.questionTypes.some((r) => r.count <= 0 || r.marksEach <= 0)) {
      list.push('Each row needs a positive count and marks each.');
    }
    if (!marksMatched) {
      list.push(MSG.qtMismatched(data.totalMarks - subtotal));
    }
    if (data.totalMarks < 10 || data.totalMarks > 500) {
      list.push('Total marks must be between 10 and 500.');
    }
    if (
      data.durationMinutes !== null &&
      (data.durationMinutes < 15 || data.durationMinutes > 360)
    ) {
      list.push('Duration must be between 15 and 360 minutes.');
    }
    if (data.customizeDifficulty && diffSum !== 100) {
      list.push(MSG.diffMismatched);
    }
    return list;
  }, [
    data.questionTypes,
    marksMatched,
    subtotal,
    data.totalMarks,
    data.durationMinutes,
    data.customizeDifficulty,
    diffSum,
  ]);

  // ----- Question type row helpers -----
  const updateRow = (id: string, patch: Partial<QuestionTypeRow>) => {
    onChange({
      questionTypes: data.questionTypes.map((r) =>
        r.id === id ? { ...r, ...patch } : r,
      ),
    });
  };
  const removeRow = (id: string) => {
    if (data.questionTypes.length === 1) return;
    onChange({
      questionTypes: data.questionTypes.filter((r) => r.id !== id),
    });
  };
  const addRow = () => {
    if (data.questionTypes.length >= 20) return;
    onChange({
      questionTypes: [
        ...data.questionTypes,
        { id: newRowId(), type: '', count: 1, marksEach: 1 },
      ],
    });
  };
  const applyPreset = (preset: (typeof QUESTION_TYPE_PRESETS)[number]) => {
    // Replace the last empty row, otherwise append.
    const lastEmpty = [...data.questionTypes]
      .reverse()
      .find((r) => !r.type.trim());
    if (lastEmpty) {
      updateRow(lastEmpty.id, {
        type: preset.type,
        marksEach: preset.marksEach,
      });
      return;
    }
    if (data.questionTypes.length >= 20) return;
    onChange({
      questionTypes: [
        ...data.questionTypes,
        {
          id: newRowId(),
          type: preset.type,
          count: 1,
          marksEach: preset.marksEach,
        },
      ],
    });
  };

  return (
    <div className="flex flex-col gap-7">
      <header className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight text-(--vaasenk-ink)">
          {MSG.heading}
        </h2>
        <p className="text-sm text-(--vaasenk-muted)">{MSG.helper}</p>
      </header>

      {/* Top row: exam type + marks + duration */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <label
            htmlFor={examTypeId}
            className="block text-sm font-medium text-(--vaasenk-deep-maroon)"
          >
            {MSG.examTypeLabel}
          </label>
          <select
            id={examTypeId}
            value={data.examType}
            onChange={(e) =>
              onChange({ examType: e.target.value as ExamType })
            }
            className="w-full min-h-[44px] rounded-2xl border border-(--vaasenk-line-sand) bg-white/85 px-4 py-3 text-base text-(--vaasenk-ink) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30"
          >
            {EXAM_TYPE_VALUES.map((t) => (
              <option key={t} value={t}>
                {EXAM_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label
            htmlFor={totalMarksId}
            className="block text-sm font-medium text-(--vaasenk-deep-maroon)"
          >
            {MSG.totalMarksLabel}
            <span className="ml-1 text-(--vaasenk-red)" aria-hidden>
              *
            </span>
          </label>
          <div className="relative">
            <Wallet
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-(--vaasenk-subtle)"
              aria-hidden
            />
            <input
              id={totalMarksId}
              type="number"
              min={10}
              max={500}
              value={data.totalMarks}
              onChange={(e) =>
                onChange({
                  totalMarks: clampInt(Number(e.target.value) || 0, 0, 500),
                })
              }
              className="w-full min-h-[44px] rounded-2xl border border-(--vaasenk-line-sand) bg-white/85 py-3 pl-10 pr-4 text-base text-(--vaasenk-ink) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30"
            />
          </div>
          <p className="text-xs text-(--vaasenk-subtle)">{MSG.totalMarksHint}</p>
        </div>

        <div className="space-y-2">
          <label
            htmlFor={durationId}
            className="block text-sm font-medium text-(--vaasenk-deep-maroon)"
          >
            {MSG.durationLabel}
          </label>
          <div className="relative">
            <Timer
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-(--vaasenk-subtle)"
              aria-hidden
            />
            <input
              id={durationId}
              type="number"
              min={15}
              max={360}
              value={data.durationMinutes ?? ''}
              onChange={(e) => {
                const v = e.target.value.trim();
                onChange({
                  durationMinutes:
                    v === '' ? null : clampInt(Number(v) || 0, 0, 360),
                });
              }}
              placeholder={MSG.durationUnit}
              className="w-full min-h-[44px] rounded-2xl border border-(--vaasenk-line-sand) bg-white/85 py-3 pl-10 pr-4 text-base text-(--vaasenk-ink) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30"
            />
          </div>
          <p className="text-xs text-(--vaasenk-subtle)">
            {data.durationMinutes
              ? formatDuration(data.durationMinutes)
              : MSG.durationHint}
          </p>
        </div>
      </div>

      {/* Question types */}
      <section className="rounded-3xl border border-(--vaasenk-line-sand) bg-white/55 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2 text-(--vaasenk-deep-maroon)">
            <ListChecks className="mt-0.5 size-5" aria-hidden />
            <div>
              <h3 className="text-base font-semibold">{MSG.qtSection}</h3>
              <p className="mt-1 text-xs text-(--vaasenk-muted)">
                {MSG.qtHelper}
              </p>
            </div>
          </div>
        </div>

        {/* Quick-add presets */}
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-(--vaasenk-subtle)">
            {MSG.qtPresetsLabel}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {QUESTION_TYPE_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className="inline-flex min-h-[36px] items-center rounded-full border border-(--vaasenk-line-sand) bg-white px-3 py-1.5 text-xs font-medium text-(--vaasenk-deep-maroon) transition-colors hover:border-(--vaasenk-red)/40 hover:bg-(--vaasenk-rose-wash) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30"
              >
                + {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Rows */}
        <ul className="mt-5 space-y-3">
          {data.questionTypes.map((row, idx) => (
            <li
              key={row.id}
              className="grid items-end gap-3 rounded-2xl border border-(--vaasenk-line-sand) bg-white/85 p-3 sm:grid-cols-[1.6fr_1fr_1fr_auto]"
            >
              <div className="space-y-1.5">
                <label
                  htmlFor={`qt-${row.id}-type`}
                  className={cn(
                    'block text-xs font-medium text-(--vaasenk-deep-maroon)',
                    idx === 0 ? '' : 'sr-only',
                  )}
                >
                  {MSG.qtTypeLabel}
                </label>
                <input
                  id={`qt-${row.id}-type`}
                  type="text"
                  value={row.type}
                  onChange={(e) => updateRow(row.id, { type: e.target.value })}
                  placeholder="e.g. MCQ"
                  className="w-full min-h-[44px] rounded-xl border border-(--vaasenk-line-sand) bg-white px-3 py-2.5 text-sm text-(--vaasenk-ink) placeholder:text-(--vaasenk-subtle) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30"
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor={`qt-${row.id}-count`}
                  className={cn(
                    'block text-xs font-medium text-(--vaasenk-deep-maroon)',
                    idx === 0 ? '' : 'sr-only',
                  )}
                >
                  {MSG.qtCountLabel}
                </label>
                <input
                  id={`qt-${row.id}-count`}
                  type="number"
                  min={1}
                  max={200}
                  value={row.count}
                  onChange={(e) =>
                    updateRow(row.id, {
                      count: clampInt(Number(e.target.value) || 0, 0, 200),
                    })
                  }
                  className="w-full min-h-[44px] rounded-xl border border-(--vaasenk-line-sand) bg-white px-3 py-2.5 text-sm text-(--vaasenk-ink) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30"
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor={`qt-${row.id}-marks`}
                  className={cn(
                    'block text-xs font-medium text-(--vaasenk-deep-maroon)',
                    idx === 0 ? '' : 'sr-only',
                  )}
                >
                  {MSG.qtMarksEachLabel}
                </label>
                <input
                  id={`qt-${row.id}-marks`}
                  type="number"
                  min={1}
                  max={50}
                  value={row.marksEach}
                  onChange={(e) =>
                    updateRow(row.id, {
                      marksEach: clampInt(Number(e.target.value) || 0, 0, 50),
                    })
                  }
                  className="w-full min-h-[44px] rounded-xl border border-(--vaasenk-line-sand) bg-white px-3 py-2.5 text-sm text-(--vaasenk-ink) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30"
                />
              </div>
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                disabled={data.questionTypes.length === 1}
                aria-label={MSG.qtRemove(idx)}
                className="inline-flex h-11 min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-(--vaasenk-line-sand) bg-white px-4 text-sm font-medium text-(--vaasenk-danger) transition-colors hover:bg-(--vaasenk-danger)/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="size-4" />
                <span className="sr-only sm:not-sr-only">Remove</span>
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={addRow}
          disabled={data.questionTypes.length >= 20}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-(--vaasenk-line-sand) bg-white/40 px-4 py-3 text-sm font-medium text-(--vaasenk-deep-maroon) transition-colors hover:border-(--vaasenk-red)/40 hover:bg-(--vaasenk-rose-wash) disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="size-4" />
          {MSG.qtAddRow}
        </button>

        {/* Live marks calculator */}
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'mt-4 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm',
            marksMatched
              ? 'border border-(--vaasenk-success)/30 bg-(--vaasenk-success)/8 text-(--vaasenk-success)'
              : 'border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/8 text-(--vaasenk-danger)',
          )}
        >
          <span className="inline-flex items-center gap-2 font-semibold">
            {marksMatched ? (
              <CheckCircle2 className="size-4" aria-hidden />
            ) : (
              <XCircle className="size-4" aria-hidden />
            )}
            {MSG.qtSubtotal(subtotal, data.totalMarks)}
          </span>
          <span className="text-xs font-medium opacity-90">
            {marksMatched
              ? MSG.qtMatched
              : MSG.qtMismatched(data.totalMarks - subtotal)}
          </span>
        </div>
      </section>

      {/* Difficulty */}
      <section className="rounded-3xl border border-(--vaasenk-line-sand) bg-white/55 p-5 sm:p-6">
        <label
          htmlFor={diffToggleId}
          className="flex cursor-pointer items-start gap-3"
        >
          <input
            id={diffToggleId}
            type="checkbox"
            checked={data.customizeDifficulty}
            onChange={(e) =>
              onChange({ customizeDifficulty: e.target.checked })
            }
            className="mt-1 size-4 cursor-pointer accent-(--vaasenk-red)"
          />
          <span className="flex-1">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-(--vaasenk-deep-maroon)">
              <Sliders className="size-4" aria-hidden />
              {MSG.diffToggle}
            </span>
            <span className="mt-1 block text-xs text-(--vaasenk-muted)">
              {MSG.diffHelper}
            </span>
          </span>
        </label>

        {data.customizeDifficulty ? (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <DifficultyInput
                label={MSG.diffEasy}
                value={data.difficulty.easy}
                onChange={(v) =>
                  onChange({
                    difficulty: { ...data.difficulty, easy: v },
                  })
                }
              />
              <DifficultyInput
                label={MSG.diffMedium}
                value={data.difficulty.medium}
                onChange={(v) =>
                  onChange({
                    difficulty: { ...data.difficulty, medium: v },
                  })
                }
              />
              <DifficultyInput
                label={MSG.diffHard}
                value={data.difficulty.hard}
                onChange={(v) =>
                  onChange({
                    difficulty: { ...data.difficulty, hard: v },
                  })
                }
              />
            </div>
            <div
              role="status"
              aria-live="polite"
              className={cn(
                'flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm',
                diffMatched
                  ? 'border border-(--vaasenk-success)/30 bg-(--vaasenk-success)/8 text-(--vaasenk-success)'
                  : 'border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/8 text-(--vaasenk-danger)',
              )}
            >
              <span className="font-semibold">{MSG.diffSum(diffSum)}</span>
              <span className="text-xs opacity-90">
                {diffMatched ? MSG.diffMatched : MSG.diffMismatched}
              </span>
            </div>
          </div>
        ) : null}
      </section>

      {/* Answer key */}
      <label
        htmlFor={answerKeyId}
        className="flex cursor-pointer items-start gap-3 rounded-2xl border border-(--vaasenk-line-sand) bg-white/70 px-4 py-3"
      >
        <input
          id={answerKeyId}
          type="checkbox"
          checked={data.includeAnswerKey}
          onChange={(e) => onChange({ includeAnswerKey: e.target.checked })}
          className="mt-1 size-4 cursor-pointer accent-(--vaasenk-red)"
        />
        <span className="flex-1">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-(--vaasenk-deep-maroon)">
            <KeyRound className="size-4" aria-hidden />
            {MSG.answerKeyLabel}
          </span>
          <span className="mt-1 block text-xs text-(--vaasenk-muted)">
            {MSG.answerKeyHelper}
          </span>
        </span>
      </label>

      {/* Validation summary */}
      {issues.length > 0 ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-(--vaasenk-warning)/30 bg-(--vaasenk-warning)/10 px-4 py-3 text-sm text-(--vaasenk-deep-maroon)"
        >
          <p className="font-semibold">{MSG.validationHeading}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function DifficultyInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-xs font-medium text-(--vaasenk-deep-maroon)"
      >
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        max={100}
        value={value}
        onChange={(e) =>
          onChange(clampInt(Number(e.target.value) || 0, 0, 100))
        }
        className="w-full min-h-[44px] rounded-xl border border-(--vaasenk-line-sand) bg-white px-3 py-2.5 text-sm text-(--vaasenk-ink) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30"
      />
    </div>
  );
}

function clampInt(n: number, min: number, max: number): number {
  const v = Math.floor(n);
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} hour${h === 1 ? '' : 's'}`;
  return `${h} hour${h === 1 ? '' : 's'} ${m} minute${m === 1 ? '' : 's'}`;
}
