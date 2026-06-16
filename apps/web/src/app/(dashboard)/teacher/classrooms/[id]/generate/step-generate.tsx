'use client';

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  Layers,
  Loader2,
  PenTool,
  Save,
} from 'lucide-react';
import { useMemo } from 'react';
import { VaasenkButton } from '@/components/ui/vaasenk-button';
import { cn } from '@/lib/utils';
import {
  GENERATION_MILESTONES,
  type QuestionPaperJob,
} from './wizard-types';

/**
 * Step 4 — Generate.
 *
 * Renders the polling progress UI. The parent owns the polling loop and
 * passes down the latest job snapshot — this component is presentational.
 *
 * States rendered:
 *   • Submitting (no job yet — we're posting /generate)
 *   • Running   (job.status = PENDING / RUNNING, milestone ticker)
 *   • Failed    (job.status = FAILED, retry CTA)
 *   • Completed (job.status = COMPLETED — parent auto-advances, but we
 *     briefly show a success state in case there's a settle delay)
 */

const MSG = {
  heading: 'Generating your paper',
  helper:
    'Vaasenk AI is drafting your question paper from the syllabus you mapped. This usually takes 30–90 seconds.',
  preparing: 'Submitting your configuration',
  preparingHelper:
    'Hang tight — we’re sending your inputs to the question paper generator.',
  cancelHint:
    'You can’t cancel generation once it’s running. Hang on — it’ll only take a minute.',
  failedTitle: 'Generation failed',
  failedRetry: 'Edit configuration and try again',
  completed: 'Paper generated successfully',
  completedHint: 'Switching to preview…',
} as const;

const MILESTONE_ICONS = [
  FileSearch,
  Layers,
  PenTool,
  ClipboardCheck,
  Save,
] as const;

export function StepGenerate({
  job,
  submitting,
  submitError,
  onRetryConfig,
}: {
  job: QuestionPaperJob | null;
  submitting: boolean;
  submitError: string | null;
  onRetryConfig: () => void;
}) {
  const percentage = useMemo(() => {
    if (!job) return 0;
    if (job.status === 'COMPLETED') return 100;
    return Math.max(0, Math.min(100, job.progress?.percentage ?? 5));
  }, [job]);

  const stepLabel = job?.progress?.step ?? MSG.preparing;
  const failed = job?.status === 'FAILED' || Boolean(submitError);

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight text-(--vaasenk-ink)">
          {MSG.heading}
        </h2>
        <p className="text-sm text-(--vaasenk-muted)">{MSG.helper}</p>
      </header>

      {failed ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-3xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-5 py-5 text-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-(--vaasenk-danger)/20 text-(--vaasenk-danger)">
              <AlertTriangle className="size-5" aria-hidden />
            </span>
            <div>
              <p className="font-semibold text-(--vaasenk-danger)">
                {MSG.failedTitle}
              </p>
              <p className="mt-1 text-xs text-(--vaasenk-danger)/90 sm:text-sm">
                {submitError ??
                  job?.errorMessage ??
                  'Something went wrong while generating your paper.'}
              </p>
            </div>
          </div>
          <VaasenkButton variant="secondary" size="md" onClick={onRetryConfig}>
            {MSG.failedRetry}
          </VaasenkButton>
        </div>
      ) : (
        <div
          role="status"
          aria-live="polite"
          aria-busy={job?.status !== 'COMPLETED'}
          className={cn(
            'relative overflow-hidden rounded-3xl border border-(--vaasenk-line-sand) p-6 sm:p-8',
            'bg-(image:--gradient-deep-ai-glow) text-white',
            'shadow-[0_24px_60px_rgba(90,0,19,0.30)]',
          )}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-(--vaasenk-gold)/30 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-20 -left-10 size-56 rounded-full bg-(--vaasenk-deep-maroon)/40 blur-3xl"
          />

          <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-white/15 text-white backdrop-blur">
              {job?.status === 'COMPLETED' ? (
                <CheckCircle2 className="size-7" aria-hidden />
              ) : (
                <Loader2 className="size-7 animate-spin" aria-hidden />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wider text-white/70">
                {job?.status === 'COMPLETED' ? 'Done' : 'In progress'}
              </p>
              <p className="mt-1 text-lg font-semibold tracking-tight">
                {job?.status === 'COMPLETED' ? MSG.completed : stepLabel}
              </p>
              <p className="mt-1 text-sm text-white/80">
                {job?.status === 'COMPLETED'
                  ? MSG.completedHint
                  : submitting && !job
                    ? MSG.preparingHelper
                    : MSG.cancelHint}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="relative z-10 mt-6">
            <div
              role="progressbar"
              aria-valuenow={percentage}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Generation progress"
              className="h-2 w-full overflow-hidden rounded-full bg-white/15"
            >
              <div
                style={{ width: `${percentage}%` }}
                className="h-full bg-(--vaasenk-gold) transition-[width] duration-700 ease-out"
              />
            </div>
            <p className="mt-2 text-xs text-white/70">{percentage}%</p>
          </div>
        </div>
      )}

      {/* Milestones */}
      {!failed ? (
        <ol className="space-y-2" aria-label="Generation milestones">
          {GENERATION_MILESTONES.map((m, i) => {
            const Icon = MILESTONE_ICONS[i] ?? Save;
            const done =
              job?.status === 'COMPLETED' || percentage >= m.threshold;
            const active =
              !done && (job?.progress?.step === m.step || percentage < m.threshold && (i === 0 || percentage >= GENERATION_MILESTONES[i - 1]!.threshold));
            return (
              <li
                key={m.step}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition-colors',
                  done
                    ? 'border-(--vaasenk-success)/30 bg-(--vaasenk-success)/8 text-(--vaasenk-success)'
                    : active
                      ? 'border-(--vaasenk-red)/30 bg-(--vaasenk-rose-wash) text-(--vaasenk-deep-maroon)'
                      : 'border-(--vaasenk-line-sand) bg-white/55 text-(--vaasenk-subtle)',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'grid size-8 shrink-0 place-items-center rounded-xl',
                    done
                      ? 'bg-(--vaasenk-success)/15 text-(--vaasenk-success)'
                      : active
                        ? 'bg-white text-(--vaasenk-deep-maroon)'
                        : 'bg-(--vaasenk-line-sand)/60 text-(--vaasenk-subtle)',
                  )}
                >
                  {done ? (
                    <CheckCircle2 className="size-4" />
                  ) : active ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Icon className="size-4" />
                  )}
                </span>
                <span className="font-medium">{m.step}</span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
