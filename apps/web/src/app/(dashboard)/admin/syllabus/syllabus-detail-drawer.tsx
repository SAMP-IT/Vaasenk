'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  ArrowUpRight,
  Check,
  CircleAlert,
  ExternalLink,
  FileText,
  Inbox,
  Loader2,
  RefreshCw,
  Replace,
  Slash,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import * as React from 'react';
import { GlassCard } from '@/components/ui/glass-card';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { VaasenkButton } from '@/components/ui/vaasenk-button';
import { cn } from '@/lib/utils';
import { StatusBadge } from './syllabus-card';
import {
  formatAbsolute,
  formatBytes,
  formatRelative,
  PROCESSING_STATUS_VALUES,
  STATUS_LABELS,
  type ProcessingStatus,
  type ProcessingTimelineEntry,
  type SyllabusDetailView,
} from './syllabus-types';

/**
 * Right-side detail drawer (640 px) for a single syllabus.
 *
 * Why a drawer and not a dedicated /admin/syllabus/[id] page?
 *   - Lets the admin glance at one syllabus, jump to another, and act
 *     without losing the filtered list context.
 *   - Mirrors the upload + replace drawers — single mental model.
 *   - The detail data is small enough to refetch on each open; if we end up
 *     needing deep-linking or shareable URLs later we can promote it to a
 *     route in Sprint 3.4.
 */

type ActionCallback = (
  action: 'replace' | 'map' | 'reprocess' | 'archive' | 'restore',
) => void;

export function SyllabusDetailDrawer({
  open,
  onOpenChange,
  detail,
  loading,
  error,
  onRetry,
  onAction,
  actionInFlight,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: SyllabusDetailView | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onAction: ActionCallback;
  actionInFlight: 'reprocess' | 'archive' | 'restore' | null;
}) {
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
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col',
            'bg-(image:--gradient-cream-sunrise)',
            'border-l border-(--vaasenk-line-sand)',
            'shadow-[0_32px_90px_rgba(160,0,0,0.18)] focus:outline-none',
            'data-[state=open]:animate-in data-[state=open]:slide-in-from-right',
            'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right',
          )}
        >
          {/* Hero header — Admin Royal mini-strip + close */}
          <header className="relative overflow-hidden border-b border-(--vaasenk-line-sand)/60 bg-(image:--gradient-admin-royal) px-6 py-5 text-white">
            <div className="relative z-10 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-white/70">
                  Syllabus details
                </p>
                <Dialog.Title className="mt-1 line-clamp-2 text-xl font-semibold tracking-tight">
                  {detail?.name ?? 'Loading…'}
                </Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  <X className="size-4" />
                </button>
              </Dialog.Close>
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-white/15 blur-3xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-14 left-1/4 size-44 rounded-full bg-[#FFB000]/35 blur-3xl"
            />
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-6">
            {loading && !detail ? (
              <DetailSkeleton />
            ) : error && !detail ? (
              <div
                role="alert"
                className="space-y-4 rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-4 py-4 text-sm text-(--vaasenk-danger)"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <p>{error}</p>
                </div>
                <VaasenkButton variant="secondary" size="sm" onClick={onRetry}>
                  Retry
                </VaasenkButton>
              </div>
            ) : detail ? (
              <DetailBody
                detail={detail}
                onAction={onAction}
                actionInFlight={actionInFlight}
              />
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------------------
// Body — status, metadata, processing timeline, mapped classrooms, actions.
// ---------------------------------------------------------------------------

function DetailBody({
  detail,
  onAction,
  actionInFlight,
}: {
  detail: SyllabusDetailView;
  onAction: ActionCallback;
  actionInFlight: 'reprocess' | 'archive' | 'restore' | null;
}) {
  const canReprocess =
    detail.status === 'FAILED' || detail.status === 'AI_READY';
  const meta: Array<{ key: string; label: string; value: string }> = [
    { key: 'board', label: 'Board', value: detail.boardType ?? '—' },
    { key: 'class', label: 'Class', value: detail.class?.name ?? '—' },
    { key: 'subject', label: 'Subject', value: detail.subject?.name ?? '—' },
    { key: 'version', label: 'Version', value: detail.version ?? '—' },
    { key: 'language', label: 'Language', value: detail.language ?? '—' },
    { key: 'size', label: 'File size', value: formatBytes(detail.fileSizeBytes) },
    {
      key: 'pages',
      label: 'Pages',
      value: detail.pageCount ? String(detail.pageCount) : '—',
    },
    {
      key: 'chunks',
      label: 'Chunks',
      value: detail.chunksCount.toLocaleString('en-IN'),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Status + open PDF */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={detail.status} />
          {!detail.isActive ? (
            <span className="inline-flex items-center rounded-full bg-(--vaasenk-subtle)/20 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-(--vaasenk-muted)">
              Archived
            </span>
          ) : null}
          <span className="text-xs text-(--vaasenk-muted)">
            Uploaded {formatRelative(detail.createdAt)} ·{' '}
            {formatAbsolute(detail.createdAt)}
          </span>
        </div>
        {detail.fileSignedUrl ? (
          <a
            href={detail.fileSignedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-(--vaasenk-line-sand) bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-(--vaasenk-deep-maroon) transition-colors hover:bg-white hover:text-(--vaasenk-red) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30"
          >
            <FileText className="size-3.5" />
            Open PDF
            <ExternalLink className="size-3" aria-hidden />
          </a>
        ) : null}
      </div>

      {detail.status === 'FAILED' && detail.errorMessage ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-4 py-3 text-sm text-(--vaasenk-danger)"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">Processing failed</p>
            <p className="mt-1 text-(--vaasenk-danger)/85">
              {detail.errorMessage}
            </p>
          </div>
        </div>
      ) : null}

      {/* Metadata grid */}
      <GlassCard padding="md">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-(--vaasenk-muted)">
          Metadata
        </h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          {meta.map((m) => (
            <div key={m.key} className="min-w-0">
              <dt className="text-xs text-(--vaasenk-subtle)">{m.label}</dt>
              <dd className="mt-0.5 truncate text-sm font-semibold text-(--vaasenk-ink)">
                {m.value}
              </dd>
            </div>
          ))}
        </dl>
      </GlassCard>

      {/* Processing timeline */}
      <GlassCard padding="md">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-(--vaasenk-muted)">
            Processing timeline
          </h3>
          {canReprocess ? (
            <VaasenkButton
              variant="secondary"
              size="sm"
              type="button"
              disabled={actionInFlight === 'reprocess'}
              onClick={() => onAction('reprocess')}
            >
              {actionInFlight === 'reprocess' ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Queueing…
                </>
              ) : (
                <>
                  <RefreshCw className="size-4" />
                  Reprocess
                </>
              )}
            </VaasenkButton>
          ) : null}
        </div>
        <Timeline
          timeline={detail.processingTimeline}
          currentStatus={detail.status}
          errorMessage={detail.errorMessage}
        />
      </GlassCard>

      {/* Mapped classrooms */}
      <GlassCard padding="md">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-(--vaasenk-muted)">
              Mapped classrooms
            </h3>
            <p className="mt-1 text-xs text-(--vaasenk-subtle)">
              {detail.mappedClassrooms.length === 0
                ? 'Map at least one classroom so the AI assistant can ground responses here.'
                : `${detail.mappedClassrooms.length} ${detail.mappedClassrooms.length === 1 ? 'classroom uses' : 'classrooms use'} this syllabus.`}
            </p>
          </div>
          <VaasenkButton
            variant="secondary"
            size="sm"
            type="button"
            onClick={() => onAction('map')}
          >
            <Users className="size-4" />
            Map more
          </VaasenkButton>
        </div>
        {detail.mappedClassrooms.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-2">
            {detail.mappedClassrooms.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-2xl border border-(--vaasenk-line-sand)/70 bg-white/65 px-4 py-2.5"
              >
                <div
                  aria-hidden
                  className="grid size-8 shrink-0 place-items-center rounded-xl bg-(--vaasenk-peach-wash) text-(--vaasenk-red)"
                >
                  <Sparkles className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-(--vaasenk-ink)">
                    {c.name}
                  </p>
                  <p className="truncate text-xs text-(--vaasenk-muted)">
                    {[c.class?.name, c.section?.name, c.subject?.name]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                    {c.teacher?.name ? ` · ${c.teacher.name}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </GlassCard>

      {/* Deferred — chunk inspection */}
      <GlassCard padding="sm" className="bg-white/55">
        <div className="flex items-center gap-2 text-xs text-(--vaasenk-muted)">
          <Slash aria-hidden className="size-3.5 text-(--vaasenk-subtle)" />
          <span>
            Chunk inspection arrives in Sprint 4 — once RAG retrieval is live
            you will be able to preview each chunk and the embedding similarity
            scores here.
          </span>
        </div>
      </GlassCard>

      {/* Actions footer */}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-(--vaasenk-line-sand)/60 pt-4">
        <VaasenkButton
          variant="ghost"
          size="md"
          type="button"
          onClick={() => onAction('replace')}
        >
          <Replace className="size-4" />
          Replace version
        </VaasenkButton>
        {detail.isActive ? (
          <VaasenkButton
            variant="ghost"
            size="md"
            type="button"
            disabled={actionInFlight === 'archive'}
            onClick={() => onAction('archive')}
            className="text-(--vaasenk-danger) hover:bg-(--vaasenk-danger)/10"
          >
            {actionInFlight === 'archive' ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Archiving…
              </>
            ) : (
              <>
                <Archive className="size-4" />
                Archive
              </>
            )}
          </VaasenkButton>
        ) : (
          <VaasenkButton
            variant="secondary"
            size="md"
            type="button"
            disabled={actionInFlight === 'restore'}
            onClick={() => onAction('restore')}
          >
            {actionInFlight === 'restore' ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Restoring…
              </>
            ) : (
              <>
                <ArchiveRestore className="size-4" />
                Restore
              </>
            )}
          </VaasenkButton>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline — vertical stepper UPLOADED → PROCESSING → AI_READY / FAILED.
// ---------------------------------------------------------------------------

function Timeline({
  timeline,
  currentStatus,
  errorMessage,
}: {
  timeline: ProcessingTimelineEntry[];
  currentStatus: ProcessingStatus;
  errorMessage: string | null;
}) {
  // Build a lookup of the most recent occurrence of each status from the
  // backend's processingTimeline array. The backend currently records
  // UPLOADED + PROCESSING + AI_READY/FAILED in chronological order.
  const stampByStatus = new Map<ProcessingStatus, string>();
  for (const entry of timeline) {
    // Last-write-wins so re-processed syllabi reflect the latest run.
    stampByStatus.set(entry.status, entry.at);
  }

  // Render the canonical 3 steps. The final step depends on terminal state.
  const finalStatus: 'AI_READY' | 'FAILED' =
    currentStatus === 'FAILED' ? 'FAILED' : 'AI_READY';

  const steps: Array<{
    status: ProcessingStatus;
    label: string;
    state: 'done' | 'current' | 'pending' | 'failed';
    at: string | null;
  }> = [];

  for (const s of ['UPLOADED', 'PROCESSING'] as const) {
    const at = stampByStatus.get(s) ?? null;
    let state: 'done' | 'current' | 'pending' | 'failed';
    if (currentStatus === s) state = 'current';
    else if (at) state = 'done';
    else state = 'pending';
    steps.push({ status: s, label: STATUS_LABELS[s], at, state });
  }

  // Final step — AI_READY or FAILED.
  const finalAt = stampByStatus.get(finalStatus) ?? null;
  steps.push({
    status: finalStatus,
    label: STATUS_LABELS[finalStatus],
    at: finalAt,
    state:
      currentStatus === finalStatus
        ? finalStatus === 'FAILED'
          ? 'failed'
          : 'done'
        : 'pending',
  });

  // Sanity hint — if backend ever surfaces a status we don't render in the
  // canonical 3 steps, this keeps PROCESSING_STATUS_VALUES exhaustively
  // referenced so the lint rule won't drop it from the import.
  void PROCESSING_STATUS_VALUES;

  return (
    <ol className="mt-4 flex flex-col gap-3" aria-label="Processing timeline">
      {steps.map((step, idx) => (
        <li
          key={step.status}
          className="relative flex gap-3 pl-1"
          aria-current={step.state === 'current' ? 'step' : undefined}
        >
          <div className="relative flex flex-col items-center">
            <StepDot state={step.state} />
            {idx < steps.length - 1 ? (
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 w-px flex-1',
                  step.state === 'done'
                    ? 'bg-(--vaasenk-success)/50'
                    : 'bg-(--vaasenk-line-sand)',
                )}
                style={{ minHeight: 18 }}
              />
            ) : null}
          </div>
          <div className="flex-1 pb-1">
            <p
              className={cn(
                'text-sm font-semibold',
                step.state === 'failed'
                  ? 'text-(--vaasenk-danger)'
                  : step.state === 'current'
                    ? 'text-(--vaasenk-deep-maroon)'
                    : step.state === 'done'
                      ? 'text-(--vaasenk-ink)'
                      : 'text-(--vaasenk-subtle)',
              )}
            >
              {step.label}
              {step.state === 'current' && step.status === 'PROCESSING' ? (
                <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-(--vaasenk-warning)">
                  <Loader2 className="size-3 animate-spin" />
                  in progress
                </span>
              ) : null}
            </p>
            <p className="text-xs text-(--vaasenk-muted)">
              {step.at
                ? `${formatRelative(step.at)} · ${formatAbsolute(step.at)}`
                : step.state === 'pending'
                  ? 'Pending'
                  : '—'}
            </p>
            {step.state === 'failed' && errorMessage ? (
              <p className="mt-1 text-xs text-(--vaasenk-danger)">
                {errorMessage}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function StepDot({
  state,
}: {
  state: 'done' | 'current' | 'pending' | 'failed';
}) {
  if (state === 'failed') {
    return (
      <span
        aria-hidden
        className="grid size-6 place-items-center rounded-full bg-(--vaasenk-danger) text-white"
      >
        <X className="size-3.5" />
      </span>
    );
  }
  if (state === 'done') {
    return (
      <span
        aria-hidden
        className="grid size-6 place-items-center rounded-full bg-(--vaasenk-success) text-white"
      >
        <Check className="size-3.5" />
      </span>
    );
  }
  if (state === 'current') {
    return (
      <span
        aria-hidden
        className="grid size-6 place-items-center rounded-full bg-(image:--gradient-brand-flame) text-white shadow-[0_0_0_4px_rgba(254,202,2,0.25)]"
      >
        <ArrowUpRight className="size-3.5" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="grid size-6 place-items-center rounded-full border-2 border-(--vaasenk-line-sand) bg-white text-(--vaasenk-subtle)"
    >
      <Inbox className="size-3" />
    </span>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy role="status" aria-live="polite">
      <span className="sr-only">Loading syllabus details…</span>
      <LoadingSkeleton variant="text" className="w-1/3" />
      <LoadingSkeleton className="h-24 w-full" />
      <LoadingSkeleton className="h-40 w-full" />
      <LoadingSkeleton className="h-36 w-full" />
    </div>
  );
}
