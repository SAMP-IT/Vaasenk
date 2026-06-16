'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  Archive,
  ArchiveRestore,
  CircleAlert,
  CircleCheck,
  Eye,
  FileText,
  Inbox,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Replace,
  Users,
} from 'lucide-react';
import * as React from 'react';
import { GlassCard } from '@/components/ui/glass-card';
import { cn } from '@/lib/utils';
import {
  formatBytes,
  formatRelative,
  STATUS_LABELS,
  STATUS_TOOLTIPS,
  type ProcessingStatus,
  type SyllabusView,
} from './syllabus-types';

// ---------------------------------------------------------------------------
// Status badge — distinct surface per ProcessingStatus, never colour-only
// (always paired with an icon + label, per accessibility spec).
// ---------------------------------------------------------------------------

export function StatusBadge({
  status,
  compact = false,
}: {
  status: ProcessingStatus;
  compact?: boolean;
}) {
  const styles: Record<ProcessingStatus, string> = {
    UPLOADED:
      'bg-(--vaasenk-muted)/15 text-(--vaasenk-muted) ring-(--vaasenk-line-sand)',
    PROCESSING:
      'bg-(--vaasenk-warning)/15 text-(--vaasenk-warning) ring-(--vaasenk-warning)/30',
    AI_READY:
      'bg-(--vaasenk-success)/15 text-(--vaasenk-success) ring-(--vaasenk-success)/30',
    FAILED:
      'bg-(--vaasenk-danger)/15 text-(--vaasenk-danger) ring-(--vaasenk-danger)/30',
  };
  const Icon = (
    {
      UPLOADED: Inbox,
      PROCESSING: Loader2,
      AI_READY: CircleCheck,
      FAILED: CircleAlert,
    } as const
  )[status];

  return (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1',
              compact ? 'px-2 py-0.5' : '',
              styles[status],
            )}
          >
            <Icon
              aria-hidden
              className={cn(
                'size-3.5 shrink-0',
                status === 'PROCESSING' && 'animate-spin',
              )}
            />
            {STATUS_LABELS[status]}
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            sideOffset={6}
            className="z-50 max-w-xs rounded-xl border border-(--vaasenk-line-sand) bg-white/95 px-3 py-2 text-xs text-(--vaasenk-deep-maroon) shadow-[0_18px_50px_rgba(74,5,8,0.14)] backdrop-blur-xl"
          >
            {STATUS_TOOLTIPS[status]}
            <Tooltip.Arrow className="fill-white/95" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

// ---------------------------------------------------------------------------
// Row dropdown menu — Radix DropdownMenu with the standard Vaasenk surface.
// `reprocess` is only enabled for FAILED or AI_READY (matches backend guard).
// ---------------------------------------------------------------------------

export type CardAction =
  | 'view'
  | 'replace'
  | 'map'
  | 'reprocess'
  | 'archive'
  | 'restore';

export function SyllabusActionsMenu({
  syllabus,
  inFlight,
  onAction,
}: {
  syllabus: SyllabusView;
  inFlight: boolean;
  onAction: (action: CardAction) => void;
}) {
  const canReprocess =
    syllabus.status === 'FAILED' || syllabus.status === 'AI_READY';
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Row actions"
          disabled={inFlight}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex size-9 items-center justify-center rounded-full text-(--vaasenk-muted) transition-colors hover:bg-(--vaasenk-rose-wash) hover:text-(--vaasenk-red) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {inFlight ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <MoreHorizontal className="size-4" />
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          onClick={(e) => e.stopPropagation()}
          className="z-50 min-w-[220px] overflow-hidden rounded-2xl border border-(--vaasenk-line-sand) bg-white/95 p-1.5 shadow-[0_18px_50px_rgba(74,5,8,0.16)] backdrop-blur-xl"
        >
          <ActionItem
            icon={Eye}
            onSelect={() => onAction('view')}
            tone="default"
          >
            View details
          </ActionItem>
          <ActionItem
            icon={Replace}
            onSelect={() => onAction('replace')}
            tone="default"
          >
            Replace version
          </ActionItem>
          <ActionItem
            icon={Users}
            onSelect={() => onAction('map')}
            tone="default"
          >
            Map to classrooms
          </ActionItem>
          <ActionItem
            icon={RefreshCw}
            onSelect={() => onAction('reprocess')}
            tone="default"
            disabled={!canReprocess}
            hint={
              canReprocess
                ? undefined
                : 'Reprocess is available once the syllabus is AI ready or failed.'
            }
          >
            Reprocess
          </ActionItem>
          <DropdownMenu.Separator className="my-1 h-px bg-(--vaasenk-line-sand)/60" />
          {syllabus.isActive ? (
            <ActionItem
              icon={Archive}
              onSelect={() => onAction('archive')}
              tone="danger"
            >
              Archive
            </ActionItem>
          ) : (
            <ActionItem
              icon={ArchiveRestore}
              onSelect={() => onAction('restore')}
              tone="default"
            >
              Restore
            </ActionItem>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ActionItem({
  icon: Icon,
  children,
  onSelect,
  disabled,
  tone,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  tone: 'default' | 'danger';
  hint?: string;
}) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={(e) => {
        e.preventDefault();
        if (!disabled) onSelect();
      }}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium outline-none transition-colors',
        tone === 'danger'
          ? 'text-(--vaasenk-danger) data-highlighted:bg-(--vaasenk-danger)/10'
          : 'text-(--vaasenk-deep-maroon) data-highlighted:bg-(--vaasenk-rose-wash)',
        'data-disabled:cursor-not-allowed data-disabled:opacity-50',
      )}
      title={hint}
    >
      <Icon className="size-4" />
      <span className="flex-1">{children}</span>
    </DropdownMenu.Item>
  );
}

// ---------------------------------------------------------------------------
// Metadata pills — boardType / class / subject / version. Hidden when empty.
// ---------------------------------------------------------------------------

function MetaPills({ syllabus }: { syllabus: SyllabusView }) {
  const items: Array<{ key: string; label: string }> = [];
  if (syllabus.boardType) items.push({ key: 'board', label: syllabus.boardType });
  if (syllabus.class?.name)
    items.push({ key: 'class', label: syllabus.class.name });
  if (syllabus.subject?.name)
    items.push({ key: 'subject', label: syllabus.subject.name });
  if (syllabus.version)
    items.push({ key: 'version', label: syllabus.version });
  if (syllabus.language)
    items.push({ key: 'lang', label: syllabus.language });
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map(({ key, label }) => (
        <span
          key={key}
          className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
            key === 'version'
              ? 'bg-(--vaasenk-peach-wash) text-(--vaasenk-deep-maroon)'
              : 'bg-(--vaasenk-rose-wash) text-(--vaasenk-deep-maroon)',
          )}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grid card (default view).
// ---------------------------------------------------------------------------

export function SyllabusCard({
  syllabus,
  inFlight,
  onAction,
}: {
  syllabus: SyllabusView;
  inFlight: boolean;
  onAction: (action: CardAction) => void;
}) {
  return (
    <GlassCard
      padding="md"
      className={cn(
        'group flex h-full cursor-pointer flex-col gap-3 text-left transition-all',
        'hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(160,0,0,0.12)]',
        !syllabus.isActive && 'opacity-75',
      )}
      onClick={() => onAction('view')}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        // Cards are keyboard-actionable to mirror their click-to-open behaviour.
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onAction('view');
        }
      }}
      aria-label={`Open details for ${syllabus.name}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-2xl bg-(image:--gradient-admin-royal) text-white shadow-[0_8px_20px_rgba(160,0,0,0.18)]"
        >
          <FileText className="size-5" />
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={syllabus.status} />
          <SyllabusActionsMenu
            syllabus={syllabus}
            inFlight={inFlight}
            onAction={onAction}
          />
        </div>
      </div>

      <div>
        <h3 className="line-clamp-2 text-base font-semibold text-(--vaasenk-ink)">
          {syllabus.name}
        </h3>
        {!syllabus.isActive ? (
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wider text-(--vaasenk-muted)">
            Archived version
          </p>
        ) : null}
      </div>

      <MetaPills syllabus={syllabus} />

      {syllabus.status === 'FAILED' && syllabus.errorMessage ? (
        <p className="rounded-xl border border-(--vaasenk-danger)/25 bg-(--vaasenk-danger)/10 px-3 py-2 text-xs text-(--vaasenk-danger)">
          {syllabus.errorMessage}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-(--vaasenk-line-sand)/50 pt-3 text-xs text-(--vaasenk-muted)">
        <span title={`Uploaded ${formatRelative(syllabus.createdAt)}`}>
          Uploaded {formatRelative(syllabus.createdAt)}
        </span>
        <span aria-hidden className="text-(--vaasenk-line-sand)">·</span>
        <span>{formatBytes(syllabus.fileSizeBytes)}</span>
        {syllabus._count.chunks > 0 ? (
          <>
            <span aria-hidden className="text-(--vaasenk-line-sand)">·</span>
            <span>{syllabus._count.chunks} chunks</span>
          </>
        ) : null}
        <span aria-hidden className="text-(--vaasenk-line-sand)">·</span>
        <span>
          {syllabus._count.classrooms}{' '}
          {syllabus._count.classrooms === 1 ? 'classroom' : 'classrooms'}
        </span>
      </div>
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// List row (compact). Used when the user toggles to list view.
// ---------------------------------------------------------------------------

export function SyllabusRow({
  syllabus,
  inFlight,
  onAction,
}: {
  syllabus: SyllabusView;
  inFlight: boolean;
  onAction: (action: CardAction) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onAction('view')}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onAction('view');
        }
      }}
      aria-label={`Open details for ${syllabus.name}`}
      className={cn(
        'group flex flex-col gap-3 px-5 py-4 transition-colors',
        'hover:bg-white/55',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30',
        'sm:flex-row sm:items-center',
        !syllabus.isActive && 'opacity-75',
      )}
    >
      <div
        aria-hidden
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-(image:--gradient-admin-royal) text-white shadow-[0_8px_20px_rgba(160,0,0,0.18)]"
      >
        <FileText className="size-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-(--vaasenk-ink)">
            {syllabus.name}
          </h3>
          {!syllabus.isActive ? (
            <span className="inline-flex items-center rounded-full bg-(--vaasenk-subtle)/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-(--vaasenk-muted)">
              Archived
            </span>
          ) : null}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <MetaPills syllabus={syllabus} />
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3 sm:flex-nowrap">
        <span className="text-xs text-(--vaasenk-muted)">
          {formatRelative(syllabus.createdAt)}
        </span>
        <span className="text-xs text-(--vaasenk-muted)">
          {syllabus._count.classrooms}{' '}
          {syllabus._count.classrooms === 1 ? 'classroom' : 'classrooms'}
        </span>
        <StatusBadge status={syllabus.status} compact />
        <SyllabusActionsMenu
          syllabus={syllabus}
          inFlight={inFlight}
          onAction={onAction}
        />
      </div>
    </div>
  );
}
