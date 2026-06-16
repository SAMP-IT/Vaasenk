'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileDown,
  Info,
  KeyRound,
  Link2,
  Loader2,
  PartyPopper,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { GlassCard } from '@/components/ui/glass-card';
import { VaasenkButton } from '@/components/ui/vaasenk-button';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { PaperPreview } from './paper-preview';
import {
  EXAM_TYPE_LABELS,
  type QuestionPaperDetail,
  type WizardData,
} from './wizard-types';

/**
 * Step 6 — Export.
 *
 * Two-column layout on lg+:
 *   • Left: final paper preview (read-only PaperPreview).
 *   • Right: export + download + publish actions.
 *
 * Flow:
 *   1. Teacher clicks "Export to PDF" → POST /export → enables downloads.
 *   2. Teacher can download paper PDF and answer key PDF.
 *   3. Teacher clicks "Publish" → confirm modal → POST /publish.
 *   4. Success banner + "Back to classroom" CTA.
 */

const MSG = {
  heading: 'Export & publish',
  helper:
    'Generate the PDFs, then publish to notify your students. You can re-export any time.',
  disclaimer: 'AI can make mistakes. Verify questions before publishing.',

  exportTitle: 'Generate PDFs',
  exportHelper:
    'Builds the paper PDF (and answer key PDF if enabled). You can re-export to refresh signed URLs.',
  exportButton: 'Export to PDF',
  reExportButton: 'Re-export',
  exporting: 'Exporting…',
  exportSuccess: 'PDFs ready',
  exportFailed: 'Export failed. Try again.',

  downloadPaper: 'Download paper PDF',
  downloadAnswerKey: 'Download answer key PDF',
  noPaperUrl: 'Export to PDF first to enable downloads.',
  copyLink: 'Copy paper link',
  copied: 'Link copied!',

  publishTitle: 'Publish to classroom',
  publishHelper:
    'Notifies all students in this classroom that the paper is available.',
  publishButton: 'Publish to classroom',
  publishing: 'Publishing…',
  publishDisabled: 'Export to PDF first to enable publishing.',
  publishConfirmTitle: 'Publish this paper?',
  publishConfirmBody:
    'All students in this classroom will be notified that the paper is available. You can republish after edits.',
  publishConfirmCta: 'Yes, publish now',
  publishConfirmCancel: 'Not yet',
  publishFailed: 'Publish failed. Try again.',
  publishedTitle: 'Paper published',
  publishedBody:
    'Your students have been notified. The paper is available in the classroom’s Papers tab.',

  backToClassroom: 'Back to classroom',
} as const;

export function StepExport({
  paper,
  classroomId,
  wizardData,
  onPaperUpdate,
  onPublished,
}: {
  paper: QuestionPaperDetail;
  classroomId: string;
  wizardData: WizardData;
  onPaperUpdate: (next: QuestionPaperDetail) => void;
  onPublished: () => void;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const hasExport = Boolean(paper.fileUrl && paper.fileSignedUrl);
  const isPublished = paper.status === 'PUBLISHED';

  const runExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const res = await apiFetch<{ paper: QuestionPaperDetail }>(
        `/api/v1/question-papers/${paper.id}/export`,
        { method: 'POST', body: {} },
      );
      onPaperUpdate(res.paper);
    } catch (err) {
      setExportError(
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : MSG.exportFailed,
      );
    } finally {
      setExporting(false);
    }
  };

  const runPublish = async () => {
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await apiFetch<{ paper: QuestionPaperDetail }>(
        `/api/v1/question-papers/${paper.id}/publish`,
        { method: 'POST', body: {} },
      );
      onPaperUpdate(res.paper);
      setPublishOpen(false);
      onPublished();
    } catch (err) {
      setPublishError(
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : MSG.publishFailed,
      );
    } finally {
      setPublishing(false);
    }
  };

  const copyLink = async () => {
    if (!paper.fileSignedUrl) return;
    try {
      await navigator.clipboard.writeText(paper.fileSignedUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard write can fail in insecure contexts — fail silently.
    }
  };

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

      {isPublished ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'overflow-hidden rounded-3xl border border-(--vaasenk-success)/40 px-5 py-5',
            'bg-(--vaasenk-success)/10',
            'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
          )}
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="grid size-11 shrink-0 place-items-center rounded-2xl bg-(--vaasenk-success)/20 text-(--vaasenk-success)"
            >
              <PartyPopper className="size-5" />
            </span>
            <div>
              <p className="text-base font-semibold text-(--vaasenk-success)">
                {MSG.publishedTitle}
              </p>
              <p className="mt-0.5 text-sm text-(--vaasenk-ink)/80">
                {MSG.publishedBody}
              </p>
            </div>
          </div>
          <Link href={`/teacher/classrooms/${classroomId}`}>
            <VaasenkButton variant="primary" size="md">
              {MSG.backToClassroom}
              <ArrowRight className="size-4" />
            </VaasenkButton>
          </Link>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Read-only preview */}
        <PaperPreview
          content={paper.structuredContent}
          totalMarks={paper.totalMarks}
          examTypeLabel={EXAM_TYPE_LABELS[paper.examType]}
          durationMinutes={paper.durationMinutes}
          interactive={false}
          showAnswerKey={wizardData.includeAnswerKey}
        />

        {/* Actions sidebar */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          {/* Export */}
          <GlassCard padding="sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-(--vaasenk-deep-maroon)">
              <FileDown className="size-4" aria-hidden />
              {MSG.exportTitle}
            </h3>
            <p className="mt-1 text-xs text-(--vaasenk-muted)">
              {MSG.exportHelper}
            </p>

            <VaasenkButton
              variant="primary"
              size="lg"
              onClick={runExport}
              disabled={exporting}
              className="mt-4 w-full"
            >
              {exporting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {MSG.exporting}
                </>
              ) : hasExport ? (
                <>
                  <Sparkles className="size-4" />
                  {MSG.reExportButton}
                </>
              ) : (
                <>
                  <FileDown className="size-4" />
                  {MSG.exportButton}
                </>
              )}
            </VaasenkButton>

            {hasExport && !exporting ? (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-(--vaasenk-success)">
                <CheckCircle2 className="size-3" aria-hidden />
                {MSG.exportSuccess}
              </p>
            ) : null}

            {exportError ? (
              <p
                role="alert"
                className="mt-3 inline-flex items-center gap-1.5 rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-3 py-2 text-xs text-(--vaasenk-danger)"
              >
                <AlertCircle className="size-3" aria-hidden />
                {exportError}
              </p>
            ) : null}

            {/* Download buttons */}
            <div className="mt-4 flex flex-col gap-2">
              <DownloadLink
                href={paper.fileSignedUrl}
                label={MSG.downloadPaper}
                icon={<Download className="size-4" aria-hidden />}
              />
              {wizardData.includeAnswerKey ? (
                <DownloadLink
                  href={paper.answerKeySignedUrl}
                  label={MSG.downloadAnswerKey}
                  icon={<KeyRound className="size-4" aria-hidden />}
                />
              ) : null}
              <button
                type="button"
                onClick={copyLink}
                disabled={!paper.fileSignedUrl}
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full border border-(--vaasenk-line-sand) bg-white/85 px-4 py-2 text-xs font-semibold text-(--vaasenk-deep-maroon) transition-colors hover:border-(--vaasenk-red)/30 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="size-4 text-(--vaasenk-success)" />
                    {MSG.copied}
                  </>
                ) : (
                  <>
                    <Link2 className="size-4" />
                    {MSG.copyLink}
                  </>
                )}
              </button>
              {!paper.fileSignedUrl ? (
                <p className="text-xs text-(--vaasenk-subtle)">
                  {MSG.noPaperUrl}
                </p>
              ) : null}
            </div>
          </GlassCard>

          {/* Publish */}
          <GlassCard padding="sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-(--vaasenk-deep-maroon)">
              <Sparkles className="size-4" aria-hidden />
              {MSG.publishTitle}
            </h3>
            <p className="mt-1 text-xs text-(--vaasenk-muted)">
              {MSG.publishHelper}
            </p>

            <VaasenkButton
              variant="primary"
              size="md"
              onClick={() => setPublishOpen(true)}
              disabled={!hasExport || publishing || isPublished}
              className="mt-4 w-full"
            >
              {isPublished ? (
                <>
                  <CheckCircle2 className="size-4" />
                  Published
                </>
              ) : publishing ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {MSG.publishing}
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  {MSG.publishButton}
                </>
              )}
            </VaasenkButton>

            {!hasExport && !isPublished ? (
              <p className="mt-2 text-xs text-(--vaasenk-subtle)">
                {MSG.publishDisabled}
              </p>
            ) : null}
            {publishError ? (
              <p
                role="alert"
                className="mt-3 rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-3 py-2 text-xs text-(--vaasenk-danger)"
              >
                {publishError}
              </p>
            ) : null}
          </GlassCard>
        </aside>
      </div>

      {/* Publish confirmation modal */}
      <Dialog.Root open={publishOpen} onOpenChange={setPublishOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-(--vaasenk-deep-maroon)/30 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-(--vaasenk-line-sand) bg-white p-6 shadow-[0_32px_90px_rgba(160,0,0,0.18)] focus:outline-none">
            <Dialog.Title className="text-base font-semibold text-(--vaasenk-ink)">
              {MSG.publishConfirmTitle}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-(--vaasenk-muted)">
              {MSG.publishConfirmBody}
            </Dialog.Description>

            <div className="mt-5 flex items-center justify-end gap-3">
              <VaasenkButton
                variant="ghost"
                size="md"
                onClick={() => setPublishOpen(false)}
                disabled={publishing}
              >
                {MSG.publishConfirmCancel}
              </VaasenkButton>
              <VaasenkButton
                variant="primary"
                size="md"
                onClick={runPublish}
                disabled={publishing}
              >
                {publishing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {MSG.publishing}
                  </>
                ) : (
                  MSG.publishConfirmCta
                )}
              </VaasenkButton>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function DownloadLink({
  href,
  label,
  icon,
}: {
  href: string | null;
  label: string;
  icon: React.ReactNode;
}) {
  if (!href) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex min-h-[40px] cursor-not-allowed items-center justify-center gap-2 rounded-full border border-(--vaasenk-line-sand) bg-white/55 px-4 py-2 text-xs font-semibold text-(--vaasenk-subtle) opacity-60"
      >
        {icon}
        {label}
      </button>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      download
      className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full bg-(image:--gradient-teacher-orange) px-4 py-2 text-xs font-semibold text-white shadow-[0_8px_24px_rgba(160,0,0,0.18)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(160,0,0,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red) focus-visible:ring-offset-2 focus-visible:ring-offset-(--vaasenk-warm-canvas)"
    >
      {icon}
      {label}
    </a>
  );
}
