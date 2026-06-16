'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  BookOpen,
  CheckCircle2,
  Info,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { GlassCard } from '@/components/ui/glass-card';
import { VaasenkButton } from '@/components/ui/vaasenk-button';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { PaperPreview } from './paper-preview';
import {
  EXAM_TYPE_LABELS,
  type QuestionItem,
  type QuestionPaperDetail,
  type StructuredContent,
  type WizardData,
} from './wizard-types';

/**
 * Step 5 — Preview & Edit.
 *
 * Two-column layout on lg+:
 *   • Left: paper preview (rendered via <PaperPreview>) — edit / regenerate
 *     menus per question.
 *   • Right: paper metadata edit form, AI confidence badge, source card,
 *     validation card.
 *
 * Editing dispatches PATCH /question-papers/:id with the modified
 * structuredContent (the backend accepts a partial structuredContent
 * replacement). Regenerate dispatches POST /regenerate-question.
 */

const MSG = {
  heading: 'Review & polish',
  helper:
    'Read the paper, fix what doesn’t fit your class, and regenerate any question you don’t love.',
  disclaimer: 'AI can make mistakes. Verify questions before publishing.',

  metaHeading: 'Paper details',
  titleLabel: 'Title',
  durationLabel: 'Duration (minutes)',
  savedAt: 'Saved',
  saving: 'Saving…',
  saveFailed: 'Couldn’t save. We’ll retry on the next change.',

  confidenceHeading: 'AI confidence',
  confidenceHigh: 'High confidence',
  confidenceMedium: 'Medium — review carefully',
  confidenceLow: 'Low — manual review required',
  confidenceUnavailable: 'Not scored',

  sourceHeading: 'Source',
  syllabusLabel: 'Syllabus',
  versionLabel: 'Version',
  samplePapersLabel: 'Sample papers',

  validationHeading: 'Validation',
  validMarks: (actual: number, target: number) =>
    `Marks: ${actual} of ${target}`,
  validMarksOk: 'Marks match the target.',
  validMarksWarn: (diff: number) =>
    diff > 0
      ? `Short by ${diff} marks.`
      : `Over by ${Math.abs(diff)} marks.`,
  validQuestions: (n: number) => `${n} question${n === 1 ? '' : 's'}`,
  validSections: (n: number) => `${n} section${n === 1 ? '' : 's'}`,

  // Edit drawer
  editTitle: 'Edit question',
  editQuestionText: 'Question text',
  editOptions: 'Options',
  editOptionPlaceholder: (i: number) => `Option ${String.fromCharCode(97 + i)}`,
  editAddOption: 'Add option',
  editRemoveOption: 'Remove option',
  editAnswer: 'Answer key',
  editMarks: 'Marks',
  editSave: 'Save question',
  editCancel: 'Cancel',
  editSaveFailed: 'Couldn’t save changes. Try again.',

  // Regenerate dialog
  regenTitle: 'Regenerate this question',
  regenHelper:
    'Vaasenk AI will draft a new question to replace this one. Optionally give it a hint to steer the result.',
  regenHintLabel: 'Hint (optional)',
  regenHintPlaceholder:
    'e.g. Make this harder, or focus on real-world examples',
  regenConfirm: 'Regenerate',
  regenWorking: 'Regenerating…',
  regenFailed: 'Couldn’t regenerate. Try again.',
  regenCancel: 'Cancel',
} as const;

type Coord = { sectionIndex: number; questionIndex: number };

export function StepPreviewEdit({
  paper,
  onPaperUpdate,
  wizardData,
}: {
  paper: QuestionPaperDetail;
  onPaperUpdate: (next: QuestionPaperDetail) => void;
  wizardData: WizardData;
}) {
  // Controlled local metadata (PATCH on blur)
  const [title, setTitle] = useState(paper.title);
  const [duration, setDuration] = useState<string>(
    paper.durationMinutes != null ? String(paper.durationMinutes) : '',
  );
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaSavedAt, setMetaSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setTitle(paper.title);
    setDuration(
      paper.durationMinutes != null ? String(paper.durationMinutes) : '',
    );
  }, [paper.id, paper.title, paper.durationMinutes]);

  const saveMeta = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    const newDuration = duration.trim() === '' ? null : Number(duration);
    if (
      trimmedTitle === paper.title &&
      newDuration === paper.durationMinutes
    ) {
      return;
    }
    setSavingMeta(true);
    setMetaError(null);
    try {
      const res = await apiFetch<{ paper: QuestionPaperDetail }>(
        `/api/v1/question-papers/${paper.id}`,
        {
          method: 'PATCH',
          body: {
            title: trimmedTitle,
            ...(newDuration !== null
              ? { durationMinutes: newDuration }
              : { durationMinutes: null }),
          },
        },
      );
      onPaperUpdate(res.paper);
      setMetaSavedAt(Date.now());
    } catch (err) {
      setMetaError(
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : MSG.saveFailed,
      );
    } finally {
      setSavingMeta(false);
    }
  };

  // ----- Edit / regenerate dialogs -----
  const [editCoord, setEditCoord] = useState<Coord | null>(null);
  const [regenCoord, setRegenCoord] = useState<Coord | null>(null);
  const [regeneratingCoord, setRegeneratingCoord] = useState<Coord | null>(null);
  const [regenError, setRegenError] = useState<string | null>(null);

  const runRegenerate = async (coord: Coord, hint: string | null) => {
    setRegeneratingCoord(coord);
    setRegenError(null);
    try {
      const res = await apiFetch<{ paper: QuestionPaperDetail }>(
        `/api/v1/question-papers/${paper.id}/regenerate-question`,
        {
          method: 'POST',
          body: {
            sectionIndex: coord.sectionIndex,
            questionIndex: coord.questionIndex,
            ...(hint && hint.trim() ? { hint: hint.trim() } : {}),
          },
        },
      );
      onPaperUpdate(res.paper);
      setRegenCoord(null);
    } catch (err) {
      setRegenError(
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : MSG.regenFailed,
      );
    } finally {
      setRegeneratingCoord(null);
    }
  };

  // ----- Validation summary -----
  const totals = useMemo(() => {
    let marks = 0;
    let questions = 0;
    paper.structuredContent.sections.forEach((s) => {
      questions += s.questions.length;
      s.questions.forEach((q) => {
        marks += Number(q.marks) || 0;
      });
    });
    return {
      marks,
      questions,
      sections: paper.structuredContent.sections.length,
    };
  }, [paper.structuredContent]);

  const marksMatch = totals.marks === paper.totalMarks;
  const confidenceTone = scoreToTone(paper.aiConfidence);

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight text-(--vaasenk-ink)">
          {MSG.heading}
        </h2>
        <p className="text-sm text-(--vaasenk-muted)">{MSG.helper}</p>
        <p className="inline-flex items-center gap-2 rounded-full border border-(--vaasenk-gold)/40 bg-(--vaasenk-gold)/10 px-3 py-1 text-xs font-medium text-(--vaasenk-deep-maroon)">
          <Info className="size-3.5" aria-hidden />
          {MSG.disclaimer}
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Paper preview */}
        <PaperPreview
          content={paper.structuredContent}
          title={title}
          durationMinutes={duration.trim() === '' ? null : Number(duration)}
          totalMarks={paper.totalMarks}
          examTypeLabel={EXAM_TYPE_LABELS[paper.examType]}
          interactive
          onEditQuestion={(s, q) =>
            setEditCoord({ sectionIndex: s, questionIndex: q })
          }
          onRegenerateQuestion={(s, q) =>
            setRegenCoord({ sectionIndex: s, questionIndex: q })
          }
          regeneratingCoord={regeneratingCoord}
          showAnswerKey={wizardData.includeAnswerKey}
        />

        {/* Sidebar — sticky on lg+ */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          {/* Metadata edit */}
          <GlassCard padding="sm">
            <h3 className="text-sm font-semibold text-(--vaasenk-deep-maroon)">
              {MSG.metaHeading}
            </h3>
            <div className="mt-3 space-y-3">
              <MetaField
                label={MSG.titleLabel}
                value={title}
                onChange={setTitle}
                onBlur={saveMeta}
                disabled={savingMeta}
              />
              <MetaField
                label={MSG.durationLabel}
                value={duration}
                onChange={setDuration}
                onBlur={saveMeta}
                type="number"
                disabled={savingMeta}
                min={15}
                max={360}
              />

              {savingMeta ? (
                <p className="inline-flex items-center gap-1.5 text-xs text-(--vaasenk-muted)">
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                  {MSG.saving}
                </p>
              ) : metaError ? (
                <p
                  role="alert"
                  className="text-xs font-medium text-(--vaasenk-danger)"
                >
                  {metaError}
                </p>
              ) : metaSavedAt ? (
                <p className="inline-flex items-center gap-1.5 text-xs text-(--vaasenk-success)">
                  <CheckCircle2 className="size-3" aria-hidden />
                  {MSG.savedAt}
                </p>
              ) : null}
            </div>
          </GlassCard>

          {/* AI confidence */}
          <GlassCard padding="sm">
            <h3 className="text-sm font-semibold text-(--vaasenk-deep-maroon)">
              {MSG.confidenceHeading}
            </h3>
            <div className="mt-3">
              <span
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold',
                  confidenceTone.classes,
                )}
              >
                <Sparkles className="size-3.5" aria-hidden />
                {confidenceLabel(paper.aiConfidence)}
                {typeof paper.aiConfidence === 'number' ? (
                  <span className="font-normal opacity-80">
                    · {Math.round(paper.aiConfidence * 100)}%
                  </span>
                ) : null}
              </span>
            </div>
          </GlassCard>

          {/* Source */}
          <GlassCard padding="sm">
            <h3 className="text-sm font-semibold text-(--vaasenk-deep-maroon)">
              {MSG.sourceHeading}
            </h3>
            <div className="mt-3 space-y-2 text-xs">
              <SourceRow
                label={MSG.syllabusLabel}
                value={paper.sourceSummary.syllabusName || '—'}
              />
              <SourceRow
                label={MSG.versionLabel}
                value={paper.sourceSummary.syllabusVersion || '—'}
              />
              <div>
                <p className="text-(--vaasenk-muted)">{MSG.samplePapersLabel}</p>
                {paper.sourceSummary.samplePaperNames.length === 0 ? (
                  <p className="mt-0.5 text-(--vaasenk-subtle)">None</p>
                ) : (
                  <ul className="mt-1 space-y-0.5">
                    {paper.sourceSummary.samplePaperNames.map((n) => (
                      <li
                        key={n}
                        className="flex items-center gap-1.5 text-(--vaasenk-ink)"
                      >
                        <BookOpen className="size-3 text-(--vaasenk-deep-maroon)" />
                        <span className="truncate">{n}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </GlassCard>

          {/* Validation */}
          <GlassCard padding="sm">
            <h3 className="text-sm font-semibold text-(--vaasenk-deep-maroon)">
              {MSG.validationHeading}
            </h3>
            <div className="mt-3 space-y-2 text-xs">
              <div
                className={cn(
                  'rounded-xl border px-3 py-2',
                  marksMatch
                    ? 'border-(--vaasenk-success)/30 bg-(--vaasenk-success)/8 text-(--vaasenk-success)'
                    : 'border-(--vaasenk-warning)/30 bg-(--vaasenk-warning)/8 text-(--vaasenk-deep-maroon)',
                )}
              >
                <p className="font-semibold">
                  {MSG.validMarks(totals.marks, paper.totalMarks)}
                </p>
                <p className="mt-0.5 opacity-90">
                  {marksMatch
                    ? MSG.validMarksOk
                    : MSG.validMarksWarn(paper.totalMarks - totals.marks)}
                </p>
              </div>
              <p className="text-(--vaasenk-muted)">
                {MSG.validQuestions(totals.questions)} across{' '}
                {MSG.validSections(totals.sections)}.
              </p>
            </div>
          </GlassCard>
        </aside>
      </div>

      {/* Edit drawer */}
      {editCoord ? (
        <EditQuestionDrawer
          paper={paper}
          coord={editCoord}
          onClose={() => setEditCoord(null)}
          onSaved={(next) => {
            onPaperUpdate(next);
            setEditCoord(null);
          }}
          includeAnswerKey={wizardData.includeAnswerKey}
        />
      ) : null}

      {/* Regenerate dialog */}
      {regenCoord ? (
        <RegenerateDialog
          regenerating={
            regeneratingCoord?.sectionIndex === regenCoord.sectionIndex &&
            regeneratingCoord?.questionIndex === regenCoord.questionIndex
          }
          error={regenError}
          onClose={() => {
            if (regeneratingCoord) return;
            setRegenCoord(null);
            setRegenError(null);
          }}
          onStart={(hint) => runRegenerate(regenCoord, hint)}
        />
      ) : null}
    </div>
  );
}

function MetaField({
  label,
  value,
  onChange,
  onBlur,
  type = 'text',
  disabled,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  type?: 'text' | 'number';
  disabled?: boolean;
  min?: number;
  max?: number;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className="block text-xs font-medium text-(--vaasenk-deep-maroon)"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        min={min}
        max={max}
        className="w-full min-h-[40px] rounded-xl border border-(--vaasenk-line-sand) bg-white/85 px-3 py-2 text-sm text-(--vaasenk-ink) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30 disabled:opacity-70"
      />
    </div>
  );
}

function SourceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-(--vaasenk-muted)">{label}</span>
      <span className="max-w-[180px] truncate text-right font-medium text-(--vaasenk-ink)">
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit Question Drawer
// ---------------------------------------------------------------------------

function EditQuestionDrawer({
  paper,
  coord,
  onClose,
  onSaved,
  includeAnswerKey,
}: {
  paper: QuestionPaperDetail;
  coord: Coord;
  onClose: () => void;
  onSaved: (next: QuestionPaperDetail) => void;
  includeAnswerKey: boolean;
}) {
  const initial = paper.structuredContent.sections[coord.sectionIndex]
    ?.questions[coord.questionIndex] as QuestionItem | undefined;
  const [text, setText] = useState(initial?.text ?? '');
  const [options, setOptions] = useState<string[]>(
    initial?.options ? [...initial.options] : [],
  );
  const [answer, setAnswer] = useState(initial?.answer ?? '');
  const [marks, setMarks] = useState<number>(initial?.marks ?? 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textareaId = useId();
  const answerId = useId();
  const marksId = useId();

  const save = async () => {
    if (!text.trim()) {
      setError('Question text is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const nextContent: StructuredContent = {
        ...paper.structuredContent,
        sections: paper.structuredContent.sections.map((s, sIdx) => {
          if (sIdx !== coord.sectionIndex) return s;
          return {
            ...s,
            questions: s.questions.map((q, qIdx) => {
              if (qIdx !== coord.questionIndex) return q;
              const trimmedOpts = options
                .map((o) => o.trim())
                .filter(Boolean);
              return {
                ...q,
                text: text.trim(),
                marks: Number(marks) || 1,
                options: trimmedOpts.length > 0 ? trimmedOpts : undefined,
                answer: answer.trim() ? answer.trim() : undefined,
              };
            }),
          };
        }),
      };
      const res = await apiFetch<{ paper: QuestionPaperDetail }>(
        `/api/v1/question-papers/${paper.id}`,
        {
          method: 'PATCH',
          body: { structuredContent: nextContent },
        },
      );
      onSaved(res.paper);
    } catch (err) {
      setError(err instanceof Error ? err.message : MSG.editSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-(--vaasenk-deep-maroon)/30 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col gap-4 overflow-y-auto bg-(image:--gradient-cream-sunrise) p-6 shadow-[0_32px_90px_rgba(160,0,0,0.18)] focus:outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-(--vaasenk-ink)">
              {MSG.editTitle}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="grid size-9 place-items-center rounded-full border border-(--vaasenk-line-sand) bg-white/80 text-(--vaasenk-deep-maroon) transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30"
              >
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description className="sr-only">
            Edit the selected question&apos;s text, options, answer, and marks.
          </Dialog.Description>

          <div className="space-y-2">
            <label
              htmlFor={textareaId}
              className="block text-sm font-medium text-(--vaasenk-deep-maroon)"
            >
              {MSG.editQuestionText}
            </label>
            <textarea
              id={textareaId}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="w-full resize-y rounded-2xl border border-(--vaasenk-line-sand) bg-white/85 px-4 py-3 text-base text-(--vaasenk-ink) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30"
            />
          </div>

          {/* Options */}
          <div className="space-y-2">
            <p className="block text-sm font-medium text-(--vaasenk-deep-maroon)">
              {MSG.editOptions}
            </p>
            <ul className="space-y-2">
              {options.map((opt, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="text-xs font-medium text-(--vaasenk-muted)">
                    ({String.fromCharCode(97 + i)})
                  </span>
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) =>
                      setOptions(
                        options.map((o, j) => (j === i ? e.target.value : o)),
                      )
                    }
                    aria-label={MSG.editOptionPlaceholder(i)}
                    placeholder={MSG.editOptionPlaceholder(i)}
                    className="w-full min-h-[40px] rounded-xl border border-(--vaasenk-line-sand) bg-white px-3 py-2 text-sm text-(--vaasenk-ink) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30"
                  />
                  <button
                    type="button"
                    onClick={() => setOptions(options.filter((_, j) => j !== i))}
                    aria-label={MSG.editRemoveOption}
                    className="grid size-9 shrink-0 place-items-center rounded-full border border-(--vaasenk-line-sand) bg-white text-(--vaasenk-danger) transition-colors hover:bg-(--vaasenk-danger)/10"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setOptions([...options, ''])}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-(--vaasenk-red)/40 bg-white/70 px-3 py-1.5 text-xs font-medium text-(--vaasenk-red) hover:bg-(--vaasenk-rose-wash)"
            >
              <Plus className="size-3.5" />
              {MSG.editAddOption}
            </button>
          </div>

          {includeAnswerKey ? (
            <div className="space-y-2">
              <label
                htmlFor={answerId}
                className="block text-sm font-medium text-(--vaasenk-deep-maroon)"
              >
                {MSG.editAnswer}
              </label>
              <textarea
                id={answerId}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={2}
                className="w-full resize-y rounded-2xl border border-(--vaasenk-line-sand) bg-white/85 px-4 py-3 text-sm text-(--vaasenk-ink) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30"
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <label
              htmlFor={marksId}
              className="block text-sm font-medium text-(--vaasenk-deep-maroon)"
            >
              {MSG.editMarks}
            </label>
            <input
              id={marksId}
              type="number"
              min={1}
              max={50}
              value={marks}
              onChange={(e) =>
                setMarks(Math.max(1, Number(e.target.value) || 1))
              }
              className="w-32 min-h-[40px] rounded-xl border border-(--vaasenk-line-sand) bg-white px-3 py-2 text-sm text-(--vaasenk-ink) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30"
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-3 py-2 text-xs text-(--vaasenk-danger)"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-2 flex items-center justify-end gap-3">
            <Dialog.Close asChild>
              <VaasenkButton variant="ghost" size="md" disabled={saving}>
                {MSG.editCancel}
              </VaasenkButton>
            </Dialog.Close>
            <VaasenkButton
              variant="primary"
              size="md"
              onClick={save}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {MSG.saving}
                </>
              ) : (
                MSG.editSave
              )}
            </VaasenkButton>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------------------
// Regenerate Dialog
// ---------------------------------------------------------------------------

function RegenerateDialog({
  regenerating,
  error,
  onClose,
  onStart,
}: {
  regenerating: boolean;
  error: string | null;
  onClose: () => void;
  onStart: (hint: string | null) => void;
}) {
  const [hint, setHint] = useState('');
  const hintId = useId();

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !regenerating && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-(--vaasenk-deep-maroon)/30 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={`${hintId}-helper`}
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-(--vaasenk-line-sand) bg-white p-6 shadow-[0_32px_90px_rgba(160,0,0,0.18)] focus:outline-none"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="grid size-10 shrink-0 place-items-center rounded-2xl bg-(--vaasenk-gold)/20 text-(--vaasenk-deep-maroon)"
            >
              <Sparkles className="size-5" />
            </span>
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold text-(--vaasenk-ink)">
                {MSG.regenTitle}
              </Dialog.Title>
              <p
                id={`${hintId}-helper`}
                className="mt-1 text-sm text-(--vaasenk-muted)"
              >
                {MSG.regenHelper}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <label
              htmlFor={hintId}
              className="block text-sm font-medium text-(--vaasenk-deep-maroon)"
            >
              {MSG.regenHintLabel}
            </label>
            <textarea
              id={hintId}
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              rows={3}
              disabled={regenerating}
              placeholder={MSG.regenHintPlaceholder}
              className="w-full resize-y rounded-2xl border border-(--vaasenk-line-sand) bg-white px-4 py-3 text-sm text-(--vaasenk-ink) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30 disabled:opacity-70"
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="mt-3 rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-3 py-2 text-xs text-(--vaasenk-danger)"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex items-center justify-end gap-3">
            <VaasenkButton
              variant="ghost"
              size="md"
              onClick={onClose}
              disabled={regenerating}
            >
              {MSG.regenCancel}
            </VaasenkButton>
            <VaasenkButton
              variant="primary"
              size="md"
              onClick={() => onStart(hint)}
              disabled={regenerating}
            >
              {regenerating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {MSG.regenWorking}
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  {MSG.regenConfirm}
                </>
              )}
            </VaasenkButton>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function confidenceLabel(score: number | null): string {
  if (score == null) return MSG.confidenceUnavailable;
  if (score >= 0.8) return MSG.confidenceHigh;
  if (score >= 0.5) return MSG.confidenceMedium;
  return MSG.confidenceLow;
}

function scoreToTone(score: number | null): { classes: string } {
  if (score == null) {
    return {
      classes:
        'border-(--vaasenk-line-sand) bg-white text-(--vaasenk-muted)',
    };
  }
  if (score >= 0.8) {
    return {
      classes:
        'border-(--vaasenk-success)/30 bg-(--vaasenk-success)/10 text-(--vaasenk-success)',
    };
  }
  if (score >= 0.5) {
    return {
      classes:
        'border-(--vaasenk-warning)/30 bg-(--vaasenk-warning)/10 text-(--vaasenk-deep-maroon)',
    };
  }
  return {
    classes:
      'border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 text-(--vaasenk-danger)',
  };
}
