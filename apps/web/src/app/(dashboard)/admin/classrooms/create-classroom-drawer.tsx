'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  PartyPopper,
  Plus,
  Share2,
  Sparkles,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { VaasenkButton } from '@/components/ui/vaasenk-button';
import { ApiClientError } from '@/lib/api-client';
import {
  createClassroom,
  listAcademicYears,
  listClasses,
  listSubjects,
  listSyllabus,
  listTeachers,
  type AcademicYearOption,
  type ClassOption,
  type ClassroomView,
  type SubjectOption,
  type SyllabusOption,
  type TeacherOption,
} from '@/lib/classrooms-api';
import { cn } from '@/lib/utils';

/**
 * Right-side slide-in drawer to create a classroom (admin-only).
 *
 * Two phases inside one drawer:
 *   1. FORM    — Class → Section (filtered) → Subject → Teacher → Syllabus
 *                (optional, AI-ready flagged) → Academic year (defaults to the
 *                active one) → Name (optional, auto-derived placeholder).
 *   2. SUCCESS — prominent invite-code hand-off with copy + share + a clear
 *                "Done" / "Create another" pair.
 *
 * On open it fetches the academic structure (classes/subjects/years), the
 * teacher list, and the syllabus library in parallel via Promise.allSettled so
 * one failing endpoint (e.g. an empty syllabus library) doesn't block the
 * whole form.
 *
 * Backend 400s ("Teacher account is not active", "No active academic year",
 * etc.) surface inline above the fields rather than dismissing the drawer.
 */

// ---------------------------------------------------------------------------
// Strings — pulled to a constant for a future i18n sweep (en-IN → ta-IN).
// ---------------------------------------------------------------------------

const MSG = {
  title: 'Create a classroom',
  subtitle:
    'Pick the class, subject, and teacher. Students join with the invite code you’ll get next.',
  close: 'Close',

  classLabel: 'Class',
  classPlaceholder: 'Select a class',
  classHint: 'Set up classes in the institution wizard if this list is empty.',

  sectionLabel: 'Section',
  sectionPlaceholder: 'No section (whole class)',
  sectionNoneForClass: 'This class has no sections.',
  sectionPickClassFirst: 'Pick a class first.',

  subjectLabel: 'Subject',
  subjectPlaceholder: 'Select a subject',

  teacherLabel: 'Teacher',
  teacherPlaceholder: 'Assign a teacher',
  teacherEmpty: 'No active teachers yet. Invite one from the Teachers page.',

  syllabusLabel: 'Syllabus',
  syllabusOptional: 'Optional',
  syllabusPlaceholder: 'No syllabus mapped',
  syllabusHint:
    'Map a syllabus to power the AI assistant and question-paper generator. You can change this later.',
  syllabusAiReady: 'AI ready',
  syllabusProcessing: 'Processing',
  syllabusNotReady: 'Not indexed',
  syllabusFailed: 'Failed',

  yearLabel: 'Academic year',
  yearActiveSuffix: ' · active',
  yearHint: 'Defaults to the active year.',
  yearEmpty: 'No academic year set up. Add one in the institution wizard.',

  nameLabel: 'Classroom name',
  nameOptional: 'Optional',
  nameHelper: 'Leave blank to auto-name it from class, section, and subject.',

  cancel: 'Cancel',
  submit: 'Create classroom',
  submitting: 'Creating…',

  loadingForm: 'Loading classroom options…',
  formLoadError: 'Couldn’t load the classroom options.',
  retry: 'Retry',
  noActiveYearTitle: 'No active academic year',
  noActiveYearBody:
    'A classroom needs an active academic year. Set one up in the institution setup wizard, then come back.',

  // success
  successEyebrow: 'Classroom created',
  successTitle: (name: string) => name,
  successBody:
    'Share this invite code with students so they can join from the mobile app or web.',
  inviteCodeLabel: 'Invite code',
  copyCode: 'Copy code',
  copied: 'Copied!',
  share: 'Share',
  shareTitle: 'Join my Vaasenk classroom',
  shareText: (name: string, code: string) =>
    `Join "${name}" on Vaasenk with invite code ${code}.`,
  done: 'Done',
  createAnother: 'Create another',
  viewClassroom: 'Open classroom',
  copyFailed: 'Could not copy. Select the code to copy it manually.',
} as const;

type Phase = 'form' | 'success';
type LoadState = 'loading' | 'ready' | 'error';

const SYLLABUS_STATUS_META: Record<
  SyllabusOption['status'],
  { label: string; tone: string; selectable: boolean }
> = {
  AI_READY: {
    label: MSG.syllabusAiReady,
    tone: 'text-(--vaasenk-success)',
    selectable: true,
  },
  PROCESSING: {
    label: MSG.syllabusProcessing,
    tone: 'text-(--vaasenk-warning)',
    selectable: true,
  },
  UPLOADED: {
    label: MSG.syllabusNotReady,
    tone: 'text-(--vaasenk-muted)',
    selectable: true,
  },
  FAILED: {
    label: MSG.syllabusFailed,
    tone: 'text-(--vaasenk-danger)',
    selectable: true,
  },
};

export function CreateClassroomDrawer({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after a successful create so the list can refetch. */
  onCreated: (classroom: ClassroomView) => void;
}) {
  const formId = useId();

  // Phase + reference-data state
  const [phase, setPhase] = useState<Phase>('form');
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [years, setYears] = useState<AcademicYearOption[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [syllabi, setSyllabi] = useState<SyllabusOption[]>([]);

  // Form field state
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [syllabusId, setSyllabusId] = useState('');
  const [academicYearId, setAcademicYearId] = useState('');
  const [name, setName] = useState('');

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Success result
  const [created, setCreated] = useState<ClassroomView | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  // Bumped by the retry button to force a reference-data refetch while the
  // drawer is already open (re-opening isn't an option once open).
  const [reloadNonce, setReloadNonce] = useState(0);

  // -------------------------------------------------------------------------
  // Reset everything to a clean form each time the drawer opens.
  // -------------------------------------------------------------------------
  const resetForm = useCallback(() => {
    setClassId('');
    setSectionId('');
    setSubjectId('');
    setTeacherId('');
    setSyllabusId('');
    // Pre-select the active year if we already have it loaded.
    const active = years.find((y) => y.isActive);
    setAcademicYearId(active?.id ?? '');
    setName('');
    setServerError(null);
    setSubmitting(false);
    setCodeCopied(false);
  }, [years]);

  // Load reference data on open.
  useEffect(() => {
    if (!open) return;
    setPhase('form');
    setCreated(null);
    setServerError(null);
    setLoadState('loading');
    setLoadError(null);

    let cancelled = false;
    (async () => {
      const [classesRes, subjectsRes, yearsRes, teachersRes, syllabiRes] =
        await Promise.allSettled([
          listClasses(),
          listSubjects(),
          listAcademicYears(),
          listTeachers(),
          listSyllabus(),
        ]);
      if (cancelled) return;

      // Classes / subjects / years are required to build a classroom — if the
      // first three all fail, surface the load error. Teachers + syllabus are
      // additive (empty teacher list is a valid, handled state).
      const coreFailed =
        classesRes.status === 'rejected' &&
        subjectsRes.status === 'rejected' &&
        yearsRes.status === 'rejected';

      if (coreFailed) {
        const reason =
          classesRes.status === 'rejected'
            ? classesRes.reason
            : undefined;
        setLoadError(
          reason instanceof Error ? reason.message : MSG.formLoadError,
        );
        setLoadState('error');
        return;
      }

      const nextClasses =
        classesRes.status === 'fulfilled' ? classesRes.value : [];
      const nextSubjects =
        subjectsRes.status === 'fulfilled' ? subjectsRes.value : [];
      const nextYears =
        yearsRes.status === 'fulfilled' ? yearsRes.value : [];
      const nextTeachers =
        teachersRes.status === 'fulfilled' ? teachersRes.value : [];
      const nextSyllabi =
        syllabiRes.status === 'fulfilled' ? syllabiRes.value : [];

      setClasses(nextClasses);
      setSubjects(nextSubjects);
      setYears(nextYears);
      setTeachers(nextTeachers);
      setSyllabi(nextSyllabi);

      // Seed the form: default the year to the active one.
      const active = nextYears.find((y) => y.isActive);
      setClassId('');
      setSectionId('');
      setSubjectId('');
      setTeacherId('');
      setSyllabusId('');
      setAcademicYearId(active?.id ?? '');
      setName('');
      setSubmitting(false);
      setServerError(null);
      setCodeCopied(false);

      setLoadState('ready');
    })();

    return () => {
      cancelled = true;
    };
  }, [open, reloadNonce]);

  // When the chosen class changes, drop a section that no longer belongs.
  const sectionsForClass = useMemo(() => {
    const klass = classes.find((c) => c.id === classId);
    return klass?.sections ?? [];
  }, [classes, classId]);

  useEffect(() => {
    if (sectionId && !sectionsForClass.some((s) => s.id === sectionId)) {
      setSectionId('');
    }
  }, [sectionsForClass, sectionId]);

  // -------------------------------------------------------------------------
  // Derived placeholder name (mirrors the backend's deriveClassroomName).
  // -------------------------------------------------------------------------
  const derivedNamePlaceholder = useMemo(() => {
    const klass = classes.find((c) => c.id === classId);
    const subject = subjects.find((s) => s.id === subjectId);
    if (!klass || !subject) return MSG.nameHelper;
    const section = sectionsForClass.find((s) => s.id === sectionId);
    const sectionFragment = section ? ` · Section ${section.name}` : '';
    return `${klass.name}${sectionFragment} · ${subject.name}`;
  }, [classes, subjects, classId, subjectId, sectionId, sectionsForClass]);

  // True only when a year is actually flagged active. The backend resolves an
  // omitted academicYearId to the active year and 400s if none exists.
  const hasActiveYear = useMemo(() => years.some((y) => y.isActive), [years]);

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (loadState !== 'ready') return false;
    if (!classId || !subjectId || !teacherId) return false;
    // No active year → the admin MUST pick one explicitly, otherwise the
    // backend rejects the omitted academicYearId. (Zero years total → the
    // year select is empty, so this stays blocked until a year is set up.)
    if (!hasActiveYear && !academicYearId) return false;
    return true;
  }, [
    submitting,
    loadState,
    classId,
    subjectId,
    teacherId,
    hasActiveYear,
    academicYearId,
  ]);

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    setServerError(null);
    setSubmitting(true);
    try {
      const trimmedName = name.trim();
      const result = await createClassroom({
        classId,
        subjectId,
        teacherId,
        ...(sectionId ? { sectionId } : {}),
        ...(syllabusId ? { syllabusId } : {}),
        ...(academicYearId ? { academicYearId } : {}),
        ...(trimmedName ? { name: trimmedName } : {}),
      });
      setCreated(result.classroom);
      setPhase('success');
      onCreated(result.classroom);
    } catch (err) {
      if (err instanceof ApiClientError) {
        // The HttpExceptionFilter flattens both business 400s
        // ("Teacher account is not active") and class-validator arrays into
        // ApiClientError.message, so it's the right thing to surface inline.
        setServerError(err.message);
      } else if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError('Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Success-step actions
  // -------------------------------------------------------------------------
  const copyCode = async () => {
    const code = created?.inviteCode;
    if (!code) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(code);
      } else {
        const ta = document.createElement('textarea');
        ta.value = code;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 2200);
    } catch {
      setServerError(MSG.copyFailed);
    }
  };

  const shareCode = async () => {
    const code = created?.inviteCode;
    if (!code || !created) return;
    const text = MSG.shareText(created.name, code);
    // Web Share API where available (mobile-first); fall back to clipboard.
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (
          navigator as Navigator & {
            share: (data: ShareData) => Promise<void>;
          }
        ).share({ title: MSG.shareTitle, text });
        return;
      } catch {
        // user cancelled or share failed — fall through to clipboard
      }
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setCodeCopied(true);
        window.setTimeout(() => setCodeCopied(false), 2200);
      }
    } catch {
      setServerError(MSG.copyFailed);
    }
  };

  const createAnother = () => {
    setCreated(null);
    setPhase('form');
    resetForm();
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-(--vaasenk-deep-maroon)/30 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          )}
        />
        <Dialog.Content
          aria-describedby={`${formId}-subtitle`}
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col',
            'bg-(image:--gradient-cream-sunrise)',
            'border-l border-(--vaasenk-line-sand)',
            'shadow-[0_32px_90px_rgba(160,0,0,0.18)]',
            'focus:outline-none',
            'data-[state=open]:animate-in data-[state=open]:slide-in-from-right',
            'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right',
          )}
        >
          {/* Header */}
          <header className="flex items-start justify-between gap-3 border-b border-(--vaasenk-line-sand)/60 bg-white/40 px-6 py-5 backdrop-blur">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold text-(--vaasenk-ink)">
                {phase === 'form' ? MSG.title : MSG.successEyebrow}
              </Dialog.Title>
              <Dialog.Description
                id={`${formId}-subtitle`}
                className="mt-1 text-sm text-(--vaasenk-muted)"
              >
                {phase === 'form' ? MSG.subtitle : MSG.successBody}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={MSG.close}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-(--vaasenk-muted) transition-colors hover:bg-(--vaasenk-rose-wash) hover:text-(--vaasenk-red) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30"
              >
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </header>

          {phase === 'success' && created ? (
            <SuccessStep
              classroom={created}
              codeCopied={codeCopied}
              error={serverError}
              onCopy={copyCode}
              onShare={shareCode}
              onDone={() => onOpenChange(false)}
              onCreateAnother={createAnother}
            />
          ) : loadState === 'loading' ? (
            <FormSkeleton />
          ) : loadState === 'error' ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
              <span
                aria-hidden
                className="grid size-14 place-items-center rounded-2xl bg-(--vaasenk-danger)/10 text-(--vaasenk-danger)"
              >
                <AlertCircle className="size-6" />
              </span>
              <div role="alert" aria-live="polite">
                <p className="text-base font-semibold text-(--vaasenk-ink)">
                  {MSG.formLoadError}
                </p>
                <p className="mt-1 text-sm text-(--vaasenk-muted)">
                  {loadError}
                </p>
              </div>
              <VaasenkButton
                variant="secondary"
                size="sm"
                onClick={() => setReloadNonce((n) => n + 1)}
              >
                {MSG.retry}
              </VaasenkButton>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-1 flex-col overflow-y-auto">
              <div className="flex-1 space-y-5 px-6 py-6">
                {/* No-active-year hard block */}
                {!hasActiveYear ? (
                  <div
                    role="alert"
                    className="rounded-2xl border border-(--vaasenk-warning)/40 bg-(--vaasenk-warning)/10 px-4 py-3 text-sm text-(--vaasenk-deep-maroon)"
                  >
                    <p className="font-semibold">{MSG.noActiveYearTitle}</p>
                    <p className="mt-1 text-(--vaasenk-muted)">
                      {MSG.noActiveYearBody}
                    </p>
                  </div>
                ) : null}

                {/* Server error */}
                {serverError ? (
                  <div
                    role="alert"
                    aria-live="polite"
                    className="rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-4 py-3 text-sm text-(--vaasenk-danger)"
                  >
                    {serverError}
                  </div>
                ) : null}

                {/* Class (required) */}
                <Field
                  id={`${formId}-class`}
                  label={MSG.classLabel}
                  required
                  hint={classes.length === 0 ? MSG.classHint : undefined}
                >
                  <Select
                    id={`${formId}-class`}
                    value={classId}
                    onChange={setClassId}
                    disabled={submitting || classes.length === 0}
                    placeholder={MSG.classPlaceholder}
                    options={classes.map((c) => ({
                      value: c.id,
                      label: c.name,
                    }))}
                  />
                </Field>

                {/* Section (optional, filtered to class) */}
                <Field
                  id={`${formId}-section`}
                  label={MSG.sectionLabel}
                  optionalLabel={MSG.syllabusOptional}
                  hint={
                    !classId
                      ? MSG.sectionPickClassFirst
                      : sectionsForClass.length === 0
                        ? MSG.sectionNoneForClass
                        : undefined
                  }
                >
                  <Select
                    id={`${formId}-section`}
                    value={sectionId}
                    onChange={setSectionId}
                    disabled={
                      submitting || !classId || sectionsForClass.length === 0
                    }
                    placeholder={MSG.sectionPlaceholder}
                    options={sectionsForClass.map((s) => ({
                      value: s.id,
                      label: s.name,
                    }))}
                  />
                </Field>

                {/* Subject (required) */}
                <Field
                  id={`${formId}-subject`}
                  label={MSG.subjectLabel}
                  required
                >
                  <Select
                    id={`${formId}-subject`}
                    value={subjectId}
                    onChange={setSubjectId}
                    disabled={submitting || subjects.length === 0}
                    placeholder={MSG.subjectPlaceholder}
                    options={subjects.map((s) => ({
                      value: s.id,
                      label: s.code ? `${s.name} (${s.code})` : s.name,
                    }))}
                  />
                </Field>

                {/* Teacher (required) */}
                <Field
                  id={`${formId}-teacher`}
                  label={MSG.teacherLabel}
                  required
                  hint={teachers.length === 0 ? MSG.teacherEmpty : undefined}
                >
                  <Select
                    id={`${formId}-teacher`}
                    value={teacherId}
                    onChange={setTeacherId}
                    disabled={submitting || teachers.length === 0}
                    placeholder={MSG.teacherPlaceholder}
                    options={teachers.map((t) => ({
                      value: t.id,
                      label: t.email ? `${t.name} · ${t.email}` : t.name,
                    }))}
                  />
                </Field>

                {/* Syllabus (optional, AI-ready flagged) */}
                <Field
                  id={`${formId}-syllabus`}
                  label={MSG.syllabusLabel}
                  optionalLabel={MSG.syllabusOptional}
                  hint={MSG.syllabusHint}
                >
                  <SyllabusSelect
                    id={`${formId}-syllabus`}
                    value={syllabusId}
                    onChange={setSyllabusId}
                    disabled={submitting || syllabi.length === 0}
                    options={syllabi}
                  />
                </Field>

                {/* Academic year (defaults to active) */}
                <Field
                  id={`${formId}-year`}
                  label={MSG.yearLabel}
                  hint={years.length === 0 ? MSG.yearEmpty : MSG.yearHint}
                >
                  <Select
                    id={`${formId}-year`}
                    value={academicYearId}
                    onChange={setAcademicYearId}
                    disabled={submitting || years.length === 0}
                    placeholder={MSG.yearLabel}
                    options={years.map((y) => ({
                      value: y.id,
                      label: y.isActive
                        ? `${y.name}${MSG.yearActiveSuffix}`
                        : y.name,
                    }))}
                  />
                </Field>

                {/* Name (optional, auto-derived placeholder) */}
                <Field
                  id={`${formId}-name`}
                  label={MSG.nameLabel}
                  optionalLabel={MSG.nameOptional}
                  hint={MSG.nameHelper}
                >
                  <input
                    id={`${formId}-name`}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={derivedNamePlaceholder}
                    maxLength={120}
                    disabled={submitting}
                    className="min-h-[44px] w-full rounded-2xl border border-(--vaasenk-line-sand) bg-white/85 px-4 py-3 text-base text-(--vaasenk-ink) placeholder:text-(--vaasenk-subtle) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-70"
                  />
                </Field>
              </div>

              {/* Footer */}
              <footer className="flex items-center justify-end gap-2 border-t border-(--vaasenk-line-sand)/60 bg-white/40 px-6 py-4 backdrop-blur">
                <Dialog.Close asChild>
                  <VaasenkButton
                    variant="ghost"
                    size="md"
                    type="button"
                    disabled={submitting}
                  >
                    {MSG.cancel}
                  </VaasenkButton>
                </Dialog.Close>
                <VaasenkButton
                  variant="primary"
                  size="md"
                  type="submit"
                  disabled={!canSubmit}
                  aria-disabled={!canSubmit}
                  title={
                    !canSubmit && !submitting
                      ? 'Pick a class, subject, and teacher to continue.'
                      : undefined
                  }
                >
                  {submitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {MSG.submitting}
                    </>
                  ) : (
                    <>
                      <Plus className="size-4" />
                      {MSG.submit}
                    </>
                  )}
                </VaasenkButton>
              </footer>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ===========================================================================
// Success step
// ===========================================================================

function SuccessStep({
  classroom,
  codeCopied,
  error,
  onCopy,
  onShare,
  onDone,
  onCreateAnother,
}: {
  classroom: ClassroomView;
  codeCopied: boolean;
  error: string | null;
  onCopy: () => void;
  onShare: () => void;
  onDone: () => void;
  onCreateAnother: () => void;
}) {
  const code = classroom.inviteCode ?? '——————';
  const subtitleParts = [
    classroom.class?.name,
    classroom.section ? `Section ${classroom.section.name}` : null,
    classroom.subject?.name,
  ].filter(Boolean);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="flex-1 space-y-6 px-6 py-8">
        {/* Celebration header */}
        <div className="flex flex-col items-center text-center">
          <span
            aria-hidden
            className="grid size-16 place-items-center rounded-2xl bg-(image:--gradient-brand-flame) text-white shadow-[0_12px_32px_rgba(160,0,0,0.26)]"
          >
            <PartyPopper className="size-7" />
          </span>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-(--vaasenk-deep-maroon)">
            {MSG.successEyebrow}
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-(--vaasenk-ink)">
            {MSG.successTitle(classroom.name)}
          </h2>
          {subtitleParts.length > 0 ? (
            <p className="mt-1 text-sm text-(--vaasenk-muted)">
              {subtitleParts.join(' · ')}
            </p>
          ) : null}
        </div>

        {/* Invite code — the prominent hand-off */}
        <div className="rounded-[24px] border border-(--vaasenk-line-sand) bg-white/80 p-6 text-center shadow-[0_8px_24px_rgba(160,0,0,0.08)]">
          <p className="text-xs font-medium uppercase tracking-wider text-(--vaasenk-muted)">
            {MSG.inviteCodeLabel}
          </p>
          <p className="mt-2 select-all font-mono text-4xl font-bold tracking-[0.35em] text-(--vaasenk-red)">
            {code}
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <VaasenkButton
              variant="primary"
              size="md"
              type="button"
              onClick={onCopy}
            >
              {codeCopied ? (
                <>
                  <Check className="size-4" />
                  {MSG.copied}
                </>
              ) : (
                <>
                  <Copy className="size-4" />
                  {MSG.copyCode}
                </>
              )}
            </VaasenkButton>
            <VaasenkButton
              variant="secondary"
              size="md"
              type="button"
              onClick={onShare}
            >
              <Share2 className="size-4" />
              {MSG.share}
            </VaasenkButton>
          </div>
          <p className="mt-4 text-sm text-(--vaasenk-muted)">{MSG.successBody}</p>
        </div>

        {error ? (
          <p
            role="alert"
            aria-live="polite"
            className="rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-4 py-3 text-sm text-(--vaasenk-danger)"
          >
            {error}
          </p>
        ) : null}
      </div>

      {/* Footer actions */}
      <footer className="flex flex-col items-stretch gap-2 border-t border-(--vaasenk-line-sand)/60 bg-white/40 px-6 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={`/admin/syllabus`}
          onClick={onDone}
          className="hidden text-sm font-medium text-(--vaasenk-deep-maroon) underline-offset-2 hover:underline sm:inline"
        >
          Map a syllabus →
        </Link>
        <div className="flex items-center justify-end gap-2">
          <VaasenkButton
            variant="ghost"
            size="md"
            type="button"
            onClick={onCreateAnother}
          >
            <Plus className="size-4" />
            {MSG.createAnother}
          </VaasenkButton>
          <VaasenkButton
            variant="primary"
            size="md"
            type="button"
            onClick={onDone}
          >
            <CheckCircle2 className="size-4" />
            {MSG.done}
          </VaasenkButton>
        </div>
      </footer>
    </div>
  );
}

// ===========================================================================
// Field + Select primitives (local — narrowly scoped to this drawer)
// ===========================================================================

function Field({
  id,
  label,
  required,
  optionalLabel,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  optionalLabel?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
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
        {optionalLabel && !required ? (
          <span className="text-xs font-medium text-(--vaasenk-subtle)">
            {optionalLabel}
          </span>
        ) : null}
      </div>
      {/* Inject describedby onto the control via a clone-free wrapper: the
          control already carries the same id, and the hint id is announced
          through aria-describedby set on the control itself where present. */}
      <div aria-describedby={hintId}>{children}</div>
      {hint ? (
        <p id={hintId} className="text-xs text-(--vaasenk-subtle)">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Select({
  id,
  value,
  onChange,
  disabled,
  placeholder,
  options,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="min-h-[44px] w-full rounded-2xl border border-(--vaasenk-line-sand) bg-white/85 px-4 py-3 text-base text-(--vaasenk-ink) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-70"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Syllabus select with per-option AI-readiness status appended to the label.
 * Native <select> can't render rich rows, so we suffix the status text and
 * surface a Sparkles affordance + status chip beneath the control for the
 * currently-selected syllabus.
 */
function SyllabusSelect({
  id,
  value,
  onChange,
  disabled,
  options,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  options: SyllabusOption[];
}) {
  const selected = options.find((o) => o.id === value) ?? null;
  return (
    <div className="space-y-2">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="min-h-[44px] w-full rounded-2xl border border-(--vaasenk-line-sand) bg-white/85 px-4 py-3 text-base text-(--vaasenk-ink) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-70"
      >
        <option value="">{MSG.syllabusPlaceholder}</option>
        {options.map((o) => {
          const meta = SYLLABUS_STATUS_META[o.status];
          const board = o.boardType ? ` · ${o.boardType}` : '';
          return (
            <option key={o.id} value={o.id}>
              {o.name}
              {board} — {meta.label}
            </option>
          );
        })}
      </select>
      {selected ? (
        <p
          className={cn(
            'inline-flex items-center gap-1.5 text-xs font-semibold',
            SYLLABUS_STATUS_META[selected.status].tone,
          )}
        >
          <Sparkles className="size-3.5" aria-hidden />
          {SYLLABUS_STATUS_META[selected.status].label}
        </p>
      ) : null}
    </div>
  );
}

function FormSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy
      className="flex flex-1 flex-col gap-5 px-6 py-6"
    >
      <span className="sr-only">{MSG.loadingForm}</span>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-24 rounded-md bg-(--vaasenk-peach-wash)/60" />
          <div className="h-11 w-full rounded-2xl bg-(--vaasenk-peach-wash)/60" />
        </div>
      ))}
    </div>
  );
}
