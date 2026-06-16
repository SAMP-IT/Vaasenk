'use client';

import { AlertCircle, Flame, Inbox, Sparkles } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { apiFetchEnvelope } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  EXAM_TYPE_LABELS,
  type SamplePaperListItem,
  type WizardData,
} from './wizard-types';

/**
 * Step 3 — Sample Paper Guidance (optional).
 *
 * Loads AI_READY sample papers from the institution, filtered by the
 * classroom's class + subject when available. Up to 5 can be selected.
 *
 * Empty + error + loading + default states all rendered.
 */

const MSG = {
  heading: 'Sample paper guidance',
  helperBody:
    'Vaasenk AI will mimic the patterns from these sample papers — exam style, question phrasing, and marks distribution. Pick up to 5.',
  noneRadio: 'No guidance',
  noneHelper:
    'Vaasenk AI generates the paper from the syllabus alone, with no pattern reference.',
  useRadio: 'Use sample papers',
  useHelper:
    'Pick previous question papers your admin has uploaded to guide the AI.',
  selectedCount: (n: number) => `${n} of 5 selected`,
  maxReached: 'Maximum 5 sample papers selected.',
  emptyTitle: 'No sample papers uploaded yet',
  emptyBody:
    'No sample papers are available for this classroom’s class and subject. Continue without guidance, or ask your admin to upload some.',
  errorTitle: 'Couldn’t load sample papers',
  errorRetry: 'Retry',
  yearLabel: (y: number) => `Year ${y}`,
  priorityHigh: 'High priority',
  priorityNormal: 'Normal',
  sourceNote: (syllabusName: string | null, sampleCount: number) =>
    `Generated using ${syllabusName ?? 'the mapped syllabus'}${sampleCount > 0 ? ` and ${sampleCount} sample paper${sampleCount === 1 ? '' : 's'}` : ''}.`,
} as const;

const MAX_SELECTED = 5;

export function StepSampleGuidance({
  data,
  onChange,
  classId,
  subjectId,
  syllabusName,
}: {
  data: WizardData;
  onChange: (patch: Partial<WizardData>) => void;
  classId: string | null;
  subjectId: string | null;
  syllabusName: string | null;
}) {
  const groupName = useId();
  const [items, setItems] = useState<SamplePaperListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!data.useSamplePapers) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set('status', 'AI_READY');
    params.set('limit', '50');
    if (classId) params.set('classId', classId);
    if (subjectId) params.set('subjectId', subjectId);

    (async () => {
      try {
        const res = await apiFetchEnvelope<SamplePaperListItem[]>(
          `/api/v1/sample-papers?${params.toString()}`,
        );
        if (cancelled) return;
        setItems(res.data ?? []);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : 'Network error while loading sample papers.',
        );
        setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data.useSamplePapers, classId, subjectId, reloadTick]);

  const toggleSelection = (id: string) => {
    if (data.samplePaperIds.includes(id)) {
      onChange({ samplePaperIds: data.samplePaperIds.filter((x) => x !== id) });
      return;
    }
    if (data.samplePaperIds.length >= MAX_SELECTED) return;
    onChange({ samplePaperIds: [...data.samplePaperIds, id] });
  };

  const setMode = (use: boolean) => {
    if (use === data.useSamplePapers) return;
    onChange({
      useSamplePapers: use,
      ...(use ? {} : { samplePaperIds: [] }),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight text-(--vaasenk-ink)">
          {MSG.heading}
        </h2>
        <p className="text-sm text-(--vaasenk-muted)">{MSG.helperBody}</p>
      </header>

      {/* Mode radio group */}
      <fieldset
        className="grid gap-3 sm:grid-cols-2"
        aria-describedby={`${groupName}-helper`}
      >
        <legend className="sr-only">Sample paper guidance mode</legend>
        <ModeOption
          name={groupName}
          checked={!data.useSamplePapers}
          onChange={() => setMode(false)}
          icon={<Sparkles className="size-4" aria-hidden />}
          title={MSG.noneRadio}
          helper={MSG.noneHelper}
        />
        <ModeOption
          name={groupName}
          checked={data.useSamplePapers}
          onChange={() => setMode(true)}
          icon={<Flame className="size-4" aria-hidden />}
          title={MSG.useRadio}
          helper={MSG.useHelper}
        />
      </fieldset>

      {/* Sample list */}
      {data.useSamplePapers ? (
        <section className="space-y-3" aria-live="polite">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-(--vaasenk-subtle)">
              {MSG.selectedCount(data.samplePaperIds.length)}
            </p>
            {data.samplePaperIds.length >= MAX_SELECTED ? (
              <p className="text-xs font-medium text-(--vaasenk-warning)">
                {MSG.maxReached}
              </p>
            ) : null}
          </div>

          {loading ? (
            <ul className="space-y-2" aria-busy>
              <LoadingSkeleton className="h-16 w-full rounded-2xl" />
              <LoadingSkeleton className="h-16 w-full rounded-2xl" />
              <LoadingSkeleton className="h-16 w-full rounded-2xl" />
            </ul>
          ) : error ? (
            <div
              role="alert"
              className="flex flex-col items-start gap-2 rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-4 py-3 text-sm text-(--vaasenk-danger) sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <div>
                  <p className="font-semibold">{MSG.errorTitle}</p>
                  <p className="text-xs opacity-90">{error}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReloadTick((t) => t + 1)}
                className="rounded-full bg-(--vaasenk-danger)/15 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-(--vaasenk-danger)/25"
              >
                {MSG.errorRetry}
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-(--vaasenk-line-sand) bg-white/55 px-6 py-8 text-center">
              <div
                aria-hidden
                className="grid size-12 place-items-center rounded-2xl bg-[linear-gradient(135deg,#FFE3D2_0%,#FFF0F4_100%)] text-(--vaasenk-red)"
              >
                <Inbox className="size-6" />
              </div>
              <p className="text-sm font-semibold text-(--vaasenk-ink)">
                {MSG.emptyTitle}
              </p>
              <p className="max-w-md text-xs text-(--vaasenk-muted)">
                {MSG.emptyBody}
              </p>
            </div>
          ) : (
            <ul role="list" className="space-y-2">
              {items.map((sp) => {
                const selected = data.samplePaperIds.includes(sp.id);
                const disabled =
                  !selected && data.samplePaperIds.length >= MAX_SELECTED;
                return (
                  <li key={sp.id}>
                    <label
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-2xl border bg-white/85 px-4 py-3 text-sm transition-colors',
                        selected
                          ? 'border-(--vaasenk-red)/50 bg-(--vaasenk-rose-wash) shadow-[0_4px_18px_rgba(160,0,0,0.10)]'
                          : 'border-(--vaasenk-line-sand) hover:border-(--vaasenk-red)/30',
                        disabled && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={disabled}
                        onChange={() => toggleSelection(sp.id)}
                        className="mt-1 size-4 cursor-pointer accent-(--vaasenk-red) disabled:cursor-not-allowed"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-(--vaasenk-ink)">
                          {sp.name}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-(--vaasenk-muted)">
                          <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-(--vaasenk-deep-maroon)">
                            {EXAM_TYPE_LABELS[sp.examType]}
                          </span>
                          {sp.year ? (
                            <span>{MSG.yearLabel(sp.year)}</span>
                          ) : null}
                          {sp.priority === 'high' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-(--vaasenk-gold)/20 px-2 py-0.5 text-[11px] font-semibold text-(--vaasenk-deep-maroon)">
                              <Flame className="size-3" aria-hidden />
                              {MSG.priorityHigh}
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {/* Source note */}
      <p
        id={`${groupName}-helper`}
        className="rounded-2xl border border-dashed border-(--vaasenk-line-sand) bg-white/45 px-4 py-2.5 text-xs text-(--vaasenk-muted)"
      >
        {MSG.sourceNote(
          syllabusName,
          data.useSamplePapers ? data.samplePaperIds.length : 0,
        )}
      </p>
    </div>
  );
}

function ModeOption({
  name,
  checked,
  onChange,
  icon,
  title,
  helper,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  icon: React.ReactNode;
  title: string;
  helper: string;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-2xl border bg-white/80 px-4 py-3 transition-colors',
        checked
          ? 'border-(--vaasenk-red)/50 bg-(--vaasenk-rose-wash) shadow-[0_4px_18px_rgba(160,0,0,0.10)]'
          : 'border-(--vaasenk-line-sand) hover:border-(--vaasenk-red)/30',
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-1 size-4 cursor-pointer accent-(--vaasenk-red)"
      />
      <span className="flex-1">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-(--vaasenk-deep-maroon)">
          {icon}
          {title}
        </span>
        <span className="mt-1 block text-xs text-(--vaasenk-muted)">
          {helper}
        </span>
      </span>
    </label>
  );
}
