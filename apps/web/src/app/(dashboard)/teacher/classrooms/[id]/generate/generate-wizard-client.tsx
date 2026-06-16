'use client';

import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileDown,
  Info,
  Loader2,
  Settings2,
  Sparkles,
  Wand2,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { GlassCard } from '@/components/ui/glass-card';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { VaasenkButton } from '@/components/ui/vaasenk-button';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { StepExamConfig } from './step-exam-config';
import { StepExport } from './step-export';
import { StepGenerate } from './step-generate';
import { StepPortionSelection } from './step-portion-selection';
import { StepPreviewEdit } from './step-preview-edit';
import { StepSampleGuidance } from './step-sample-guidance';
import {
  STEPS,
  defaultWizardData,
  type ClassroomLite,
  type QuestionPaperDetail,
  type QuestionPaperJob,
  type StepIndex,
  type WizardData,
} from './wizard-types';

/**
 * Question Paper Generator wizard client.
 *
 * Owns:
 *  - The 6-step state machine
 *  - Wizard data (persisted to sessionStorage so an accidental refresh
 *    doesn't lose progress)
 *  - The polling loop for the generation job (2s interval)
 *  - Sequencing of POST /generate → poll → fetch detail → step 5
 *
 * The page chrome (Teacher Orange hero + stepper + footer nav) lives here.
 */

const MSG = {
  eyebrow: 'AI Question Paper Generator',
  back: 'Back',
  next: 'Next',
  cancel: 'Back to classroom',
  startOver: 'Start over',
  disclaimer: 'AI can make mistakes. Verify questions before publishing.',
  stepCount: (n: number, total: number, label: string) =>
    `Step ${n} of ${total} — ${label}`,
  fillRequired: 'Complete the fields above to continue.',
  fixIssues: 'Fix the issues above to continue.',
  marksMismatch:
    "Marks don't add up to the total. Adjust your question types in step 2.",

  // Bootstrap
  loadingClassroom: 'Loading classroom…',
  errorTitle: 'Couldn’t load this classroom',
  errorRetry: 'Retry',

  // Guard rails
  noSyllabusTitle: 'No syllabus mapped to this classroom',
  noSyllabusBody:
    'Ask your admin to map a syllabus before generating papers. Vaasenk AI needs syllabus context to ground questions.',
  noSyllabusCta: 'Back to classroom',
  syllabusProcessingTitle: 'Syllabus is still being indexed',
  syllabusProcessingBody:
    'Paper generation needs an AI-ready syllabus. This usually takes 1–2 minutes after upload.',
  syllabusFailedTitle: 'Syllabus indexing failed',
  syllabusFailedBody:
    'Ask your admin to re-process the syllabus from the admin library.',

  // Generate flow
  submitFailed: 'Couldn’t start generation.',
} as const;

const SESSION_KEY_PREFIX = 'vaasenk:gen-wizard:';

const STEP_ICONS = [
  BookOpenCheck,
  Settings2,
  ClipboardList,
  Wand2,
  Eye,
  FileDown,
] as const;

const STEP_HELPERS: Record<StepIndex, string> = {
  0: 'Pick what to test — chapters, topics, or the whole syllabus.',
  1: 'Tell Vaasenk AI the marks, duration, and the mix of question types.',
  2: 'Optionally guide the AI with prior question papers your admin uploaded.',
  3: 'Vaasenk AI is drafting your paper. Hang tight.',
  4: 'Review the paper. Edit or regenerate anything you want to change.',
  5: 'Export the PDFs and publish to the classroom when you’re ready.',
};

// ---------------------------------------------------------------------------

export function GenerateWizardClient({ classroomId }: { classroomId: string }) {
  // ---- Bootstrap state ----
  const [bootstrapping, setBootstrapping] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [classroom, setClassroom] = useState<ClassroomLite | null>(null);

  // ---- Wizard state ----
  const [step, setStep] = useState<StepIndex>(0);
  const [data, setData] = useState<WizardData>(defaultWizardData);

  // ---- Generation state ----
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [job, setJob] = useState<QuestionPaperJob | null>(null);
  const [paper, setPaper] = useState<QuestionPaperDetail | null>(null);

  const sessionKey = `${SESSION_KEY_PREFIX}${classroomId}`;
  const sessionLoadedRef = useRef(false);

  // -------------------------------------------------------------------------
  // Rehydrate wizard state from sessionStorage on first mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (sessionLoadedRef.current) return;
    sessionLoadedRef.current = true;
    if (typeof window === 'undefined') return;
    try {
      const raw = window.sessionStorage.getItem(sessionKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        step?: StepIndex;
        data?: WizardData;
      };
      if (parsed?.data) {
        setData({ ...defaultWizardData(), ...parsed.data });
      }
      // Don't restore steps 3–5 — those depend on a live job/paper which we
      // don't persist. If the user reloaded mid-generation, drop them back
      // to step 2 (config) so they can re-submit cleanly.
      if (typeof parsed.step === 'number') {
        const restored = parsed.step;
        setStep(restored >= 3 ? 1 : (restored as StepIndex));
      }
    } catch {
      // Corrupt blob — ignore.
    }
  }, [sessionKey]);

  // Persist on every change.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!sessionLoadedRef.current) return;
    try {
      window.sessionStorage.setItem(
        sessionKey,
        JSON.stringify({
          step,
          data: { ...data, jobId: null }, // never persist job id
        }),
      );
    } catch {
      // Quota exceeded — fine to skip.
    }
  }, [sessionKey, step, data]);

  const clearSession = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.removeItem(sessionKey);
    } catch {
      // Best-effort.
    }
  }, [sessionKey]);

  // -------------------------------------------------------------------------
  // Load classroom
  // -------------------------------------------------------------------------
  const loadClassroom = useCallback(async () => {
    setBootstrapping(true);
    setBootstrapError(null);
    try {
      const res = await apiFetch<{ classroom: ClassroomLite }>(
        `/api/v1/classrooms/${classroomId}`,
      );
      setClassroom(res.classroom);
    } catch (err) {
      setBootstrapError(
        err instanceof Error
          ? err.message
          : 'Could not load this classroom.',
      );
    } finally {
      setBootstrapping(false);
    }
  }, [classroomId]);

  useEffect(() => {
    loadClassroom();
  }, [loadClassroom]);

  // -------------------------------------------------------------------------
  // Validation per step (drives the Disabled state of the Next button)
  // -------------------------------------------------------------------------
  const validForStep = useMemo<Record<StepIndex, boolean>>(() => {
    const portionsOk = data.wholeSyllabus || data.portions.length > 0;

    const subtotal = data.questionTypes.reduce(
      (acc, r) => acc + Number(r.count || 0) * Number(r.marksEach || 0),
      0,
    );
    const marksMatched = subtotal === data.totalMarks;
    const rowsValid =
      data.questionTypes.length >= 1 &&
      data.questionTypes.length <= 20 &&
      data.questionTypes.every(
        (r) => r.type.trim().length > 0 && r.count > 0 && r.marksEach > 0,
      );
    const marksBoundsOk = data.totalMarks >= 10 && data.totalMarks <= 500;
    const durationOk =
      data.durationMinutes === null ||
      (data.durationMinutes >= 15 && data.durationMinutes <= 360);
    const diffOk =
      !data.customizeDifficulty ||
      data.difficulty.easy +
        data.difficulty.medium +
        data.difficulty.hard ===
        100;

    const configOk =
      rowsValid && marksMatched && marksBoundsOk && durationOk && diffOk;

    return {
      0: portionsOk,
      1: configOk,
      2: true, // optional — always allow Next
      3: job?.status === 'COMPLETED',
      4: Boolean(paper),
      5: Boolean(paper),
    };
  }, [data, job?.status, paper]);

  // -------------------------------------------------------------------------
  // Polling — only active when step 4 with a jobId
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (step !== 3 || !data.jobId) return;
    if (job?.status === 'COMPLETED' || job?.status === 'FAILED') return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const res = await apiFetch<{ job: QuestionPaperJob }>(
          `/api/v1/question-papers/jobs/${data.jobId}`,
        );
        if (cancelled) return;
        setJob(res.job);
        if (res.job.status === 'COMPLETED' && res.job.paper) {
          setPaper(res.job.paper);
          // Auto-advance to step 5 after a tiny pause so the success
          // state is perceivable.
          window.setTimeout(() => {
            if (cancelled) return;
            setStep(4);
          }, 600);
          return;
        }
        if (res.job.status === 'FAILED') return;
        timer = setTimeout(poll, 2000);
      } catch (err) {
        if (cancelled) return;
        // Network blip — try again in 3s.
        setJob((prev) =>
          prev
            ? {
                ...prev,
                errorMessage:
                  err instanceof Error
                    ? err.message
                    : 'Network error while polling.',
              }
            : prev,
        );
        timer = setTimeout(poll, 3000);
      }
    };

    timer = setTimeout(poll, 800);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [step, data.jobId, job?.status]);

  // -------------------------------------------------------------------------
  // Submit generation when entering step 4
  // -------------------------------------------------------------------------
  const submitGeneration = useCallback(async () => {
    if (!classroom?.syllabus?.id) return;
    setSubmitting(true);
    setSubmitError(null);
    setJob(null);
    setPaper(null);
    try {
      const portionsPayload = data.wholeSyllabus
        ? ['Whole syllabus']
        : data.portions;
      const body = {
        syllabusId: classroom.syllabus.id,
        portions: portionsPayload,
        examType: data.examType,
        totalMarks: data.totalMarks,
        ...(data.durationMinutes !== null
          ? { durationMinutes: data.durationMinutes }
          : {}),
        questionTypes: data.questionTypes.map((r) => ({
          type: r.type.trim(),
          count: r.count,
          marksEach: r.marksEach,
        })),
        ...(data.customizeDifficulty
          ? { difficulty: data.difficulty }
          : {}),
        ...(data.useSamplePapers && data.samplePaperIds.length > 0
          ? { samplePaperIds: data.samplePaperIds }
          : {}),
        includeAnswerKey: data.includeAnswerKey,
      };
      const res = await apiFetch<{ job: QuestionPaperJob }>(
        `/api/v1/classrooms/${classroomId}/question-papers/generate`,
        { method: 'POST', body },
      );
      setJob(res.job);
      setData((d) => ({ ...d, jobId: res.job.id }));
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : MSG.submitFailed;
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }, [classroom?.syllabus?.id, classroomId, data]);

  // Kick off generation on entering step 4 (idempotent — only fires when
  // we don't yet have a jobId).
  useEffect(() => {
    if (step !== 3) return;
    if (data.jobId) return;
    if (submitting) return;
    void submitGeneration();
  }, [step, data.jobId, submitting, submitGeneration]);

  // -------------------------------------------------------------------------
  // Step navigation
  // -------------------------------------------------------------------------
  const goNext = () => {
    if (!validForStep[step]) return;
    if (step === 5) return;
    setStep((s) => (s + 1) as StepIndex);
  };

  const goBack = () => {
    if (step === 0) return;
    // From step 4 (Preview) or step 5 (Export), allow back to step 2 (config)
    // — this is the "Edit Configuration" path per instructions.
    if (step >= 4) {
      setStep(1);
      return;
    }
    if (step === 3) {
      // From generating, allow cancel back to step 2 only if it's failed.
      if (job?.status === 'FAILED' || submitError) {
        setStep(1);
        setJob(null);
        setSubmitError(null);
        setData((d) => ({ ...d, jobId: null }));
      }
      return;
    }
    setStep((s) => Math.max(0, s - 1) as StepIndex);
  };

  // Allow stepper clicks to jump to ALREADY-VISITED steps only.
  const handleStepperClick = (i: StepIndex) => {
    if (i > step) return;
    if (step === 3 && job?.status === 'RUNNING') return; // don't escape mid-gen
    setStep(i);
  };

  const onPublished = () => {
    clearSession();
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (bootstrapping) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <LoadingSkeleton className="h-44 w-full rounded-[28px]" />
        <LoadingSkeleton className="h-14 w-full" />
        <GlassCard padding="lg">
          <LoadingSkeleton variant="text" className="w-1/3" />
          <LoadingSkeleton variant="text" className="mt-2 w-2/3" />
          <div className="mt-6 space-y-3">
            <LoadingSkeleton className="h-12 w-full" />
            <LoadingSkeleton className="h-12 w-full" />
            <LoadingSkeleton className="h-12 w-full" />
          </div>
        </GlassCard>
      </div>
    );
  }

  if (bootstrapError) {
    return (
      <div className="mx-auto max-w-3xl">
        <GlassCard padding="lg">
          <p
            role="alert"
            className="rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-4 py-3 text-sm text-(--vaasenk-danger)"
          >
            <span className="font-semibold">{MSG.errorTitle}</span>
            <span className="mt-1 block text-xs opacity-90">
              {bootstrapError}
            </span>
          </p>
          <div className="mt-4">
            <VaasenkButton variant="secondary" size="sm" onClick={loadClassroom}>
              {MSG.errorRetry}
            </VaasenkButton>
          </div>
        </GlassCard>
      </div>
    );
  }

  if (!classroom) return null;

  // Syllabus guard rails — paper generation requires a mapped + indexed syllabus.
  if (!classroom.syllabus) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<AlertCircle className="size-7" />}
          title={MSG.noSyllabusTitle}
          description={MSG.noSyllabusBody}
          action={{
            label: MSG.noSyllabusCta,
            href: `/teacher/classrooms/${classroomId}`,
          }}
        />
      </div>
    );
  }

  if (
    classroom.syllabus.status === 'UPLOADED' ||
    classroom.syllabus.status === 'PROCESSING'
  ) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<Loader2 className="size-7 animate-spin" />}
          title={MSG.syllabusProcessingTitle}
          description={MSG.syllabusProcessingBody}
          action={{
            label: MSG.cancel,
            href: `/teacher/classrooms/${classroomId}`,
          }}
        />
      </div>
    );
  }

  if (classroom.syllabus.status === 'FAILED') {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<AlertTriangle className="size-7" />}
          title={MSG.syllabusFailedTitle}
          description={MSG.syllabusFailedBody}
          action={{
            label: MSG.cancel,
            href: `/teacher/classrooms/${classroomId}`,
          }}
        />
      </div>
    );
  }

  const currentStep = STEPS[step];
  const classroomLabel = formatClassroomLabel(classroom);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      {/* Teacher Orange hero */}
      <section
        aria-labelledby="generate-hero-title"
        className={cn(
          'relative overflow-hidden rounded-[28px] p-6 text-white sm:p-7',
          'bg-(image:--gradient-teacher-orange)',
          'shadow-[0_24px_60px_rgba(160,0,0,0.24)]',
        )}
      >
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 max-w-2xl items-start gap-3">
            <span
              aria-hidden
              className="mt-1 grid size-11 shrink-0 place-items-center rounded-2xl bg-white/15 text-(--vaasenk-gold) shadow-[inset_0_0_0_1px_rgba(254,202,2,0.30)]"
            >
              <Sparkles className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-white/80">
                {MSG.eyebrow}
              </p>
              <h1
                id="generate-hero-title"
                className="mt-1 truncate text-2xl font-semibold tracking-tight sm:text-3xl"
              >
                {classroomLabel}
              </h1>
              <p className="mt-2 text-sm text-white/85">
                {MSG.stepCount(step + 1, STEPS.length, currentStep.label)} ·{' '}
                {STEP_HELPERS[step]}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <span className="inline-flex max-w-xs items-center gap-2 rounded-full border border-white/25 bg-white/15 px-3 py-1.5 text-xs font-medium text-white/95 backdrop-blur">
              <Info className="size-3.5 shrink-0" aria-hidden />
              <span className="line-clamp-2 text-left sm:text-right">
                {MSG.disclaimer}
              </span>
            </span>
            <Link href={`/teacher/classrooms/${classroomId}`}>
              <VaasenkButton variant="secondary" size="sm">
                <ArrowLeft className="size-4" />
                {MSG.cancel}
              </VaasenkButton>
            </Link>
          </div>
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-(--vaasenk-gold)/30 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 left-1/3 size-56 rounded-full bg-white/15 blur-3xl"
        />
      </section>

      {/* Stepper */}
      <Stepper
        current={step}
        onStepClick={handleStepperClick}
        disabledFor={(i) =>
          i > step || (step === 3 && job?.status === 'RUNNING')
        }
      />

      {/* Step body */}
      <GlassCard
        padding="lg"
        aria-busy={submitting}
        aria-labelledby="wizard-step-heading"
      >
        <h2 id="wizard-step-heading" className="sr-only">
          {currentStep.label}
        </h2>

        {step === 0 ? (
          <StepPortionSelection
            data={data}
            onChange={(patch) => setData((d) => ({ ...d, ...patch }))}
          />
        ) : null}
        {step === 1 ? (
          <StepExamConfig
            data={data}
            onChange={(patch) => setData((d) => ({ ...d, ...patch }))}
          />
        ) : null}
        {step === 2 ? (
          <StepSampleGuidance
            data={data}
            onChange={(patch) => setData((d) => ({ ...d, ...patch }))}
            classId={classroom.class?.id ?? null}
            subjectId={classroom.subject?.id ?? null}
            syllabusName={classroom.syllabus?.name ?? null}
          />
        ) : null}
        {step === 3 ? (
          <StepGenerate
            job={job}
            submitting={submitting}
            submitError={submitError}
            onRetryConfig={() => {
              setStep(1);
              setJob(null);
              setSubmitError(null);
              setData((d) => ({ ...d, jobId: null }));
            }}
          />
        ) : null}
        {step === 4 && paper ? (
          <StepPreviewEdit
            paper={paper}
            onPaperUpdate={setPaper}
            wizardData={data}
          />
        ) : null}
        {step === 5 && paper ? (
          <StepExport
            paper={paper}
            classroomId={classroomId}
            wizardData={data}
            onPaperUpdate={setPaper}
            onPublished={onPublished}
          />
        ) : null}

        {/* Disabled-state explainer */}
        {!validForStep[step] && step < 3 ? (
          <p className="mt-5 text-xs text-(--vaasenk-subtle)">
            {step === 1 ? MSG.fixIssues : MSG.fillRequired}
          </p>
        ) : null}
      </GlassCard>

      {/* Footer nav */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <VaasenkButton
          variant="secondary"
          size="md"
          onClick={goBack}
          disabled={
            step === 0 ||
            (step === 3 && job?.status === 'RUNNING') ||
            submitting
          }
        >
          <ArrowLeft className="size-4" />
          {step >= 4 ? 'Edit configuration' : MSG.back}
        </VaasenkButton>

        <div className="flex items-center gap-3">
          {step >= 4 ? null : step === 3 ? (
            <span
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-1.5 text-xs text-(--vaasenk-muted)"
            >
              {job?.status === 'COMPLETED' ? (
                <>
                  <CheckCircle2 className="size-3.5 text-(--vaasenk-success)" />
                  Advancing to preview…
                </>
              ) : (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Vaasenk AI is working
                </>
              )}
            </span>
          ) : (
            <VaasenkButton
              variant="primary"
              size="md"
              onClick={goNext}
              disabled={!validForStep[step]}
            >
              {MSG.next}
              <ArrowRight className="size-4" />
            </VaasenkButton>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

function Stepper({
  current,
  onStepClick,
  disabledFor,
}: {
  current: StepIndex;
  onStepClick: (i: StepIndex) => void;
  disabledFor: (i: StepIndex) => boolean;
}) {
  return (
    <nav aria-label="Generator progress">
      <ol className="flex items-center gap-2 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
          const Icon = STEP_ICONS[i] ?? Sparkles;
          const state =
            i < current ? 'done' : i === current ? 'current' : 'todo';
          const disabled = disabledFor(i as StepIndex);
          return (
            <li key={s.key} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => onStepClick(i as StepIndex)}
                disabled={disabled || i === current}
                aria-current={state === 'current' ? 'step' : undefined}
                aria-label={`Step ${i + 1} ${s.label}${state === 'done' ? ' (completed)' : ''}`}
                className={cn(
                  'flex min-w-0 cursor-pointer items-center gap-2.5 rounded-full px-3 py-2 text-sm font-medium transition-colors',
                  state === 'current' &&
                    'bg-(image:--gradient-brand-flame) text-white shadow-[0_6px_18px_rgba(160,0,0,0.22)]',
                  state === 'done' &&
                    'bg-(--vaasenk-success)/12 text-(--vaasenk-success) hover:bg-(--vaasenk-success)/20',
                  state === 'todo' &&
                    'border border-(--vaasenk-line-sand) bg-white/60 text-(--vaasenk-subtle)',
                  disabled && 'cursor-not-allowed opacity-90',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'grid size-6 shrink-0 place-items-center rounded-full',
                    state === 'current' && 'bg-white/20',
                    state === 'done' && 'bg-(--vaasenk-success)/15',
                    state === 'todo' && 'bg-(--vaasenk-line-sand)/60',
                  )}
                >
                  {state === 'done' ? (
                    <CheckCircle2 className="size-3.5" />
                  ) : (
                    <Icon className="size-3.5" />
                  )}
                </span>
                <span className="hidden truncate sm:inline">{s.label}</span>
                <span className="sm:hidden">{i + 1}</span>
              </button>
              {i < STEPS.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    'hidden h-px flex-1 rounded-full sm:block',
                    i < current
                      ? 'bg-(--vaasenk-success)/40'
                      : 'bg-(--vaasenk-line-sand)',
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatClassroomLabel(c: ClassroomLite): string {
  const bits: string[] = [];
  if (c.class?.name) bits.push(c.class.name);
  if (c.section?.name) bits.push(`Section ${c.section.name}`);
  if (c.subject?.name) bits.push(c.subject.name);
  if (bits.length === 0) return c.name;
  return bits.join(' · ');
}
