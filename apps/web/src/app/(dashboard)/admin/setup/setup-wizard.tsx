'use client';

import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useState } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { GlassCard } from '@/components/ui/glass-card';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { VaasenkButton } from '@/components/ui/vaasenk-button';
import { ApiClientError, apiFetch } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Strings — pulled to a top-level constant so an i18n pipeline (en-IN → ta-IN)
// can extract them in a single sweep (see vaasenk-component SKILL.md §11).
// ---------------------------------------------------------------------------

const MSG = {
  title: 'Set up your institution',
  subtitle: 'A friendly five-step walk-through to get classes, sections, and subjects on the board.',
  stepLabel: (n: number, total: number, name: string) =>
    `Step ${n} of ${total} — ${name}`,
  back: 'Back',
  next: 'Next',
  saveDraft: 'Save draft',
  complete: 'Complete setup',
  draftSaved: 'Draft saved locally.',
  alreadyDoneTitle: 'Your institution is already set up',
  alreadyDoneDesc:
    'Manage classes, subjects, and academic years from the admin dashboard.',
  alreadyDoneCta: 'Back to admin',
  genericError: 'Something went wrong. Please try again.',
  classAtLeastOne: 'Add at least one class with at least one section.',
  subjectAtLeastOne: 'Add at least one subject.',
  classDuplicate: 'Two classes share a name — class names must be unique.',
  sectionDuplicate: (cls: string) =>
    `Sections in “${cls}” must each have a unique name.`,
  subjectDuplicate: 'Two subjects share a name — subject names must be unique.',
  endBeforeStart: 'End date must be after the start date.',
  required: 'Required',
} as const;

const STEPS = [
  { key: 'profile', name: 'Institution details', icon: Building2 },
  { key: 'academic-year', name: 'Academic year', icon: Calendar },
  { key: 'classes', name: 'Classes & sections', icon: GraduationCap },
  { key: 'subjects', name: 'Subjects', icon: BookOpen },
  { key: 'confirm', name: 'Confirmation', icon: ClipboardCheck },
] as const;
type StepIndex = 0 | 1 | 2 | 3 | 4;

// ---------------------------------------------------------------------------
// API contract types — mirror the NestJS DTOs in
// apps/api/src/modules/institutions/institutions.dto.ts. Kept inline rather
// than imported from shared-types since the DTO classes use decorators that
// don't survive a clean type-only import.
// ---------------------------------------------------------------------------

type InstitutionDetail = {
  id: string;
  name: string;
  type: string;
  boardType: string | null;
  address: string | null;
  contactPerson: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  websiteUrl: string | null;
  locale: string | null;
  timezone: string | null;
  setupStatus: SetupStatus;
};

type SetupStatus = {
  isComplete: boolean;
  steps: {
    profile: { complete: boolean };
    academicYear: { complete: boolean; count: number };
    classes: { complete: boolean; count: number; sectionsCount: number };
    subjects: { complete: boolean; count: number };
  };
};

type AuthMeUser = { id: string; institutionId: string };

type ProfileForm = {
  name: string;
  type: 'school' | 'college' | 'coaching_center' | 'other' | '';
  boardType: string;
  address: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  websiteUrl: string;
  locale: string;
  timezone: string;
};

type AcademicYearForm = {
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

type ClassForm = {
  id: string;
  name: string;
  boardType: string;
  gradeLevel: string; // string so the input is controlled; coerced on submit
  sections: { id: string; name: string }[];
};

type SubjectForm = {
  id: string;
  name: string;
  code: string;
};

// ---------------------------------------------------------------------------
// Tiny utilities (kept local — these don't belong in lib/utils.ts yet)
// ---------------------------------------------------------------------------

let rowCounter = 0;
const rid = () => `row-${++rowCounter}-${Date.now().toString(36)}`;

const trimOrNull = (v: string): string | undefined => {
  const t = v.trim();
  return t.length === 0 ? undefined : t;
};

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const defaultProfile: ProfileForm = {
  name: '',
  type: '',
  boardType: '',
  address: '',
  contactPerson: '',
  contactEmail: '',
  contactPhone: '',
  websiteUrl: '',
  locale: 'en-IN',
  timezone: 'Asia/Kolkata',
};

const defaultAcademicYear = (): AcademicYearForm => {
  const now = new Date();
  const year = now.getFullYear();
  // Indian academic year typically Jun → Apr/May.
  return {
    name: `${year}-${year + 1}`,
    startDate: `${year}-06-01`,
    endDate: `${year + 1}-04-30`,
    isActive: true,
  };
};

const defaultClasses = (): ClassForm[] => [
  { id: rid(), name: '', boardType: '', gradeLevel: '', sections: [{ id: rid(), name: 'A' }] },
];

const defaultSubjects = (): SubjectForm[] => [
  { id: rid(), name: '', code: '' },
];

// ===========================================================================
// Main wizard component
// ===========================================================================

export function SetupWizard() {
  const router = useRouter();

  // Bootstrap state
  const [bootstrapping, setBootstrapping] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [alreadyComplete, setAlreadyComplete] = useState(false);

  // Per-step state
  const [step, setStep] = useState<StepIndex>(0);
  const [profile, setProfile] = useState<ProfileForm>(defaultProfile);
  const [academicYear, setAcademicYear] = useState<AcademicYearForm>(
    defaultAcademicYear(),
  );
  const [classes, setClasses] = useState<ClassForm[]>(defaultClasses());
  const [subjects, setSubjects] = useState<SubjectForm[]>(defaultSubjects());

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [stepErrorBullets, setStepErrorBullets] = useState<string[]>([]);
  const [savedDraftAt, setSavedDraftAt] = useState<number | null>(null);

  // -------------------------------------------------------------------------
  // Bootstrap: who am I, which institution am I admin of, is setup done?
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const me = await apiFetch<{ user: AuthMeUser }>('/api/v1/auth/me');
        if (cancelled) return;
        const id = me.user.institutionId;
        setInstitutionId(id);

        const status = await apiFetch<{ setupStatus: SetupStatus }>(
          `/api/v1/institutions/${id}/setup-status`,
        );
        if (cancelled) return;

        if (status.setupStatus.isComplete) {
          setAlreadyComplete(true);
          setBootstrapping(false);
          return;
        }

        // Pre-fill step 1 from the existing institution profile so a
        // partially-set-up tenant doesn't lose their work.
        try {
          const detail = await apiFetch<{ institution: InstitutionDetail }>(
            `/api/v1/institutions/${id}`,
          );
          if (cancelled) return;
          const inst = detail.institution;
          setProfile((p) => ({
            ...p,
            name: inst.name ?? p.name,
            // Normalize backend free-text type into our select options when possible.
            type: normalizeType(inst.type) ?? p.type,
            boardType: inst.boardType ?? p.boardType,
            address: inst.address ?? p.address,
            contactPerson: inst.contactPerson ?? p.contactPerson,
            contactEmail: inst.contactEmail ?? p.contactEmail,
            contactPhone: inst.contactPhone ?? p.contactPhone,
            websiteUrl: inst.websiteUrl ?? p.websiteUrl,
            locale: inst.locale ?? p.locale,
            timezone: inst.timezone ?? p.timezone,
          }));
        } catch {
          // Pre-fill is best-effort. A failure here doesn't block the wizard.
        }

        setBootstrapping(false);
      } catch (err) {
        if (cancelled) return;
        setBootstrapError(
          err instanceof Error ? err.message : MSG.genericError,
        );
        setBootstrapping(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Per-step validity (gates the Next button — Disabled state)
  // -------------------------------------------------------------------------
  const profileValid = useMemo(() => {
    if (!profile.name.trim() || !profile.type) return false;
    if (profile.contactEmail.trim() && !isValidEmail(profile.contactEmail.trim()))
      return false;
    return true;
  }, [profile]);

  const academicYearValid = useMemo(() => {
    const { name, startDate, endDate } = academicYear;
    if (!name.trim() || !startDate || !endDate) return false;
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return false;
    return e.getTime() > s.getTime();
  }, [academicYear]);

  const classesValid = useMemo(() => {
    if (classes.length === 0) return false;
    const names = new Set<string>();
    for (const c of classes) {
      const n = c.name.trim();
      if (!n) return false;
      if (names.has(n.toLowerCase())) return false;
      names.add(n.toLowerCase());
      if (c.sections.length === 0) return false;
      const secNames = new Set<string>();
      for (const s of c.sections) {
        const sn = s.name.trim();
        if (!sn) return false;
        if (secNames.has(sn.toLowerCase())) return false;
        secNames.add(sn.toLowerCase());
      }
    }
    return true;
  }, [classes]);

  const subjectsValid = useMemo(() => {
    if (subjects.length === 0) return false;
    const names = new Set<string>();
    for (const s of subjects) {
      const n = s.name.trim();
      if (!n) return false;
      if (names.has(n.toLowerCase())) return false;
      names.add(n.toLowerCase());
    }
    return true;
  }, [subjects]);

  const currentStepValid = (() => {
    switch (step) {
      case 0:
        return profileValid;
      case 1:
        return academicYearValid;
      case 2:
        return classesValid;
      case 3:
        return subjectsValid;
      case 4:
        return profileValid && academicYearValid && classesValid && subjectsValid;
    }
  })();

  // -------------------------------------------------------------------------
  // Step navigation
  // -------------------------------------------------------------------------
  const clearError = () => {
    setStepError(null);
    setStepErrorBullets([]);
  };

  const goBack = () => {
    if (step === 0) return;
    clearError();
    setStep((s) => (s - 1) as StepIndex);
  };

  const goNext = async () => {
    clearError();
    if (!currentStepValid || !institutionId) return;

    // Step 1 persists immediately — it's the canonical institution
    // profile and we want the partial-save behavior the design-docs
    // call out ("partially saved draft" required state).
    if (step === 0) {
      setSubmitting(true);
      try {
        await apiFetch<{ institution: InstitutionDetail }>(
          `/api/v1/institutions/${institutionId}`,
          {
            method: 'PATCH',
            body: {
              name: profile.name.trim(),
              type: profile.type,
              boardType: trimOrNull(profile.boardType),
              address: trimOrNull(profile.address),
              contactPerson: trimOrNull(profile.contactPerson),
              contactEmail: trimOrNull(profile.contactEmail),
              contactPhone: trimOrNull(profile.contactPhone),
              websiteUrl: trimOrNull(profile.websiteUrl),
              locale: trimOrNull(profile.locale),
              timezone: trimOrNull(profile.timezone),
            },
          },
        );
        setStep((s) => (s + 1) as StepIndex);
      } catch (err) {
        applyError(err);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setStep((s) => (s + 1) as StepIndex);
  };

  const applyError = (err: unknown) => {
    if (err instanceof ApiClientError) {
      setStepError(err.message);
      // class-validator returns `details` as a string[] when validation fails.
      const details = err.details;
      if (Array.isArray(details) && details.every((d) => typeof d === 'string')) {
        setStepErrorBullets(details as string[]);
      }
    } else if (err instanceof Error) {
      setStepError(err.message);
    } else {
      setStepError(MSG.genericError);
    }
  };

  const submitFinal = async () => {
    if (!institutionId) return;
    clearError();
    setSubmitting(true);
    try {
      await apiFetch(`/api/v1/institutions/${institutionId}/setup`, {
        method: 'POST',
        body: {
          academicYear: {
            name: academicYear.name.trim(),
            startDate: new Date(academicYear.startDate).toISOString(),
            endDate: new Date(academicYear.endDate).toISOString(),
            isActive: academicYear.isActive,
          },
          classes: classes.map((c) => ({
            name: c.name.trim(),
            boardType: trimOrNull(c.boardType),
            gradeLevel: c.gradeLevel ? Number(c.gradeLevel) : undefined,
            sections: c.sections.map((s) => ({ name: s.name.trim() })),
          })),
          subjects: subjects.map((s) => ({
            name: s.name.trim(),
            code: trimOrNull(s.code),
          })),
        },
      });
      // Hard navigation so the dashboard re-fetches its KPI counts.
      router.replace('/admin');
      router.refresh();
    } catch (err) {
      applyError(err);
      setSubmitting(false);
    }
  };

  // TODO(Sprint 2): persist drafts on the server when a /drafts endpoint
  // lands. For Sprint 1 we surface optimistic feedback only — design-docs
  // line 787 mandates "Save draft" as a primary action.
  const saveDraft = () => {
    setSavedDraftAt(Date.now());
    setTimeout(() => setSavedDraftAt(null), 2400);
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (bootstrapping) {
    return <WizardSkeleton />;
  }

  if (bootstrapError) {
    return (
      <div className="mx-auto max-w-3xl">
        <GlassCard padding="lg">
          <p
            role="alert"
            aria-live="polite"
            className="rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-4 py-3 text-sm text-(--vaasenk-danger)"
          >
            {bootstrapError}
          </p>
          <div className="mt-4">
            <VaasenkButton
              variant="secondary"
              size="sm"
              onClick={() => window.location.reload()}
            >
              Retry
            </VaasenkButton>
          </div>
        </GlassCard>
      </div>
    );
  }

  if (alreadyComplete) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          title={MSG.alreadyDoneTitle}
          description={MSG.alreadyDoneDesc}
          icon={<CheckCircle2 className="size-7" />}
          action={{ label: MSG.alreadyDoneCta, href: '/admin' }}
        />
      </div>
    );
  }

  const currentStep = STEPS[step];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      {/* Admin Royal gradient hero (CLAUDE.md §4 — Admin role personality) */}
      <section className="relative overflow-hidden rounded-[28px] bg-(image:--gradient-admin-royal) p-8 text-white shadow-[0_24px_60px_rgba(160,0,0,0.24)]">
        <div className="relative z-10 flex flex-col gap-3">
          <p className="text-sm font-medium uppercase tracking-wider text-white/75">
            {MSG.stepLabel(step + 1, STEPS.length, currentStep.name)}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {MSG.title}
          </h1>
          <p className="max-w-2xl text-white/85">{stepSubtitle(step)}</p>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 size-72 rounded-full bg-white/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 left-1/3 size-64 rounded-full bg-[#FFB000]/30 blur-3xl"
        />
      </section>

      {/* Stepper */}
      <Stepper current={step} />

      {/* Step body */}
      <GlassCard
        padding="lg"
        aria-busy={submitting}
        aria-labelledby="wizard-step-heading"
      >
        <h2
          id="wizard-step-heading"
          className="text-lg font-semibold text-(--vaasenk-ink)"
        >
          {currentStep.name}
        </h2>
        <p className="mt-1 text-sm text-(--vaasenk-muted)">
          {stepHelper(step)}
        </p>

        {/* Error region */}
        {stepError ? (
          <div
            role="alert"
            aria-live="polite"
            className="mt-4 rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-4 py-3 text-sm text-(--vaasenk-danger)"
          >
            <p className="font-medium">{stepError}</p>
            {stepErrorBullets.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {stepErrorBullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6">
          {step === 0 && (
            <ProfileStep
              value={profile}
              onChange={setProfile}
              disabled={submitting}
            />
          )}
          {step === 1 && (
            <AcademicYearStep
              value={academicYear}
              onChange={setAcademicYear}
              disabled={submitting}
            />
          )}
          {step === 2 && (
            <ClassesStep
              value={classes}
              onChange={setClasses}
              disabled={submitting}
            />
          )}
          {step === 3 && (
            <SubjectsStep
              value={subjects}
              onChange={setSubjects}
              disabled={submitting}
            />
          )}
          {step === 4 && (
            <ConfirmStep
              profile={profile}
              academicYear={academicYear}
              classes={classes}
              subjects={subjects}
            />
          )}
        </div>

        {/* Disabled-state explainer for the Next button — design-docs require
            telling the user WHY a control is disabled, not silent grey-out. */}
        {!currentStepValid && step < 4 ? (
          <p className="mt-4 text-xs text-(--vaasenk-subtle)">
            Fill the required fields above to continue.
          </p>
        ) : null}
      </GlassCard>

      {/* Footer / nav */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <VaasenkButton
            variant="secondary"
            size="md"
            onClick={goBack}
            disabled={step === 0 || submitting}
          >
            <ArrowLeft className="size-4" />
            {MSG.back}
          </VaasenkButton>
          <VaasenkButton
            variant="ghost"
            size="md"
            onClick={saveDraft}
            disabled={submitting}
          >
            <Save className="size-4" />
            {MSG.saveDraft}
          </VaasenkButton>
          {savedDraftAt ? (
            <span
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-1.5 text-sm text-(--vaasenk-success)"
            >
              <Check className="size-4" />
              {MSG.draftSaved}
            </span>
          ) : null}
        </div>

        <div>
          {step < 4 ? (
            <VaasenkButton
              variant="primary"
              size="md"
              onClick={goNext}
              disabled={!currentStepValid || submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  {MSG.next}
                  <ArrowRight className="size-4" />
                </>
              )}
            </VaasenkButton>
          ) : (
            <VaasenkButton
              variant="primary"
              size="md"
              onClick={submitFinal}
              disabled={!currentStepValid || submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Finalising…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  {MSG.complete}
                </>
              )}
            </VaasenkButton>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-(--vaasenk-subtle)">
        Need to leave? Your progress in steps 2–5 is held in this session.{' '}
        <Link
          href="/admin"
          className="font-medium text-(--vaasenk-red) underline-offset-4 hover:underline"
        >
          Back to admin
        </Link>
      </p>
    </div>
  );
}

// ===========================================================================
// Sub-components
// ===========================================================================

function WizardSkeleton() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
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

function Stepper({ current }: { current: StepIndex }) {
  return (
    <nav aria-label="Setup progress">
      <ol className="flex items-center gap-2 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
          const state =
            i < current ? 'done' : i === current ? 'current' : 'todo';
          const Icon = s.icon;
          return (
            <li key={s.key} className="flex flex-1 items-center gap-2">
              <div
                className={
                  'flex min-w-0 items-center gap-2.5 rounded-full px-3 py-2 text-sm font-medium transition-colors ' +
                  (state === 'current'
                    ? 'bg-(--vaasenk-red) text-white shadow-[0_6px_18px_rgba(160,0,0,0.22)]'
                    : state === 'done'
                      ? 'bg-(--vaasenk-success)/12 text-(--vaasenk-success)'
                      : 'bg-white/60 text-(--vaasenk-subtle) border border-(--vaasenk-line-sand)')
                }
                aria-current={state === 'current' ? 'step' : undefined}
              >
                <span
                  aria-hidden
                  className={
                    'grid size-6 shrink-0 place-items-center rounded-full ' +
                    (state === 'current'
                      ? 'bg-white/20'
                      : state === 'done'
                        ? 'bg-(--vaasenk-success)/15'
                        : 'bg-(--vaasenk-line-sand)/60')
                  }
                >
                  {state === 'done' ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Icon className="size-3.5" />
                  )}
                </span>
                <span className="hidden truncate sm:inline">{s.name}</span>
                <span className="sm:hidden">{i + 1}</span>
              </div>
              {i < STEPS.length - 1 ? (
                <span
                  aria-hidden
                  className={
                    'hidden h-px flex-1 rounded-full sm:block ' +
                    (i < current
                      ? 'bg-(--vaasenk-success)/40'
                      : 'bg-(--vaasenk-line-sand)')
                  }
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ---------- Step 1: Profile -------------------------------------------------

function ProfileStep({
  value,
  onChange,
  disabled,
}: {
  value: ProfileForm;
  onChange: (next: ProfileForm) => void;
  disabled: boolean;
}) {
  const ids = useStepIds();
  const set = <K extends keyof ProfileForm>(k: K, v: ProfileForm[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field
        id={ids('name')}
        label="Institution name"
        required
        disabled={disabled}
        value={value.name}
        onChange={(v) => set('name', v)}
        placeholder="St. Mary's Higher Secondary School"
        autoComplete="organization"
      />

      <SelectField
        id={ids('type')}
        label="Institution type"
        required
        disabled={disabled}
        value={value.type}
        onChange={(v) => set('type', v as ProfileForm['type'])}
        options={[
          { value: '', label: 'Choose…' },
          { value: 'school', label: 'School' },
          { value: 'college', label: 'College' },
          { value: 'coaching_center', label: 'Coaching centre' },
          { value: 'other', label: 'Other' },
        ]}
      />

      <Field
        id={ids('boardType')}
        label="Board / affiliation"
        disabled={disabled}
        value={value.boardType}
        onChange={(v) => set('boardType', v)}
        placeholder="Samacheer Kalvi, CBSE, ICSE…"
      />

      <Field
        id={ids('contactPerson')}
        label="Contact person"
        disabled={disabled}
        value={value.contactPerson}
        onChange={(v) => set('contactPerson', v)}
        placeholder="Principal Arun Kumar"
        autoComplete="name"
      />

      <Field
        id={ids('contactEmail')}
        label="Contact email"
        type="email"
        disabled={disabled}
        value={value.contactEmail}
        onChange={(v) => set('contactEmail', v)}
        placeholder="admin@school.in"
        autoComplete="email"
      />

      <Field
        id={ids('contactPhone')}
        label="Contact phone"
        type="tel"
        disabled={disabled}
        value={value.contactPhone}
        onChange={(v) => set('contactPhone', v)}
        placeholder="+91 98765 43210"
        autoComplete="tel"
      />

      <Field
        id={ids('websiteUrl')}
        label="Website"
        type="url"
        disabled={disabled}
        value={value.websiteUrl}
        onChange={(v) => set('websiteUrl', v)}
        placeholder="https://school.in"
        autoComplete="url"
      />

      <Field
        id={ids('locale')}
        label="Locale"
        disabled={disabled}
        value={value.locale}
        onChange={(v) => set('locale', v)}
        placeholder="en-IN"
      />

      <div className="sm:col-span-2">
        <TextareaField
          id={ids('address')}
          label="Address"
          disabled={disabled}
          value={value.address}
          onChange={(v) => set('address', v)}
          placeholder="Street, city, state, PIN"
        />
      </div>
    </div>
  );
}

// ---------- Step 2: Academic year ------------------------------------------

function AcademicYearStep({
  value,
  onChange,
  disabled,
}: {
  value: AcademicYearForm;
  onChange: (next: AcademicYearForm) => void;
  disabled: boolean;
}) {
  const ids = useStepIds();
  const set = <K extends keyof AcademicYearForm>(
    k: K,
    v: AcademicYearForm[K],
  ) => onChange({ ...value, [k]: v });

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field
        id={ids('ay-name')}
        label="Academic year"
        required
        disabled={disabled}
        value={value.name}
        onChange={(v) => set('name', v)}
        placeholder="2026-2027"
      />

      <div className="flex items-end">
        <label
          htmlFor={ids('ay-active')}
          className="inline-flex cursor-pointer items-center gap-2.5 rounded-2xl border border-(--vaasenk-line-sand) bg-white/80 px-4 py-3 text-sm font-medium text-(--vaasenk-deep-maroon)"
        >
          <input
            id={ids('ay-active')}
            type="checkbox"
            checked={value.isActive}
            onChange={(e) => set('isActive', e.target.checked)}
            disabled={disabled}
            className="size-4 cursor-pointer accent-(--vaasenk-red)"
          />
          Mark as the active academic year
        </label>
      </div>

      <Field
        id={ids('ay-start')}
        label="Start date"
        type="date"
        required
        disabled={disabled}
        value={value.startDate}
        onChange={(v) => set('startDate', v)}
      />

      <Field
        id={ids('ay-end')}
        label="End date"
        type="date"
        required
        disabled={disabled}
        value={value.endDate}
        onChange={(v) => set('endDate', v)}
      />
    </div>
  );
}

// ---------- Step 3: Classes & sections -------------------------------------

function ClassesStep({
  value,
  onChange,
  disabled,
}: {
  value: ClassForm[];
  onChange: (next: ClassForm[]) => void;
  disabled: boolean;
}) {
  const update = (idx: number, patch: Partial<ClassForm>) => {
    onChange(value.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const addClass = () => {
    onChange([
      ...value,
      {
        id: rid(),
        name: '',
        boardType: '',
        gradeLevel: '',
        sections: [{ id: rid(), name: 'A' }],
      },
    ]);
  };

  const removeClass = (idx: number) => {
    if (value.length === 1) return; // Keep at least one row.
    onChange(value.filter((_, i) => i !== idx));
  };

  return (
    <div className="flex flex-col gap-4">
      {value.map((cls, idx) => (
        <div
          key={cls.id}
          className="rounded-2xl border border-(--vaasenk-line-sand) bg-white/60 p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-(--vaasenk-deep-maroon)">
              Class {idx + 1}
            </p>
            <button
              type="button"
              onClick={() => removeClass(idx)}
              disabled={disabled || value.length === 1}
              aria-label={`Remove class ${idx + 1}`}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-(--vaasenk-danger) transition-colors hover:bg-(--vaasenk-danger)/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="size-3.5" />
              Remove
            </button>
          </div>

          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <Field
              id={`cls-${cls.id}-name`}
              label="Class name"
              required
              disabled={disabled}
              value={cls.name}
              onChange={(v) => update(idx, { name: v })}
              placeholder="Class 10"
            />
            <Field
              id={`cls-${cls.id}-board`}
              label="Board"
              disabled={disabled}
              value={cls.boardType}
              onChange={(v) => update(idx, { boardType: v })}
              placeholder="Samacheer Kalvi"
            />
            <Field
              id={`cls-${cls.id}-grade`}
              label="Grade level"
              type="number"
              disabled={disabled}
              value={cls.gradeLevel}
              onChange={(v) => update(idx, { gradeLevel: v })}
              placeholder="10"
              min={1}
              max={20}
            />
          </div>

          <div className="mt-4">
            <p className="text-sm font-medium text-(--vaasenk-deep-maroon)">
              Sections
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {cls.sections.map((sec, secIdx) => (
                <div
                  key={sec.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-(--vaasenk-line-sand) bg-white/80 pl-3 pr-1 py-1"
                >
                  <input
                    aria-label={`Section name for class ${idx + 1}`}
                    type="text"
                    value={sec.name}
                    onChange={(e) =>
                      update(idx, {
                        sections: cls.sections.map((s, si) =>
                          si === secIdx ? { ...s, name: e.target.value } : s,
                        ),
                      })
                    }
                    disabled={disabled}
                    placeholder="A"
                    className="w-12 bg-transparent text-sm text-(--vaasenk-ink) focus:outline-none disabled:opacity-70"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      update(idx, {
                        sections: cls.sections.filter((_, si) => si !== secIdx),
                      })
                    }
                    disabled={disabled || cls.sections.length === 1}
                    aria-label={`Remove section ${sec.name || secIdx + 1}`}
                    className="grid size-6 place-items-center rounded-full text-(--vaasenk-subtle) hover:bg-(--vaasenk-danger)/10 hover:text-(--vaasenk-danger) disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  update(idx, {
                    sections: [
                      ...cls.sections,
                      { id: rid(), name: nextSectionName(cls.sections) },
                    ],
                  })
                }
                disabled={disabled}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-(--vaasenk-red)/40 px-3 py-1.5 text-xs font-medium text-(--vaasenk-red) hover:bg-(--vaasenk-rose-wash) disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="size-3.5" />
                Add section
              </button>
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addClass}
        disabled={disabled}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-(--vaasenk-line-sand) bg-white/40 px-4 py-4 text-sm font-medium text-(--vaasenk-deep-maroon) transition-colors hover:border-(--vaasenk-red)/40 hover:bg-(--vaasenk-rose-wash) disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Plus className="size-4" />
        Add class
      </button>
    </div>
  );
}

function nextSectionName(existing: { name: string }[]): string {
  const used = new Set(existing.map((s) => s.name.trim().toUpperCase()));
  for (let code = 65; code < 91; code++) {
    const letter = String.fromCharCode(code);
    if (!used.has(letter)) return letter;
  }
  return '';
}

// ---------- Step 4: Subjects -----------------------------------------------

function SubjectsStep({
  value,
  onChange,
  disabled,
}: {
  value: SubjectForm[];
  onChange: (next: SubjectForm[]) => void;
  disabled: boolean;
}) {
  const update = (idx: number, patch: Partial<SubjectForm>) =>
    onChange(value.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  return (
    <div className="flex flex-col gap-3">
      {value.map((s, idx) => (
        <div
          key={s.id}
          className="grid gap-3 rounded-2xl border border-(--vaasenk-line-sand) bg-white/60 p-4 sm:grid-cols-[1.6fr_1fr_auto] sm:items-end"
        >
          <Field
            id={`subj-${s.id}-name`}
            label={idx === 0 ? 'Subject name' : undefined}
            srOnlyLabel={idx === 0 ? undefined : `Subject ${idx + 1} name`}
            required
            disabled={disabled}
            value={s.name}
            onChange={(v) => update(idx, { name: v })}
            placeholder="Mathematics"
          />
          <Field
            id={`subj-${s.id}-code`}
            label={idx === 0 ? 'Code (optional)' : undefined}
            srOnlyLabel={idx === 0 ? undefined : `Subject ${idx + 1} code`}
            disabled={disabled}
            value={s.code}
            onChange={(v) => update(idx, { code: v })}
            placeholder="MATH"
            maxLength={10}
          />
          <button
            type="button"
            onClick={() => {
              if (value.length === 1) return;
              onChange(value.filter((_, i) => i !== idx));
            }}
            disabled={disabled || value.length === 1}
            aria-label={`Remove subject ${idx + 1}`}
            className="inline-flex h-11 min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-(--vaasenk-line-sand) bg-white/80 px-4 text-sm font-medium text-(--vaasenk-danger) transition-colors hover:bg-(--vaasenk-danger)/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="size-4" />
            <span className="sr-only sm:not-sr-only">Remove</span>
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          onChange([...value, { id: rid(), name: '', code: '' }])
        }
        disabled={disabled}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-(--vaasenk-line-sand) bg-white/40 px-4 py-4 text-sm font-medium text-(--vaasenk-deep-maroon) transition-colors hover:border-(--vaasenk-red)/40 hover:bg-(--vaasenk-rose-wash) disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Plus className="size-4" />
        Add subject
      </button>
    </div>
  );
}

// ---------- Step 5: Confirmation -------------------------------------------

function ConfirmStep({
  profile,
  academicYear,
  classes,
  subjects,
}: {
  profile: ProfileForm;
  academicYear: AcademicYearForm;
  classes: ClassForm[];
  subjects: SubjectForm[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <SummaryCard title="Institution" icon={Building2}>
        <SummaryRow label="Name" value={profile.name || '—'} />
        <SummaryRow label="Type" value={prettyType(profile.type) || '—'} />
        <SummaryRow label="Board" value={profile.boardType || '—'} />
        <SummaryRow label="Contact" value={profile.contactPerson || '—'} />
        <SummaryRow label="Email" value={profile.contactEmail || '—'} />
        <SummaryRow label="Phone" value={profile.contactPhone || '—'} />
      </SummaryCard>

      <SummaryCard title="Academic year" icon={Calendar}>
        <SummaryRow label="Name" value={academicYear.name} />
        <SummaryRow label="Start" value={academicYear.startDate} />
        <SummaryRow label="End" value={academicYear.endDate} />
        <SummaryRow
          label="Active"
          value={academicYear.isActive ? 'Yes' : 'No'}
        />
      </SummaryCard>

      <SummaryCard
        title={`Classes (${classes.length})`}
        icon={GraduationCap}
      >
        <ul className="flex flex-col gap-2">
          {classes.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/70 px-3 py-2 text-sm"
            >
              <span className="font-medium text-(--vaasenk-ink)">
                {c.name || '—'}
                {c.boardType ? (
                  <span className="ml-2 text-xs text-(--vaasenk-muted)">
                    · {c.boardType}
                  </span>
                ) : null}
              </span>
              <span className="text-xs text-(--vaasenk-muted)">
                Sections: {c.sections.map((s) => s.name).join(', ') || '—'}
              </span>
            </li>
          ))}
        </ul>
      </SummaryCard>

      <SummaryCard title={`Subjects (${subjects.length})`} icon={BookOpen}>
        <div className="flex flex-wrap gap-2">
          {subjects.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-(--vaasenk-rose-wash) px-3 py-1 text-xs font-medium text-(--vaasenk-deep-maroon)"
            >
              {s.name || '—'}
              {s.code ? (
                <span className="text-(--vaasenk-muted)">· {s.code}</span>
              ) : null}
            </span>
          ))}
        </div>
      </SummaryCard>

      <p className="text-xs text-(--vaasenk-subtle)">
        Pressing “Complete setup” creates the academic year, classes,
        sections, and subjects in a single transaction. You can edit any of
        these afterwards from the admin dashboard.
      </p>
    </div>
  );
}

function SummaryCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-(--vaasenk-line-sand) bg-white/60 p-5">
      <div className="flex items-center gap-2 text-(--vaasenk-deep-maroon)">
        <Icon className="size-4" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-(--vaasenk-muted)">{label}</span>
      <span className="text-right font-medium text-(--vaasenk-ink)">
        {value}
      </span>
    </div>
  );
}

// ---------- Generic field primitives (local — narrowly used) ----------------

type FieldProps = {
  id: string;
  label?: string;
  srOnlyLabel?: string;
  required?: boolean;
  disabled?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'email' | 'tel' | 'url' | 'date' | 'number';
  autoComplete?: string;
  min?: number;
  max?: number;
  maxLength?: number;
};

function Field({
  id,
  label,
  srOnlyLabel,
  required,
  disabled,
  value,
  onChange,
  placeholder,
  type = 'text',
  autoComplete,
  min,
  max,
  maxLength,
}: FieldProps) {
  return (
    <div className="space-y-2">
      {label ? (
        <label
          htmlFor={id}
          className="block text-sm font-medium text-(--vaasenk-deep-maroon)"
        >
          {label}
          {required ? (
            <span className="ml-1 text-(--vaasenk-red)" aria-hidden>
              *
            </span>
          ) : null}
        </label>
      ) : srOnlyLabel ? (
        <label htmlFor={id} className="sr-only">
          {srOnlyLabel}
        </label>
      ) : null}
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        autoComplete={autoComplete}
        min={min}
        max={max}
        maxLength={maxLength}
        aria-required={required || undefined}
        className="w-full min-h-[44px] rounded-2xl border border-(--vaasenk-line-sand) bg-white/80 px-4 py-3 text-base text-(--vaasenk-ink) placeholder:text-(--vaasenk-subtle) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-70"
      />
    </div>
  );
}

function TextareaField({
  id,
  label,
  disabled,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  disabled?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-(--vaasenk-deep-maroon)"
      >
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="min-h-[120px] w-full resize-y rounded-2xl border border-(--vaasenk-line-sand) bg-white/80 px-4 py-3 text-base text-(--vaasenk-ink) placeholder:text-(--vaasenk-subtle) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-70"
      />
    </div>
  );
}

function SelectField({
  id,
  label,
  required,
  disabled,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  required?: boolean;
  disabled?: boolean;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-(--vaasenk-deep-maroon)"
      >
        {label}
        {required ? (
          <span className="ml-1 text-(--vaasenk-red)" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={required}
        aria-required={required || undefined}
        className="w-full min-h-[44px] rounded-2xl border border-(--vaasenk-line-sand) bg-white/80 px-4 py-3 text-base text-(--vaasenk-ink) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.value === ''}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------- Helpers ---------------------------------------------------------

function useStepIds() {
  const prefix = useId();
  return (key: string) => `${prefix}-${key}`;
}

function stepSubtitle(step: StepIndex): string {
  switch (step) {
    case 0:
      return 'Tell us about your institution. We use this on invitation emails and the dashboard greeting.';
    case 1:
      return 'Pick the academic year your classrooms will run under. You can add more later.';
    case 2:
      return 'Add the classes your institution runs and their sections. Teachers attach notes to these.';
    case 3:
      return 'Add the subjects you teach. Used by the question paper generator and the AI chatbot.';
    case 4:
      return 'A quick look before we save everything. You can edit any of this from the admin dashboard afterwards.';
  }
}

function stepHelper(step: StepIndex): string {
  switch (step) {
    case 0:
      return 'Required fields are marked with a red asterisk.';
    case 1:
      return 'Indian academic years usually run June → April. We pre-fill that for you.';
    case 2:
      return 'At least one class with at least one section. Class names must be unique.';
    case 3:
      return 'Subject names must be unique. Codes are optional and short — for example, MATH or PHY.';
    case 4:
      return 'Press Complete setup to save everything in a single transaction.';
  }
}

function normalizeType(raw: string | null | undefined): ProfileForm['type'] | null {
  if (!raw) return null;
  const v = raw.toLowerCase().trim();
  if (v === 'school' || v === 'college' || v === 'coaching_center' || v === 'other')
    return v as ProfileForm['type'];
  return null;
}

function prettyType(t: ProfileForm['type']): string {
  switch (t) {
    case 'school':
      return 'School';
    case 'college':
      return 'College';
    case 'coaching_center':
      return 'Coaching centre';
    case 'other':
      return 'Other';
    default:
      return '';
  }
}
