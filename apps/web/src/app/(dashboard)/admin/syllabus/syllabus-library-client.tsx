'use client';

import {
  AlertCircle,
  Archive,
  BookText,
  CheckCircle2,
  Filter,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  Search,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { GlassCard } from '@/components/ui/glass-card';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { VaasenkButton } from '@/components/ui/vaasenk-button';
import { ApiClientError, apiFetch, apiFetchEnvelope } from '@/lib/api-client';
import { createClient as createBrowserSupabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  type CardAction,
  SyllabusCard,
  SyllabusRow,
} from './syllabus-card';
import { MapClassroomsDialog } from './map-classrooms-dialog';
import { SyllabusDetailDrawer } from './syllabus-detail-drawer';
import {
  COMMON_BOARDS,
  PROCESSING_STATUS_VALUES,
  STATUS_LABELS,
  type ProcessingStatus,
  type SyllabusDetailView,
  type SyllabusView,
} from './syllabus-types';
import { UploadSyllabusDrawer } from './upload-syllabus-drawer';

// ---------------------------------------------------------------------------
// Strings — i18n sweep entry point (en-IN → ta-IN in a later sprint).
// ---------------------------------------------------------------------------

const MSG = {
  pageEyebrow: 'Admin · Curriculum',
  pageTitle: 'Syllabus Library',
  pageSubtitle:
    'Upload and manage syllabus PDFs. Map to classrooms so AI features can ground responses in real curriculum.',
  uploadCta: 'Upload syllabus',
  searchPlaceholder: 'Search by syllabus name…',
  statusAll: 'All',
  boardAll: 'All boards',
  archivedToggle: 'Show archived versions',
  gridView: 'Grid view',
  listView: 'List view',
  emptyTitle: 'No syllabus uploaded yet',
  emptyDescription:
    'Upload your first PDF to enable AI features for your classrooms.',
  emptyCta: 'Upload syllabus',
  noMatch: 'No syllabi match these filters.',
  clearFilters: 'Clear filters',
  errorTitle: "Couldn't load syllabus library",
  retry: 'Retry',
  prev: 'Previous',
  next: 'Next',
  showingRange: (from: number, to: number, total: number) =>
    `Showing ${from}–${to} of ${total}`,
  loadingHint: 'Loading syllabus library…',
  uploadSuccess:
    'Syllabus uploaded. Processing — this usually takes 1–2 minutes.',
  replaceSuccess:
    'New version uploaded. The previous version has been archived.',
  archiveSuccess: 'Syllabus archived. Active versions are unaffected.',
  restoreSuccess: 'Syllabus restored to active.',
  reprocessSuccess:
    'Reprocessing queued. We’ll rebuild the chunks and embeddings.',
  reprocessConfirm:
    'Reprocessing will delete existing chunks and re-run the AI pipeline. Continue?',
  archiveConfirm:
    'Archive this syllabus? Classrooms mapped to it will keep their mapping but the syllabus will be hidden from the active library.',
  restoreConfirm: 'Restore this syllabus to active?',
  mapSuccess: (n: number) =>
    `Mapped to ${n} ${n === 1 ? 'classroom' : 'classrooms'}.`,
} as const;

// ---------------------------------------------------------------------------
// Types narrow to what the page needs locally (the full shapes live in
// syllabus-types.ts which gets imported by every sibling component).
// ---------------------------------------------------------------------------

type AuthMeUser = { id: string; institutionId: string };
type StatusFilter = ProcessingStatus | 'ALL';
type ViewMode = 'grid' | 'list';

const PAGE_SIZE = 12;

// ===========================================================================
// Main component
// ===========================================================================

export function SyllabusLibraryClient() {
  // --- Identity bootstrap (mirrors apps/web teachers-client pattern) -------
  const [meInstitutionId, setMeInstitutionId] = useState<string | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  // --- Filter / view state ------------------------------------------------
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [boardFilter, setBoardFilter] = useState<string | 'ALL'>('ALL');
  const [showArchived, setShowArchived] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [view, setView] = useState<ViewMode>('grid');
  const [page, setPage] = useState(1);

  // --- Data state ---------------------------------------------------------
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<SyllabusView[]>([]);
  const [total, setTotal] = useState(0);

  // --- Drawer + dialog state ---------------------------------------------
  const [uploadOpen, setUploadOpen] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<SyllabusView | null>(null);
  const [mapTarget, setMapTarget] = useState<SyllabusView | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SyllabusDetailView | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailAction, setDetailAction] = useState<
    'reprocess' | 'archive' | 'restore' | null
  >(null);

  // --- Per-row pending action (so we can disable the card's menu button) --
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);

  // --- Transient banner (success / info, auto-dismiss) -------------------
  const [banner, setBanner] = useState<string | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Cached access token (used by XHR uploaders) ------------------------
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const apiBaseUrl = useMemo(
    () => (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, ''),
    [],
  );

  // -------------------------------------------------------------------------
  // Debounced search — ~300ms, mirrors the teachers page so muscle memory
  // transfers and the API isn't hammered per keystroke.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // -------------------------------------------------------------------------
  // Bootstrap — /auth/me + cache the access token for XHR uploads.
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createBrowserSupabase();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!cancelled) setAccessToken(session?.access_token ?? null);

        const me = await apiFetch<{ user: AuthMeUser }>('/api/v1/auth/me');
        if (cancelled) return;
        setMeInstitutionId(me.user.institutionId);
      } catch (err) {
        if (cancelled) return;
        setBootstrapError(
          err instanceof Error ? err.message : 'Failed to load your session.',
        );
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Data fetch — re-runs on filters / search / page / institutionId changes.
  // -------------------------------------------------------------------------
  const fetchList = useCallback(async () => {
    if (!meInstitutionId) return;
    setError(null);
    const isInitial = rows.length === 0 && total === 0;
    if (isInitial) setLoading(true);
    else setRefreshing(true);

    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      params.set('sort', 'createdAt:desc');
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (boardFilter !== 'ALL') params.set('boardType', boardFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);
      // showArchived OFF → only active. ON → omit so backend returns both
      // (per the API contract — `isActive` is optional and defaults to "any").
      if (!showArchived) params.set('isActive', 'true');

      const result = await apiFetchEnvelope<SyllabusView[]>(
        `/api/v1/syllabus?${params.toString()}`,
      );
      setRows(result.data ?? []);
      setTotal(result.meta?.total ?? result.data?.length ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    meInstitutionId,
    statusFilter,
    boardFilter,
    debouncedSearch,
    showArchived,
    page,
  ]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // -------------------------------------------------------------------------
  // Detail fetch — load when the drawer opens or when the underlying syllabus
  // changes (e.g. after a reprocess).
  // -------------------------------------------------------------------------
  const fetchDetail = useCallback(
    async (id: string, options?: { silent?: boolean }) => {
      if (!options?.silent) setDetailLoading(true);
      setDetailError(null);
      try {
        const result = await apiFetch<{ syllabus: SyllabusDetailView }>(
          `/api/v1/syllabus/${id}`,
        );
        setDetail(result.syllabus);
      } catch (err) {
        setDetailError(
          err instanceof Error ? err.message : 'Failed to load details.',
        );
      } finally {
        if (!options?.silent) setDetailLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    fetchDetail(detailId);
  }, [detailId, fetchDetail]);

  // -------------------------------------------------------------------------
  // Banner helpers
  // -------------------------------------------------------------------------
  const flashBanner = useCallback((msg: string) => {
    setBanner(msg);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), 5000);
  }, []);

  useEffect(() => {
    return () => {
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Card / row actions
  // -------------------------------------------------------------------------
  const handleCardAction = async (row: SyllabusView, action: CardAction) => {
    switch (action) {
      case 'view':
        setDetailId(row.id);
        return;
      case 'replace':
        setReplaceTarget(row);
        return;
      case 'map':
        setMapTarget(row);
        return;
      case 'reprocess':
        if (typeof window !== 'undefined') {
          const ok = window.confirm(MSG.reprocessConfirm);
          if (!ok) return;
        }
        await reprocess(row);
        return;
      case 'archive':
        if (typeof window !== 'undefined') {
          const ok = window.confirm(MSG.archiveConfirm);
          if (!ok) return;
        }
        await setActive(row, false);
        return;
      case 'restore':
        if (typeof window !== 'undefined') {
          const ok = window.confirm(MSG.restoreConfirm);
          if (!ok) return;
        }
        await setActive(row, true);
        return;
    }
  };

  const reprocess = async (row: SyllabusView) => {
    if (pendingRowId) return;
    setPendingRowId(row.id);
    try {
      await apiFetch<{ syllabus: SyllabusView }>(
        `/api/v1/syllabus/${row.id}/reprocess`,
        { method: 'POST' },
      );
      flashBanner(MSG.reprocessSuccess);
      await fetchList();
      if (detailId === row.id) await fetchDetail(row.id, { silent: true });
    } catch (err) {
      flashBanner(
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Reprocess failed.',
      );
    } finally {
      setPendingRowId(null);
    }
  };

  const setActive = async (row: SyllabusView, isActive: boolean) => {
    if (pendingRowId) return;
    setPendingRowId(row.id);
    try {
      await apiFetch<{ syllabus: SyllabusView }>(
        `/api/v1/syllabus/${row.id}`,
        { method: 'PATCH', body: { isActive } },
      );
      flashBanner(isActive ? MSG.restoreSuccess : MSG.archiveSuccess);
      await fetchList();
      if (detailId === row.id) await fetchDetail(row.id, { silent: true });
    } catch (err) {
      flashBanner(
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Action failed.',
      );
    } finally {
      setPendingRowId(null);
    }
  };

  // Detail-drawer-driven variants — same logic, different "inFlight" key so
  // the drawer can render its own spinner state.
  const handleDetailAction = async (
    action: 'replace' | 'map' | 'reprocess' | 'archive' | 'restore',
  ) => {
    if (!detail) return;
    if (action === 'replace') {
      setReplaceTarget(detail);
      return;
    }
    if (action === 'map') {
      setMapTarget(detail);
      return;
    }
    if (action === 'reprocess') {
      if (typeof window !== 'undefined' && !window.confirm(MSG.reprocessConfirm)) return;
      setDetailAction('reprocess');
      try {
        await apiFetch(`/api/v1/syllabus/${detail.id}/reprocess`, {
          method: 'POST',
        });
        flashBanner(MSG.reprocessSuccess);
        await Promise.all([fetchList(), fetchDetail(detail.id, { silent: true })]);
      } catch (err) {
        flashBanner(err instanceof Error ? err.message : 'Reprocess failed.');
      } finally {
        setDetailAction(null);
      }
      return;
    }
    if (action === 'archive' || action === 'restore') {
      const target = action === 'archive' ? false : true;
      const confirm = action === 'archive' ? MSG.archiveConfirm : MSG.restoreConfirm;
      if (typeof window !== 'undefined' && !window.confirm(confirm)) return;
      setDetailAction(action);
      try {
        await apiFetch(`/api/v1/syllabus/${detail.id}`, {
          method: 'PATCH',
          body: { isActive: target },
        });
        flashBanner(target ? MSG.restoreSuccess : MSG.archiveSuccess);
        await Promise.all([fetchList(), fetchDetail(detail.id, { silent: true })]);
      } catch (err) {
        flashBanner(err instanceof Error ? err.message : 'Action failed.');
      } finally {
        setDetailAction(null);
      }
    }
  };

  const handleUploadSuccess = async (
    next: SyllabusView,
    mode: 'create' | 'replace',
  ) => {
    setUploadOpen(false);
    setReplaceTarget(null);
    flashBanner(mode === 'create' ? MSG.uploadSuccess : MSG.replaceSuccess);
    await fetchList();
    // If a replace target was open in the detail drawer, swap to the new
    // version's detail so the admin sees the timeline reset.
    if (mode === 'replace' && next?.id) setDetailId(next.id);
  };

  const handleMapSuccess = async (mapped: number) => {
    setMapTarget(null);
    flashBanner(MSG.mapSuccess(mapped));
    await fetchList();
    if (detailId) await fetchDetail(detailId, { silent: true });
  };

  // -------------------------------------------------------------------------
  // Derived
  // -------------------------------------------------------------------------
  const hasActiveFilters =
    debouncedSearch !== '' ||
    statusFilter !== 'ALL' ||
    boardFilter !== 'ALL' ||
    showArchived;

  const rangeFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeTo = Math.min(page * PAGE_SIZE, total);
  const canPrev = page > 1 && !loading;
  const canNext = page * PAGE_SIZE < total && !loading;

  const clearFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setStatusFilter('ALL');
    setBoardFilter('ALL');
    setShowArchived(false);
    setPage(1);
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      {/* Admin Royal hero */}
      <section className="relative overflow-hidden rounded-[28px] bg-(image:--gradient-admin-royal) p-8 text-white shadow-[0_24px_60px_rgba(160,0,0,0.24)]">
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-wider text-white/75">
              {MSG.pageEyebrow}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              {MSG.pageTitle}
            </h1>
            <p className="mt-2 text-white/85">{MSG.pageSubtitle}</p>
          </div>
          <div className="shrink-0">
            <VaasenkButton
              variant="primary"
              size="md"
              onClick={() => setUploadOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={uploadOpen}
            >
              <Plus className="size-4" />
              {MSG.uploadCta}
            </VaasenkButton>
          </div>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 size-72 rounded-full bg-white/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 left-1/3 size-64 rounded-full bg-[#FFB000]/30 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute right-12 top-12 hidden text-white/15 lg:block"
        >
          <BookText className="size-28" />
        </div>
      </section>

      {/* Bootstrap error (rare — JWT issue or /auth/me down) */}
      {bootstrapError ? (
        <div
          role="alert"
          className="rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-4 py-3 text-sm text-(--vaasenk-danger)"
        >
          {bootstrapError}
        </div>
      ) : null}

      {/* Transient banner */}
      {banner ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2.5 rounded-2xl border border-(--vaasenk-success)/30 bg-(--vaasenk-success)/10 px-4 py-3 text-sm font-medium text-(--vaasenk-success)"
        >
          <CheckCircle2 className="size-4" />
          {banner}
          <button
            type="button"
            onClick={() => setBanner(null)}
            aria-label="Dismiss"
            className="ml-auto rounded-full p-1 text-(--vaasenk-success)/70 hover:bg-(--vaasenk-success)/15 hover:text-(--vaasenk-success)"
          >
            <XCircle className="size-4" />
          </button>
        </div>
      ) : null}

      {/* Filters card */}
      <GlassCard padding="md" className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Search */}
          <div className="relative w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-(--vaasenk-subtle)" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={MSG.searchPlaceholder}
              aria-label={MSG.searchPlaceholder}
              disabled={loading && rows.length === 0}
              className="min-h-[44px] w-full rounded-full border border-(--vaasenk-line-sand) bg-white/80 py-2.5 pl-11 pr-4 text-sm text-(--vaasenk-ink) placeholder:text-(--vaasenk-subtle) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-70"
            />
          </div>

          {/* View toggle */}
          <div
            role="group"
            aria-label="View mode"
            className="inline-flex items-center gap-1 self-start rounded-full border border-(--vaasenk-line-sand) bg-white/70 p-1"
          >
            <ViewToggle
              active={view === 'grid'}
              onClick={() => setView('grid')}
              icon={<LayoutGrid className="size-4" />}
              label={MSG.gridView}
            />
            <ViewToggle
              active={view === 'list'}
              onClick={() => setView('list')}
              icon={<List className="size-4" />}
              label={MSG.listView}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Status chips */}
          <div
            role="tablist"
            aria-label="Filter by processing status"
            className="flex flex-wrap items-center gap-2"
          >
            <FilterChip
              active={statusFilter === 'ALL'}
              onClick={() => {
                setStatusFilter('ALL');
                setPage(1);
              }}
            >
              {MSG.statusAll}
            </FilterChip>
            {PROCESSING_STATUS_VALUES.map((s) => (
              <FilterChip
                key={s}
                active={statusFilter === s}
                onClick={() => {
                  setStatusFilter(s);
                  setPage(1);
                }}
              >
                {STATUS_LABELS[s]}
              </FilterChip>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Board filter */}
            <label className="inline-flex items-center gap-2 text-xs text-(--vaasenk-muted)">
              <Filter className="size-3.5" />
              <span className="font-medium">Board</span>
              <select
                value={boardFilter}
                onChange={(e) => {
                  setBoardFilter(e.target.value as typeof boardFilter);
                  setPage(1);
                }}
                aria-label="Filter by board"
                className="min-h-[36px] rounded-full border border-(--vaasenk-line-sand) bg-white/80 px-3 py-1 text-sm font-medium text-(--vaasenk-deep-maroon) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30"
              >
                <option value="ALL">{MSG.boardAll}</option>
                {COMMON_BOARDS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>

            {/* Archived toggle */}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-(--vaasenk-line-sand) bg-white/70 px-3 py-1.5 text-xs font-medium text-(--vaasenk-deep-maroon) transition-colors hover:bg-white">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => {
                  setShowArchived(e.target.checked);
                  setPage(1);
                }}
                className="size-3.5 cursor-pointer accent-(--vaasenk-red)"
              />
              <Archive className="size-3.5" />
              {MSG.archivedToggle}
            </label>
          </div>
        </div>
      </GlassCard>

      {/* Body */}
      {error ? (
        <GlassCard padding="md">
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-4 py-4 text-sm text-(--vaasenk-danger) sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">{MSG.errorTitle}</p>
                <p className="mt-1 text-(--vaasenk-danger)/85">{error}</p>
              </div>
            </div>
            <VaasenkButton
              variant="secondary"
              size="sm"
              onClick={() => {
                setError(null);
                fetchList();
              }}
            >
              {MSG.retry}
            </VaasenkButton>
          </div>
        </GlassCard>
      ) : null}

      {!error && loading ? (
        <ListSkeleton view={view} />
      ) : null}

      {!error && !loading && rows.length === 0 ? (
        hasActiveFilters ? (
          <GlassCard padding="lg" className="flex flex-col items-center gap-3 text-center">
            <Sparkles
              aria-hidden
              className="size-7 text-(--vaasenk-subtle)"
            />
            <p className="text-sm text-(--vaasenk-muted)">{MSG.noMatch}</p>
            <VaasenkButton variant="secondary" size="sm" onClick={clearFilters}>
              {MSG.clearFilters}
            </VaasenkButton>
          </GlassCard>
        ) : (
          <EmptyState
            title={MSG.emptyTitle}
            description={MSG.emptyDescription}
            icon={<BookText className="size-7" />}
            action={{
              label: MSG.emptyCta,
              onClick: () => setUploadOpen(true),
            }}
          />
        )
      ) : null}

      {!error && !loading && rows.length > 0 ? (
        <>
          {view === 'grid' ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {rows.map((row) => (
                <SyllabusCard
                  key={row.id}
                  syllabus={row}
                  inFlight={pendingRowId === row.id}
                  onAction={(action) => handleCardAction(row, action)}
                />
              ))}
            </div>
          ) : (
            <GlassCard padding="none" className="overflow-hidden">
              <ul
                role="list"
                className="divide-y divide-(--vaasenk-line-sand)/40"
              >
                {rows.map((row) => (
                  <li key={row.id}>
                    <SyllabusRow
                      syllabus={row}
                      inFlight={pendingRowId === row.id}
                      onAction={(action) => handleCardAction(row, action)}
                    />
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}

          {/* Pagination footer */}
          <GlassCard padding="sm">
            <footer className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <p
                className="text-xs text-(--vaasenk-muted)"
                aria-live="polite"
              >
                {MSG.showingRange(rangeFrom, rangeTo, total)}
                {refreshing ? (
                  <span className="ml-2 inline-flex items-center gap-1 text-(--vaasenk-subtle)">
                    <Loader2 className="size-3 animate-spin" />
                    Updating…
                  </span>
                ) : null}
              </p>
              <div className="flex items-center gap-2">
                <VaasenkButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!canPrev}
                >
                  {MSG.prev}
                </VaasenkButton>
                <VaasenkButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!canNext}
                >
                  {MSG.next}
                </VaasenkButton>
              </div>
            </footer>
          </GlassCard>
        </>
      ) : null}

      {/* Drawers + dialogs */}
      <UploadSyllabusDrawer
        open={uploadOpen || replaceTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setUploadOpen(false);
            setReplaceTarget(null);
          }
        }}
        mode={
          replaceTarget
            ? { kind: 'replace', target: replaceTarget }
            : { kind: 'create' }
        }
        onSuccess={handleUploadSuccess}
        apiBaseUrl={apiBaseUrl}
        accessToken={accessToken}
      />

      {mapTarget ? (
        <MapClassroomsDialog
          open={mapTarget !== null}
          onOpenChange={(o) => {
            if (!o) setMapTarget(null);
          }}
          syllabus={mapTarget}
          alreadyMappedIds={
            // If the detail drawer is showing this syllabus, use its
            // mappedClassrooms ids — otherwise empty (the picker will still
            // call the map endpoint with the user's selections).
            detail && detail.id === mapTarget.id
              ? detail.mappedClassrooms.map((c) => c.id)
              : []
          }
          onSuccess={handleMapSuccess}
        />
      ) : null}

      <SyllabusDetailDrawer
        open={detailId !== null}
        onOpenChange={(o) => {
          if (!o) setDetailId(null);
        }}
        detail={detail}
        loading={detailLoading}
        error={detailError}
        onRetry={() => {
          if (detailId) fetchDetail(detailId);
        }}
        onAction={handleDetailAction}
        actionInFlight={detailAction}
      />
    </div>
  );
}

// ===========================================================================
// Sub-components
// ===========================================================================

function FilterChip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30 focus-visible:ring-offset-2 focus-visible:ring-offset-(--vaasenk-warm-canvas)',
        active
          ? 'bg-(image:--gradient-brand-flame) text-white shadow-[0_8px_24px_rgba(160,0,0,0.18)]'
          : 'border border-(--vaasenk-line-sand) bg-white/70 text-(--vaasenk-deep-maroon) hover:bg-white hover:border-(--vaasenk-red)/40',
        'disabled:cursor-not-allowed disabled:opacity-60',
      )}
    >
      {children}
    </button>
  );
}

function ViewToggle({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-full transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30',
        active
          ? 'bg-(image:--gradient-brand-flame) text-white shadow-[0_4px_12px_rgba(160,0,0,0.18)]'
          : 'text-(--vaasenk-deep-maroon) hover:bg-(--vaasenk-rose-wash)',
      )}
    >
      {icon}
    </button>
  );
}

function ListSkeleton({ view }: { view: ViewMode }) {
  if (view === 'grid') {
    return (
      <div
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        role="status"
        aria-busy
        aria-live="polite"
      >
        <span className="sr-only">{MSG.loadingHint}</span>
        {Array.from({ length: 6 }).map((_, i) => (
          <GlassCard key={i} padding="md" className="flex flex-col gap-3">
            <div className="flex items-start justify-between">
              <LoadingSkeleton className="size-11" />
              <LoadingSkeleton variant="text" className="w-20" />
            </div>
            <LoadingSkeleton variant="text" className="w-3/4" />
            <LoadingSkeleton variant="text" className="w-1/2" />
            <div className="flex flex-wrap gap-1.5">
              <LoadingSkeleton variant="text" className="w-16" />
              <LoadingSkeleton variant="text" className="w-12" />
              <LoadingSkeleton variant="text" className="w-14" />
            </div>
            <LoadingSkeleton variant="text" className="mt-auto w-2/3" />
          </GlassCard>
        ))}
      </div>
    );
  }
  return (
    <GlassCard
      padding="none"
      className="overflow-hidden"
      role="status"
      aria-busy
      aria-live="polite"
    >
      <span className="sr-only">{MSG.loadingHint}</span>
      <ul className="divide-y divide-(--vaasenk-line-sand)/40">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="flex items-center gap-3 px-5 py-4">
            <LoadingSkeleton className="size-10" />
            <div className="flex-1 space-y-2">
              <LoadingSkeleton variant="text" className="w-1/2" />
              <LoadingSkeleton variant="text" className="w-1/3" />
            </div>
            <LoadingSkeleton variant="text" className="w-20" />
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
