'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Loader2,
  Search,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { VaasenkButton } from '@/components/ui/vaasenk-button';
import { ApiClientError, apiFetch, apiFetchEnvelope } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type {
  ClassroomPickerOption,
  SyllabusView,
} from './syllabus-types';

/**
 * Map-syllabus-to-classrooms dialog (centred modal — this is a focused task,
 * not a long-form drawer).
 *
 * Behaviour:
 *   - Fetches GET /classrooms?limit=200 on open.
 *   - Pre-checks classrooms that already have THIS syllabus mapped (rendered
 *     as disabled — they cannot be unchecked from this dialog).
 *   - Marks classrooms mapped to OTHER syllabi with a small "currently
 *     mapped to: <other syllabus>" hint so the admin understands they will
 *     be moved by the submit.
 *   - Submit calls POST /syllabus/:id/map with the FULL new list. Backend's
 *     updateMany sets `syllabusId` on each — it doesn't unset others.
 *   - Add-only for v1. Unmapping is deferred to Sprint 3.4.
 */

type MapState = 'idle' | 'loading' | 'error' | 'submitting' | 'success';

export function MapClassroomsDialog({
  open,
  onOpenChange,
  syllabus,
  // Already-mapped classroom ids — used to pre-check + lock.
  alreadyMappedIds,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  syllabus: SyllabusView;
  alreadyMappedIds: string[];
  onSuccess: (mappedCount: number) => void;
}) {
  const labelId = useId();
  const [state, setState] = useState<MapState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [classrooms, setClassrooms] = useState<ClassroomPickerOption[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Fetch list once per open; reset on close so we don't show stale rows
  // if the admin edits the syllabus and re-opens later.
  useEffect(() => {
    if (!open) {
      setState('idle');
      setError(null);
      setClassrooms([]);
      setSearch('');
      setSelected(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      setState('loading');
      setError(null);
      try {
        const result = await apiFetchEnvelope<ClassroomPickerOption[]>(
          '/api/v1/classrooms?limit=200&sort=createdAt:desc',
        );
        if (cancelled) return;
        setClassrooms(result.data ?? []);
        setSelected(new Set(alreadyMappedIds));
        setState('idle');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load classrooms.');
        setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, alreadyMappedIds]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return classrooms;
    return classrooms.filter((c) =>
      [
        c.name,
        c.class?.name,
        c.section?.name,
        c.subject?.name,
        c.teacher?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [classrooms, search]);

  const alreadyLockedIds = useMemo(
    () => new Set(alreadyMappedIds),
    [alreadyMappedIds],
  );

  const newAdditions = useMemo(() => {
    const additions: string[] = [];
    for (const id of selected) {
      if (!alreadyLockedIds.has(id)) additions.push(id);
    }
    return additions;
  }, [selected, alreadyLockedIds]);

  const toggle = (id: string) => {
    if (alreadyLockedIds.has(id)) return; // locked — already mapped to this syllabus
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (newAdditions.length === 0) {
      // Nothing to do — just close.
      onOpenChange(false);
      return;
    }
    setState('submitting');
    setError(null);
    try {
      const result = await apiFetch<{ mapped: number }>(
        `/api/v1/syllabus/${syllabus.id}/map`,
        {
          method: 'POST',
          // Send only the additions — keeps the request payload minimal and
          // makes the backend's updateMany behaviour predictable.
          body: { classroomIds: newAdditions },
        },
      );
      setState('success');
      onSuccess(result.mapped);
    } catch (err) {
      if (err instanceof ApiClientError) setError(err.message);
      else setError(err instanceof Error ? err.message : 'Mapping failed.');
      setState('error');
    }
  };

  const submitDisabled =
    state === 'loading' ||
    state === 'submitting' ||
    newAdditions.length === 0;

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
          aria-labelledby={labelId}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(640px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col',
            'rounded-[28px] border border-(--vaasenk-line-sand) bg-(image:--gradient-cream-sunrise)',
            'shadow-[0_32px_90px_rgba(160,0,0,0.18)] focus:outline-none',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          )}
        >
          <header className="flex items-start justify-between gap-3 border-b border-(--vaasenk-line-sand)/60 bg-white/40 px-6 py-5 backdrop-blur">
            <div className="min-w-0">
              <Dialog.Title
                id={labelId}
                className="text-lg font-semibold text-(--vaasenk-ink)"
              >
                Map syllabus to classrooms
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-(--vaasenk-muted)">
                Pick the classrooms that should use{' '}
                <span className="font-medium text-(--vaasenk-deep-maroon)">
                  {syllabus.name}
                </span>
                . Already-mapped classrooms are locked.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                disabled={state === 'submitting'}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-(--vaasenk-muted) transition-colors hover:bg-(--vaasenk-rose-wash) hover:text-(--vaasenk-red) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </header>

          {/* Search */}
          <div className="border-b border-(--vaasenk-line-sand)/40 px-6 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-(--vaasenk-subtle)" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search classrooms…"
                disabled={state === 'loading'}
                aria-label="Search classrooms"
                className="min-h-[44px] w-full rounded-full border border-(--vaasenk-line-sand) bg-white/80 py-2.5 pl-11 pr-4 text-sm text-(--vaasenk-ink) placeholder:text-(--vaasenk-subtle) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-70"
              />
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {state === 'loading' ? (
              <div
                role="status"
                aria-live="polite"
                className="flex flex-col items-center gap-2 py-12 text-(--vaasenk-muted)"
              >
                <Loader2 className="size-5 animate-spin" />
                <span className="text-sm">Loading classrooms…</span>
              </div>
            ) : null}

            {state === 'error' && classrooms.length === 0 ? (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-4 py-3 text-sm text-(--vaasenk-danger)"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <p>{error}</p>
              </div>
            ) : null}

            {state !== 'loading' && filtered.length === 0 && classrooms.length > 0 ? (
              <p className="py-8 text-center text-sm text-(--vaasenk-muted)">
                No classrooms match your search.
              </p>
            ) : null}

            {state !== 'loading' && classrooms.length === 0 && state !== 'error' ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Users
                  aria-hidden
                  className="size-8 text-(--vaasenk-subtle)"
                />
                <p className="text-sm text-(--vaasenk-muted)">
                  No classrooms yet. Create classrooms first, then come back
                  to map this syllabus.
                </p>
              </div>
            ) : null}

            {filtered.length > 0 ? (
              <ul
                role="listbox"
                aria-multiselectable="true"
                aria-label="Classrooms"
                className="flex flex-col gap-2"
              >
                {filtered.map((c) => {
                  const isSelected = selected.has(c.id);
                  const isLocked = alreadyLockedIds.has(c.id);
                  const mappedElsewhere =
                    c.syllabus && c.syllabus.id !== syllabus.id;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={isLocked || undefined}
                        onClick={() => toggle(c.id)}
                        disabled={isLocked || state === 'submitting'}
                        className={cn(
                          'flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30',
                          isSelected
                            ? 'border-(--vaasenk-red)/40 bg-(--vaasenk-rose-wash)/70'
                            : 'border-(--vaasenk-line-sand) bg-white/80 hover:border-(--vaasenk-red)/30 hover:bg-white',
                          isLocked && 'cursor-not-allowed opacity-70',
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            'mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors',
                            isSelected
                              ? 'border-(--vaasenk-red) bg-(image:--gradient-brand-flame) text-white'
                              : 'border-(--vaasenk-line-sand) bg-white',
                          )}
                        >
                          {isSelected ? <Check className="size-3.5" /> : null}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-(--vaasenk-ink)">
                            {c.name}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {c.class?.name ? (
                              <PickerPill>{c.class.name}</PickerPill>
                            ) : null}
                            {c.section?.name ? (
                              <PickerPill>{c.section.name}</PickerPill>
                            ) : null}
                            {c.subject?.name ? (
                              <PickerPill>{c.subject.name}</PickerPill>
                            ) : null}
                            {c.teacher?.name ? (
                              <span className="text-xs text-(--vaasenk-muted)">
                                · {c.teacher.name}
                              </span>
                            ) : null}
                          </div>
                          {isLocked ? (
                            <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-(--vaasenk-success)">
                              <CheckCircle2 className="size-3" />
                              Already mapped
                            </p>
                          ) : mappedElsewhere ? (
                            <p className="mt-1 text-xs text-(--vaasenk-warning)">
                              Currently mapped to {c.syllabus?.name}. Adding
                              will move it.
                            </p>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          <footer className="flex flex-col items-stretch gap-3 border-t border-(--vaasenk-line-sand)/60 bg-white/40 px-6 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-(--vaasenk-muted)">
              {newAdditions.length > 0
                ? `${newAdditions.length} new ${newAdditions.length === 1 ? 'classroom' : 'classrooms'} will be mapped.`
                : 'No new classrooms selected.'}
            </p>
            <div className="flex items-center justify-end gap-2">
              <Dialog.Close asChild>
                <VaasenkButton
                  variant="ghost"
                  size="sm"
                  type="button"
                  disabled={state === 'submitting'}
                >
                  Cancel
                </VaasenkButton>
              </Dialog.Close>
              <VaasenkButton
                variant="primary"
                size="sm"
                type="button"
                disabled={submitDisabled}
                onClick={submit}
              >
                {state === 'submitting' ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Mapping…
                  </>
                ) : (
                  <>
                    <Users className="size-4" />
                    Map {newAdditions.length > 0 ? `(${newAdditions.length})` : ''}
                  </>
                )}
              </VaasenkButton>
            </div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PickerPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-(--vaasenk-peach-wash) px-2 py-0.5 text-[11px] font-semibold text-(--vaasenk-deep-maroon)">
      {children}
    </span>
  );
}
