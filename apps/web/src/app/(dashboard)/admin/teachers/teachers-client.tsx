'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Link2,
  Loader2,
  Mail,
  MoreHorizontal,
  Plus,
  Search,
  UserCheck,
  UserCog,
  UserMinus,
  UserPlus,
  Users as UsersIcon,
  XCircle,
} from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { GlassCard } from '@/components/ui/glass-card';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { VaasenkButton } from '@/components/ui/vaasenk-button';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { InviteTeacherDrawer } from './invite-teacher-drawer';

// ---------------------------------------------------------------------------
// Strings — pulled to a constant so a future i18n sweep (en-IN → ta-IN)
// catches them. See vaasenk-component SKILL.md §11.
// ---------------------------------------------------------------------------

const MSG = {
  pageEyebrow: 'Admin · Members',
  pageTitle: 'Teachers',
  pageSubtitle:
    'Invite, activate, and manage teachers in your institution.',
  inviteCta: 'Invite teacher',
  searchPlaceholder: 'Search by name, email, phone…',
  statusActive: 'Active',
  statusInactive: 'Inactive',
  statusAll: 'All',
  pendingInvites: 'Pending invites',
  colTeacher: 'Teacher',
  colEmail: 'Email',
  colStatus: 'Status',
  colDepartment: 'Department & subjects',
  colJoined: 'Joined',
  colInvitedBy: 'Invited by',
  colExpires: 'Expires',
  colActions: 'Actions',
  rowActions: 'Row actions',
  activate: 'Activate',
  deactivate: 'Deactivate',
  remove: 'Soft-delete',
  copyLink: 'Copy invite link',
  revoke: 'Revoke invite',
  emptyTitle: 'No teachers yet',
  emptyDescription: 'Invite your first teacher to get started.',
  emptyCta: 'Invite teacher',
  emptyPendingTitle: 'No pending invites',
  emptyPendingDescription:
    'Sent invites that haven’t been accepted yet will show up here.',
  noMatch: 'No teachers match these filters.',
  noMatchPending: 'No pending invites match this search.',
  clearFilters: 'Clear filters',
  showingRange: (from: number, to: number, total: number) =>
    `Showing ${from}–${to} of ${total}`,
  prev: 'Previous',
  next: 'Next',
  errorTitle: 'Couldn’t load teachers',
  errorDescription: (msg: string) => msg,
  retry: 'Retry',
  inviteSent: (email: string) => `Invite sent to ${email}.`,
  linkCopied: 'Invite link copied.',
  bulkInfoTitle: 'Need to add many teachers at once?',
  bulkInfoDescription:
    'For now, send invites one at a time using the drawer above. Bulk teacher CSV import is on the Sprint 1+ roadmap — your account manager can also import a roster from a previous system.',
  loadingHint: 'Loading teachers…',
} as const;

// ---------------------------------------------------------------------------
// API contract types — mirror apps/api/src/modules/users + invites DTOs.
// Kept inline rather than imported from shared-types since the NestJS DTOs
// use class-validator decorators that don't carry through a type-only import.
// ---------------------------------------------------------------------------

type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'TEACHER' | 'STUDENT';
type UserStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

type TeacherRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  avatarUrl: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
  institution: { id: string; name: string };
  teacherProfile?: {
    employeeCode: string | null;
    department: string | null;
    subjects: string[];
  };
};

type ListUsersResponse = {
  data: TeacherRow[];
  meta: { page: number; limit: number; total: number };
};

type InviteRow = {
  id: string;
  email: string;
  role: UserRole;
  token: string;
  expiresAt: string;
  institution: { id: string; name: string };
  invitedBy: { id: string; name: string; email: string | null };
  metadata?: { name?: string } | null;
  createdAt: string;
  updatedAt: string;
};

type ListInvitesResponse = {
  data: InviteRow[];
  meta: { page: number; limit: number; total: number };
};

type AuthMeUser = { id: string; institutionId: string };

type StatusFilter = 'ACTIVE' | 'INACTIVE' | 'ALL';
type ViewMode = 'TEACHERS' | 'PENDING';

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TeachersClient() {
  // Identity bootstrap — match the setup wizard's /auth/me approach so we
  // share one source of truth for which institution the actor manages.
  const [meId, setMeId] = useState<string | null>(null);
  const [meInstitutionId, setMeInstitutionId] = useState<string | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  // Filter / view state
  const [view, setView] = useState<ViewMode>('TEACHERS');
  const [status, setStatus] = useState<StatusFilter>('ACTIVE');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  // Drawer + transient banner state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Per-row pending action (so we can disable the menu item) keyed by id
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);

  // Data state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teacherRows, setTeacherRows] = useState<TeacherRow[]>([]);
  const [inviteRows, setInviteRows] = useState<InviteRow[]>([]);
  const [total, setTotal] = useState(0);

  // Debounce search input (~300ms) so each keystroke doesn't hit the API.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // -------------------------------------------------------------------------
  // Bootstrap: who am I, which institution
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await apiFetch<{ user: AuthMeUser }>('/api/v1/auth/me');
        if (cancelled) return;
        setMeId(me.user.id);
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
  // Data fetch — re-runs on filter / view / page / institutionId changes
  // -------------------------------------------------------------------------
  const fetchData = useCallback(async () => {
    if (!meInstitutionId) return;
    setError(null);
    // Use `refreshing` so consumers can distinguish an initial-mount spinner
    // from a filter-driven refetch (keeps the table visible during chip flips).
    const isInitial = teacherRows.length === 0 && inviteRows.length === 0 && total === 0;
    if (isInitial) setLoading(true);
    else setRefreshing(true);

    try {
      if (view === 'TEACHERS') {
        const params = new URLSearchParams();
        params.set('role', 'TEACHER');
        params.set('page', String(page));
        params.set('limit', String(PAGE_SIZE));
        params.set('sort', 'createdAt:desc');
        if (status !== 'ALL') params.set('status', status);
        if (debouncedSearch) params.set('search', debouncedSearch);

        // /users returns an envelope { data, meta }. apiFetch unwraps `data`
        // on 2xx, but `meta` is dropped — so we need the raw envelope here.
        // Easiest: use the same path but read both via a typed merge.
        const result = await fetchEnvelope<ListUsersResponse>(
          `/api/v1/users?${params.toString()}`,
        );
        setTeacherRows(result.data);
        setTotal(result.meta?.total ?? result.data.length);
        setInviteRows([]);
      } else {
        const params = new URLSearchParams();
        params.set('status', 'pending');
        params.set('page', String(page));
        params.set('limit', String(PAGE_SIZE));
        const result = await fetchEnvelope<ListInvitesResponse>(
          `/api/v1/institutions/${meInstitutionId}/invites?${params.toString()}`,
        );
        // Client-side search filter on pending invites — the invites
        // endpoint doesn't support `search` yet (Sprint 1 stretch).
        const filtered = debouncedSearch
          ? result.data.filter((r) =>
              [r.email, r.metadata?.name ?? '', r.invitedBy.name]
                .join(' ')
                .toLowerCase()
                .includes(debouncedSearch.toLowerCase()),
            )
          : result.data;
        setInviteRows(filtered);
        setTeacherRows([]);
        setTotal(debouncedSearch ? filtered.length : result.meta?.total ?? result.data.length);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Something went wrong.',
      );
      setTeacherRows([]);
      setInviteRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meInstitutionId, view, status, debouncedSearch, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // -------------------------------------------------------------------------
  // Banner helpers
  // -------------------------------------------------------------------------
  const flashBanner = useCallback((msg: string) => {
    setBanner(msg);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), 4200);
  }, []);

  useEffect(() => {
    return () => {
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Row actions
  // -------------------------------------------------------------------------
  const handleStatusChange = async (
    row: TeacherRow,
    nextStatus: 'ACTIVE' | 'INACTIVE',
  ) => {
    if (pendingRowId) return;
    setPendingRowId(row.id);
    try {
      await apiFetch(`/api/v1/users/${row.id}/status`, {
        method: 'PATCH',
        body: { status: nextStatus },
      });
      await fetchData();
      flashBanner(
        nextStatus === 'ACTIVE'
          ? `${row.name} is now active.`
          : `${row.name} has been deactivated.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Action failed.';
      flashBanner(msg);
    } finally {
      setPendingRowId(null);
    }
  };

  const handleDelete = async (row: TeacherRow) => {
    if (pendingRowId) return;
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        `Remove ${row.name}? They will lose access immediately. This is a soft-delete and can be reversed by a SUPER_ADMIN.`,
      );
      if (!ok) return;
    }
    setPendingRowId(row.id);
    try {
      await apiFetch(`/api/v1/users/${row.id}`, { method: 'DELETE' });
      await fetchData();
      flashBanner(`${row.name} removed.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Action failed.';
      flashBanner(msg);
    } finally {
      setPendingRowId(null);
    }
  };

  const handleRevokeInvite = async (row: InviteRow) => {
    if (pendingRowId) return;
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        `Revoke the invite for ${row.email}? The link will stop working immediately.`,
      );
      if (!ok) return;
    }
    setPendingRowId(row.id);
    try {
      await apiFetch(`/api/v1/invites/${row.id}`, { method: 'DELETE' });
      await fetchData();
      flashBanner(`Invite for ${row.email} revoked.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Revoke failed.';
      flashBanner(msg);
    } finally {
      setPendingRowId(null);
    }
  };

  const handleCopyInviteLink = async (row: InviteRow) => {
    // The /register?token=... flow is documented in the auth controller
    // (preview-by-token endpoint) — we generate the URL client-side.
    const origin =
      typeof window !== 'undefined' ? window.location.origin : '';
    const link = `${origin}/register?token=${encodeURIComponent(row.token)}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(link);
      } else {
        // Fallback for older browsers — wrap in an off-screen textarea.
        const ta = document.createElement('textarea');
        ta.value = link;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      flashBanner(MSG.linkCopied);
    } catch {
      flashBanner('Could not copy. You can right-click the link to copy it manually.');
    }
  };

  const handleInviteSent = (email: string) => {
    setDrawerOpen(false);
    flashBanner(MSG.inviteSent(email));
    // Send the user to the pending tab so they can see the freshly created
    // invite. Resets to page 1 since the new invite sits at the top.
    setView('PENDING');
    setPage(1);
  };

  // -------------------------------------------------------------------------
  // Derived
  // -------------------------------------------------------------------------
  const hasActiveFilters =
    debouncedSearch !== '' ||
    (view === 'TEACHERS' && status !== 'ACTIVE');

  const rangeFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeTo = Math.min(page * PAGE_SIZE, total);
  const canPrev = page > 1 && !loading;
  const canNext = page * PAGE_SIZE < total && !loading;

  const clearFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setStatus('ACTIVE');
    setPage(1);
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      {/* Hero — Admin Royal */}
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
              onClick={() => setDrawerOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={drawerOpen}
            >
              <Plus className="size-4" />
              {MSG.inviteCta}
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
      </section>

      {/* Transient success / info banner */}
      {banner ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2.5 rounded-2xl border border-(--vaasenk-success)/30 bg-(--vaasenk-success)/10 px-4 py-3 text-sm font-medium text-(--vaasenk-success)"
        >
          <CheckCircle2 className="size-4" />
          {banner}
        </div>
      ) : null}

      {/* Filter row */}
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
            disabled={loading && teacherRows.length === 0 && inviteRows.length === 0}
            className="min-h-[44px] w-full rounded-full border border-(--vaasenk-line-sand) bg-white/80 py-2.5 pl-11 pr-4 text-sm text-(--vaasenk-ink) placeholder:text-(--vaasenk-subtle) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-70"
          />
        </div>

        {/* Chips — status (only when viewing accepted teachers) + pending toggle */}
        <div
          role="tablist"
          aria-label="Filter teachers"
          className="flex flex-wrap items-center gap-2"
        >
          {view === 'TEACHERS' ? (
            <>
              <FilterChip
                active={status === 'ACTIVE'}
                onClick={() => {
                  setStatus('ACTIVE');
                  setPage(1);
                }}
                disabled={loading && teacherRows.length === 0}
              >
                {MSG.statusActive}
              </FilterChip>
              <FilterChip
                active={status === 'INACTIVE'}
                onClick={() => {
                  setStatus('INACTIVE');
                  setPage(1);
                }}
                disabled={loading && teacherRows.length === 0}
              >
                {MSG.statusInactive}
              </FilterChip>
              <FilterChip
                active={status === 'ALL'}
                onClick={() => {
                  setStatus('ALL');
                  setPage(1);
                }}
                disabled={loading && teacherRows.length === 0}
              >
                {MSG.statusAll}
              </FilterChip>
              <span
                aria-hidden
                className="mx-1 hidden h-5 w-px bg-(--vaasenk-line-sand) sm:inline-block"
              />
            </>
          ) : null}
          <FilterChip
            active={view === 'PENDING'}
            onClick={() => {
              setView(view === 'PENDING' ? 'TEACHERS' : 'PENDING');
              setPage(1);
            }}
            disabled={loading && teacherRows.length === 0 && inviteRows.length === 0}
          >
            <Mail className="size-3.5" aria-hidden />
            {MSG.pendingInvites}
          </FilterChip>
        </div>
      </div>

      {/* Body card */}
      <GlassCard padding="none" className="overflow-hidden">
        {/* Error → red card with retry */}
        {error ? (
          <div
            role="alert"
            aria-live="polite"
            className="m-6 rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-4 py-4 text-sm text-(--vaasenk-danger)"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-(--vaasenk-danger)">
                  {MSG.errorTitle}
                </p>
                <p className="mt-1 text-(--vaasenk-danger)/85">
                  {MSG.errorDescription(error)}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <VaasenkButton
                variant="secondary"
                size="sm"
                onClick={() => {
                  setError(null);
                  fetchData();
                }}
              >
                {MSG.retry}
              </VaasenkButton>
            </div>
          </div>
        ) : null}

        {/* Loading state */}
        {!error && loading ? <TableSkeleton view={view} /> : null}

        {/* Empty / data */}
        {!error && !loading ? (
          <>
            {view === 'TEACHERS' && teacherRows.length === 0 ? (
              hasActiveFilters ? (
                <InlineEmpty
                  message={MSG.noMatch}
                  cta={MSG.clearFilters}
                  onCta={clearFilters}
                />
              ) : (
                <div className="p-6">
                  <EmptyState
                    title={MSG.emptyTitle}
                    description={MSG.emptyDescription}
                    icon={<UsersIcon className="size-7" />}
                    action={{
                      label: MSG.emptyCta,
                      onClick: () => setDrawerOpen(true),
                    }}
                  />
                </div>
              )
            ) : null}

            {view === 'PENDING' && inviteRows.length === 0 ? (
              debouncedSearch ? (
                <InlineEmpty
                  message={MSG.noMatchPending}
                  cta={MSG.clearFilters}
                  onCta={clearFilters}
                />
              ) : (
                <div className="p-6">
                  <EmptyState
                    title={MSG.emptyPendingTitle}
                    description={MSG.emptyPendingDescription}
                    icon={<Mail className="size-7" />}
                    action={{
                      label: MSG.emptyCta,
                      onClick: () => setDrawerOpen(true),
                    }}
                  />
                </div>
              )
            ) : null}

            {view === 'TEACHERS' && teacherRows.length > 0 ? (
              <TeacherTable
                rows={teacherRows}
                meId={meId}
                pendingRowId={pendingRowId}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
              />
            ) : null}

            {view === 'PENDING' && inviteRows.length > 0 ? (
              <InviteTable
                rows={inviteRows}
                pendingRowId={pendingRowId}
                onCopy={handleCopyInviteLink}
                onRevoke={handleRevokeInvite}
              />
            ) : null}

            {/* Pagination footer — only when we have rows */}
            {((view === 'TEACHERS' && teacherRows.length > 0) ||
              (view === 'PENDING' && inviteRows.length > 0)) && total > 0 ? (
              <footer className="flex flex-col items-start justify-between gap-3 border-t border-(--vaasenk-line-sand)/60 bg-white/40 px-5 py-4 sm:flex-row sm:items-center">
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
            ) : null}
          </>
        ) : null}

        {bootstrapError && !error ? (
          <div
            role="alert"
            className="m-6 rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-4 py-3 text-sm text-(--vaasenk-danger)"
          >
            {bootstrapError}
          </div>
        ) : null}
      </GlassCard>

      {/* Follow-up info card — bulk CSV deferred per spec (see page.tsx). */}
      <FollowUpInfoCard onInvite={() => setDrawerOpen(true)} />

      {/* Drawer */}
      {drawerOpen ? (
        <InviteTeacherDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          onSuccess={handleInviteSent}
        />
      ) : null}
    </div>
  );
}

// ===========================================================================
// Helpers / sub-components (local — narrowly scoped to this page)
// ===========================================================================

/**
 * Browser-side raw envelope fetch — apiFetch unwraps `data` only and drops
 * pagination `meta`. The list endpoints need both, so we go around the
 * helper but reuse its Supabase token + base URL conventions.
 */
async function fetchEnvelope<T extends { data: unknown; meta?: unknown }>(
  path: string,
): Promise<T> {
  const { createClient } = await import('@/lib/supabase/client');
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const base = (
    process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
  ).replace(/\/$/, '');
  const url = path.startsWith('http') ? path : `${base}${path}`;

  const headers = new Headers();
  if (session?.access_token) {
    headers.set('authorization', `Bearer ${session.access_token}`);
  }

  const res = await fetch(url, { headers });
  if (res.status === 204) return { data: [], meta: { page: 1, limit: 0, total: 0 } } as unknown as T;
  const payload: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errPayload = payload as { error?: { code?: string; message?: string; details?: unknown } };
    const err = errPayload.error ?? {
      code: `HTTP_${res.status}`,
      message: res.statusText || 'Request failed',
    };
    throw new ApiClientError(
      res.status,
      err.code ?? `HTTP_${res.status}`,
      err.message ?? 'Request failed',
      err.details,
    );
  }
  return payload as T;
}

// ---------- Filter chip -----------------------------------------------------

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

// ---------- Skeleton --------------------------------------------------------

function TableSkeleton({ view }: { view: ViewMode }) {
  const cols = view === 'TEACHERS' ? 5 : 4;
  return (
    <div className="p-2" role="status" aria-live="polite" aria-busy>
      <span className="sr-only">{MSG.loadingHint}</span>
      <div className="hidden md:block">
        <div className="grid grid-cols-[2.4fr_2fr_1fr_2fr_1.2fr_56px] gap-4 border-b border-(--vaasenk-line-sand)/60 px-4 py-3">
          {Array.from({ length: cols + 1 }).map((_, i) => (
            <LoadingSkeleton key={i} variant="text" className="w-24" />
          ))}
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-[2.4fr_2fr_1fr_2fr_1.2fr_56px] items-center gap-4 px-4 py-4"
          >
            <div className="flex items-center gap-3">
              <LoadingSkeleton variant="circle" className="size-10" />
              <LoadingSkeleton variant="text" className="w-32" />
            </div>
            <LoadingSkeleton variant="text" className="w-40" />
            <LoadingSkeleton variant="text" className="w-16" />
            <LoadingSkeleton variant="text" className="w-32" />
            <LoadingSkeleton variant="text" className="w-20" />
            <LoadingSkeleton variant="rect" className="h-8 w-8" />
          </div>
        ))}
      </div>
      {/* Mobile card skeleton */}
      <div className="space-y-3 p-4 md:hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-2xl border border-(--vaasenk-line-sand)/60 bg-white/60 p-4"
          >
            <LoadingSkeleton variant="circle" className="size-12" />
            <div className="flex-1 space-y-2">
              <LoadingSkeleton variant="text" className="w-2/3" />
              <LoadingSkeleton variant="text" className="w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Inline empty (filters return zero) -----------------------------

function InlineEmpty({
  message,
  cta,
  onCta,
}: {
  message: string;
  cta: string;
  onCta: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-sm text-(--vaasenk-muted)">{message}</p>
      <VaasenkButton variant="secondary" size="sm" onClick={onCta}>
        {cta}
      </VaasenkButton>
    </div>
  );
}

// ---------- Teacher table (web) + card list (mobile) -----------------------

function TeacherTable({
  rows,
  meId,
  pendingRowId,
  onStatusChange,
  onDelete,
}: {
  rows: TeacherRow[];
  meId: string | null;
  pendingRowId: string | null;
  onStatusChange: (row: TeacherRow, next: 'ACTIVE' | 'INACTIVE') => void;
  onDelete: (row: TeacherRow) => void;
}) {
  return (
    <>
      {/* Web: simple table per design-docs lines 467–479 (cream, sticky header,
          no heavy borders, filters-as-chips already above). */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-white/70 text-left text-xs uppercase tracking-wider text-(--vaasenk-muted)">
              <th
                scope="col"
                className="sticky top-0 z-10 border-b border-(--vaasenk-line-sand)/70 bg-white/85 px-5 py-3 font-semibold backdrop-blur"
              >
                {MSG.colTeacher}
              </th>
              <th
                scope="col"
                className="sticky top-0 z-10 border-b border-(--vaasenk-line-sand)/70 bg-white/85 px-5 py-3 font-semibold backdrop-blur"
              >
                {MSG.colEmail}
              </th>
              <th
                scope="col"
                className="sticky top-0 z-10 border-b border-(--vaasenk-line-sand)/70 bg-white/85 px-5 py-3 font-semibold backdrop-blur"
              >
                {MSG.colStatus}
              </th>
              <th
                scope="col"
                className="sticky top-0 z-10 border-b border-(--vaasenk-line-sand)/70 bg-white/85 px-5 py-3 font-semibold backdrop-blur"
              >
                {MSG.colDepartment}
              </th>
              <th
                scope="col"
                className="sticky top-0 z-10 border-b border-(--vaasenk-line-sand)/70 bg-white/85 px-5 py-3 font-semibold backdrop-blur"
              >
                {MSG.colJoined}
              </th>
              <th
                scope="col"
                className="sticky top-0 z-10 w-[64px] border-b border-(--vaasenk-line-sand)/70 bg-white/85 px-3 py-3 font-semibold backdrop-blur"
              >
                <span className="sr-only">{MSG.colActions}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isSelf = meId === row.id;
              const inFlight = pendingRowId === row.id;
              return (
                <tr
                  key={row.id}
                  className="group transition-colors hover:bg-white/55"
                >
                  <td className="border-b border-(--vaasenk-line-sand)/40 px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={row.name} url={row.avatarUrl} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-(--vaasenk-ink)">
                          {row.name}
                          {isSelf ? (
                            <span className="ml-2 inline-flex items-center rounded-full bg-(--vaasenk-rose-wash) px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-(--vaasenk-deep-maroon)">
                              You
                            </span>
                          ) : null}
                        </p>
                        {row.teacherProfile?.employeeCode ? (
                          <p className="truncate text-xs text-(--vaasenk-muted)">
                            {row.teacherProfile.employeeCode}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="border-b border-(--vaasenk-line-sand)/40 px-5 py-3.5 text-(--vaasenk-ink)">
                    {row.email ?? '—'}
                  </td>
                  <td className="border-b border-(--vaasenk-line-sand)/40 px-5 py-3.5">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="border-b border-(--vaasenk-line-sand)/40 px-5 py-3.5">
                    <DepartmentCell profile={row.teacherProfile} />
                  </td>
                  <td className="border-b border-(--vaasenk-line-sand)/40 px-5 py-3.5 text-(--vaasenk-muted)">
                    {formatRelative(row.createdAt)}
                  </td>
                  <td className="border-b border-(--vaasenk-line-sand)/40 px-3 py-3.5">
                    <TeacherRowMenu
                      row={row}
                      isSelf={isSelf}
                      inFlight={inFlight}
                      onStatusChange={onStatusChange}
                      onDelete={onDelete}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: card list per design-docs ("mobile can show teacher cards") */}
      <ul className="flex flex-col gap-3 p-4 md:hidden">
        {rows.map((row) => {
          const isSelf = meId === row.id;
          const inFlight = pendingRowId === row.id;
          return (
            <li
              key={row.id}
              className="rounded-2xl border border-(--vaasenk-line-sand)/60 bg-white/70 p-4"
            >
              <div className="flex items-start gap-3">
                <Avatar name={row.name} url={row.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-(--vaasenk-ink)">
                        {row.name}
                        {isSelf ? (
                          <span className="ml-2 inline-flex items-center rounded-full bg-(--vaasenk-rose-wash) px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-(--vaasenk-deep-maroon)">
                            You
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-sm text-(--vaasenk-muted)">
                        {row.email ?? '—'}
                      </p>
                    </div>
                    <TeacherRowMenu
                      row={row}
                      isSelf={isSelf}
                      inFlight={inFlight}
                      onStatusChange={onStatusChange}
                      onDelete={onDelete}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <StatusBadge status={row.status} />
                    <DepartmentCell profile={row.teacherProfile} inline />
                  </div>
                  <p className="mt-2 text-xs text-(--vaasenk-subtle)">
                    Joined {formatRelative(row.createdAt)}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ---------- Invite table (pending) -----------------------------------------

function InviteTable({
  rows,
  pendingRowId,
  onCopy,
  onRevoke,
}: {
  rows: InviteRow[];
  pendingRowId: string | null;
  onCopy: (row: InviteRow) => void;
  onRevoke: (row: InviteRow) => void;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-white/70 text-left text-xs uppercase tracking-wider text-(--vaasenk-muted)">
              <th
                scope="col"
                className="sticky top-0 z-10 border-b border-(--vaasenk-line-sand)/70 bg-white/85 px-5 py-3 font-semibold backdrop-blur"
              >
                {MSG.colTeacher}
              </th>
              <th
                scope="col"
                className="sticky top-0 z-10 border-b border-(--vaasenk-line-sand)/70 bg-white/85 px-5 py-3 font-semibold backdrop-blur"
              >
                {MSG.colEmail}
              </th>
              <th
                scope="col"
                className="sticky top-0 z-10 border-b border-(--vaasenk-line-sand)/70 bg-white/85 px-5 py-3 font-semibold backdrop-blur"
              >
                {MSG.colExpires}
              </th>
              <th
                scope="col"
                className="sticky top-0 z-10 border-b border-(--vaasenk-line-sand)/70 bg-white/85 px-5 py-3 font-semibold backdrop-blur"
              >
                {MSG.colInvitedBy}
              </th>
              <th
                scope="col"
                className="sticky top-0 z-10 w-[64px] border-b border-(--vaasenk-line-sand)/70 bg-white/85 px-3 py-3 font-semibold backdrop-blur"
              >
                <span className="sr-only">{MSG.colActions}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const displayName = row.metadata?.name?.trim() || row.email;
              const inFlight = pendingRowId === row.id;
              return (
                <tr key={row.id} className="group transition-colors hover:bg-white/55">
                  <td className="border-b border-(--vaasenk-line-sand)/40 px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={displayName} url={null} pending />
                      <p className="truncate font-medium text-(--vaasenk-ink)">
                        {displayName}
                      </p>
                    </div>
                  </td>
                  <td className="border-b border-(--vaasenk-line-sand)/40 px-5 py-3.5 text-(--vaasenk-ink)">
                    {row.email}
                  </td>
                  <td className="border-b border-(--vaasenk-line-sand)/40 px-5 py-3.5">
                    <ExpiryPill expiresAt={row.expiresAt} />
                  </td>
                  <td className="border-b border-(--vaasenk-line-sand)/40 px-5 py-3.5 text-(--vaasenk-muted)">
                    {row.invitedBy.name}
                  </td>
                  <td className="border-b border-(--vaasenk-line-sand)/40 px-3 py-3.5">
                    <InviteRowMenu
                      row={row}
                      inFlight={inFlight}
                      onCopy={onCopy}
                      onRevoke={onRevoke}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 p-4 md:hidden">
        {rows.map((row) => {
          const displayName = row.metadata?.name?.trim() || row.email;
          const inFlight = pendingRowId === row.id;
          return (
            <li
              key={row.id}
              className="rounded-2xl border border-(--vaasenk-line-sand)/60 bg-white/70 p-4"
            >
              <div className="flex items-start gap-3">
                <Avatar name={displayName} url={null} pending />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-(--vaasenk-ink)">
                        {displayName}
                      </p>
                      <p className="truncate text-sm text-(--vaasenk-muted)">
                        {row.email}
                      </p>
                    </div>
                    <InviteRowMenu
                      row={row}
                      inFlight={inFlight}
                      onCopy={onCopy}
                      onRevoke={onRevoke}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <ExpiryPill expiresAt={row.expiresAt} />
                    <span className="text-xs text-(--vaasenk-subtle)">
                      by {row.invitedBy.name}
                    </span>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ---------- Row dropdown menus ---------------------------------------------

function TeacherRowMenu({
  row,
  isSelf,
  inFlight,
  onStatusChange,
  onDelete,
}: {
  row: TeacherRow;
  isSelf: boolean;
  inFlight: boolean;
  onStatusChange: (row: TeacherRow, next: 'ACTIVE' | 'INACTIVE') => void;
  onDelete: (row: TeacherRow) => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={MSG.rowActions}
          disabled={inFlight}
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
          className="z-50 min-w-[200px] overflow-hidden rounded-2xl border border-(--vaasenk-line-sand) bg-white/95 p-1.5 shadow-[0_18px_50px_rgba(74,5,8,0.16)] backdrop-blur-xl"
        >
          {row.status === 'ACTIVE' ? (
            <MenuItem
              icon={UserMinus}
              disabled={isSelf}
              onSelect={() => onStatusChange(row, 'INACTIVE')}
              tone="default"
              hint={isSelf ? 'You can’t deactivate yourself.' : undefined}
            >
              {MSG.deactivate}
            </MenuItem>
          ) : (
            <MenuItem
              icon={UserCheck}
              onSelect={() => onStatusChange(row, 'ACTIVE')}
              tone="default"
            >
              {MSG.activate}
            </MenuItem>
          )}
          <DropdownMenu.Separator className="my-1 h-px bg-(--vaasenk-line-sand)/60" />
          <MenuItem
            icon={UserCog}
            disabled={isSelf}
            onSelect={() => onDelete(row)}
            tone="danger"
            hint={isSelf ? 'You can’t remove yourself.' : undefined}
          >
            {MSG.remove}
          </MenuItem>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function InviteRowMenu({
  row,
  inFlight,
  onCopy,
  onRevoke,
}: {
  row: InviteRow;
  inFlight: boolean;
  onCopy: (row: InviteRow) => void;
  onRevoke: (row: InviteRow) => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={MSG.rowActions}
          disabled={inFlight}
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
          className="z-50 min-w-[200px] overflow-hidden rounded-2xl border border-(--vaasenk-line-sand) bg-white/95 p-1.5 shadow-[0_18px_50px_rgba(74,5,8,0.16)] backdrop-blur-xl"
        >
          <MenuItem
            icon={Copy}
            onSelect={() => onCopy(row)}
            tone="default"
          >
            {MSG.copyLink}
          </MenuItem>
          <DropdownMenu.Separator className="my-1 h-px bg-(--vaasenk-line-sand)/60" />
          <MenuItem
            icon={XCircle}
            onSelect={() => onRevoke(row)}
            tone="danger"
          >
            {MSG.revoke}
          </MenuItem>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MenuItem({
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

// ---------- Smaller display primitives -------------------------------------

function Avatar({
  name,
  url,
  pending,
}: {
  name: string;
  url: string | null;
  pending?: boolean;
}) {
  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={40}
        height={40}
        unoptimized
        className="size-10 shrink-0 rounded-full object-cover ring-1 ring-(--vaasenk-line-sand)"
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';
  return (
    <div
      aria-hidden
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold text-white',
        pending
          ? 'bg-(image:--gradient-deep-ai-glow) opacity-80'
          : 'bg-(image:--gradient-teacher-orange)',
      )}
    >
      {initials}
    </div>
  );
}

function StatusBadge({ status }: { status: UserStatus }) {
  const styles: Record<UserStatus, string> = {
    ACTIVE:
      'bg-(--vaasenk-success)/12 text-(--vaasenk-success) ring-(--vaasenk-success)/30',
    INACTIVE:
      'bg-(--vaasenk-subtle)/15 text-(--vaasenk-muted) ring-(--vaasenk-line-sand)',
    ARCHIVED:
      'bg-(--vaasenk-danger)/10 text-(--vaasenk-danger) ring-(--vaasenk-danger)/25',
  };
  const labels: Record<UserStatus, string> = {
    ACTIVE: 'Active',
    INACTIVE: 'Inactive',
    ARCHIVED: 'Archived',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1',
        styles[status],
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full',
          status === 'ACTIVE'
            ? 'bg-(--vaasenk-success)'
            : status === 'ARCHIVED'
              ? 'bg-(--vaasenk-danger)'
              : 'bg-(--vaasenk-subtle)',
        )}
      />
      {labels[status]}
    </span>
  );
}

function DepartmentCell({
  profile,
  inline,
}: {
  profile?: TeacherRow['teacherProfile'];
  inline?: boolean;
}) {
  if (!profile || (!profile.department && profile.subjects.length === 0)) {
    return (
      <span className="text-sm text-(--vaasenk-subtle)">Not assigned</span>
    );
  }
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1.5',
        inline ? '' : 'max-w-xs',
      )}
    >
      {profile.department ? (
        <span className="inline-flex items-center rounded-full bg-(--vaasenk-peach-wash) px-2.5 py-0.5 text-xs font-semibold text-(--vaasenk-deep-maroon)">
          {profile.department}
        </span>
      ) : null}
      {profile.subjects.slice(0, 3).map((s) => (
        <span
          key={s}
          className="inline-flex items-center rounded-full bg-(--vaasenk-rose-wash) px-2.5 py-0.5 text-xs font-medium text-(--vaasenk-deep-maroon)"
        >
          {s}
        </span>
      ))}
      {profile.subjects.length > 3 ? (
        <span className="text-xs text-(--vaasenk-muted)">
          +{profile.subjects.length - 3}
        </span>
      ) : null}
    </div>
  );
}

function ExpiryPill({ expiresAt }: { expiresAt: string }) {
  const days = useMemo(() => daysUntil(expiresAt), [expiresAt]);
  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-(--vaasenk-danger)/10 px-2.5 py-0.5 text-xs font-semibold text-(--vaasenk-danger) ring-1 ring-(--vaasenk-danger)/25">
        Expired
      </span>
    );
  }
  const tone =
    days <= 1
      ? 'bg-(--vaasenk-warning)/15 text-(--vaasenk-warning) ring-(--vaasenk-warning)/25'
      : 'bg-(--vaasenk-rose-wash) text-(--vaasenk-deep-maroon) ring-(--vaasenk-line-sand)';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1',
        tone,
      )}
    >
      {days === 0
        ? 'Expires today'
        : days === 1
          ? 'Expires in 1 day'
          : `Expires in ${days} days`}
    </span>
  );
}

// ---------- Follow-up info card --------------------------------------------

function FollowUpInfoCard({ onInvite }: { onInvite: () => void }) {
  return (
    <GlassCard padding="md" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-2xl bg-(--vaasenk-peach-wash) text-(--vaasenk-red)"
        >
          <Link2 className="size-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-(--vaasenk-ink)">
            {MSG.bulkInfoTitle}
          </p>
          <p className="mt-1 max-w-2xl text-sm text-(--vaasenk-muted)">
            {MSG.bulkInfoDescription}
          </p>
        </div>
      </div>
      <VaasenkButton variant="secondary" size="sm" onClick={onInvite}>
        <UserPlus className="size-4" />
        {MSG.inviteCta}
      </VaasenkButton>
    </GlassCard>
  );
}

// ---------- Utilities -------------------------------------------------------

function daysUntil(iso: string): number {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return 0;
  const now = Date.now();
  const diff = target - now;
  // Floor rather than round so "3 days left" stays "3" until it crosses zero.
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function formatRelative(iso: string): string {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return '—';
  const now = new Date();
  const diffMs = now.getTime() - target.getTime();
  const day = 1000 * 60 * 60 * 24;
  const days = Math.floor(diffMs / day);
  if (days < 1) return 'Today';
  if (days < 2) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} wk ago`;
  // Older: render as Mon DD ("Apr 14").
  return target.toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    ...(now.getFullYear() === target.getFullYear() ? {} : { year: 'numeric' }),
  });
}

