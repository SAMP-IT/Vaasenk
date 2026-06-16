import Link from 'next/link';
import { Search } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { PageShell } from '@/components/ui/page-shell';
import { VaasenkButton } from '@/components/ui/vaasenk-button';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { DashboardSidebarNav, type NavItem, type ComingSoonItem } from './sidebar-nav';
import { signOutAction } from './sign-out-action';

/**
 * Shared dashboard chrome: cream-canvas page shell + sticky top bar +
 * role-aware side navigation. Role-specific layouts compose into the
 * {children} slot.
 *
 * Sprint 8.2 — Sidebar is now role-aware. ADMIN / SUPER_ADMIN gets the
 * full 9-link admin nav (Dashboard, Classes, Teachers, Students, Syllabus,
 * Sample Papers, Classrooms, Billing, Settings). TEACHER and STUDENT
 * fall back to the minimal "role spaces" placeholder list from Sprint 0
 * — proper teacher/student nav is mobile-first and out of scope here.
 *
 * Role is resolved server-side from the Supabase user's app_metadata
 * (same source the middleware reads). When Supabase is misconfigured in
 * dev (placeholder env), the role is undefined and the legacy nav renders
 * so designers can still see every page.
 *
 * Nav items pass icon KEYS (strings) — not component references — to the
 * client sidebar component. Server → client boundaries cannot serialize
 * function identifiers; sidebar-nav.tsx maps the keys back to Lucide
 * components on the client.
 */

async function resolveUserRole(): Promise<{
  role: string | undefined;
  displayName: string | undefined;
}> {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const raw = user?.app_metadata?.['role'];
    const role = typeof raw === 'string' ? raw.toUpperCase() : undefined;
    const displayName =
      (typeof user?.user_metadata?.['name'] === 'string'
        ? (user.user_metadata['name'] as string)
        : undefined) ?? user?.email ?? undefined;
    return { role, displayName };
  } catch {
    // Supabase isn't configured (dev/placeholder env). Fall back to no role.
    return { role: undefined, displayName: undefined };
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { role, displayName } = await resolveUserRole();
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';

  return (
    <PageShell bare>
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r border-(--vaasenk-line-sand)/60 bg-white/40 px-5 py-7 backdrop-blur-xl lg:flex">
          <Link href="/" className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-9 place-items-center rounded-xl bg-linear-to-br from-vaasenk-red to-vaasenk-sunrise-orange text-white font-semibold shadow-[0_8px_24px_rgba(160,0,0,0.18)]"
            >
              V
            </span>
            <span className="text-lg font-semibold tracking-tight text-(--vaasenk-ink)">
              Vaasenk
            </span>
          </Link>

          {isAdmin ? (
            <DashboardSidebarNav items={ADMIN_NAV_ITEMS} groupLabel="Admin" />
          ) : (
            <DashboardSidebarNav
              items={ROLE_SPACE_FALLBACK_ITEMS}
              groupLabel="Role spaces"
              comingSoon={COMING_SOON_FALLBACK_ITEMS}
            />
          )}

          {displayName ? (
            <div className="mt-auto rounded-2xl border border-(--vaasenk-line-sand) bg-white/70 p-4 text-sm">
              <p className="text-xs font-medium uppercase tracking-wider text-(--vaasenk-subtle)">
                Signed in
              </p>
              <p className="mt-1 truncate font-medium text-(--vaasenk-ink)">
                {displayName}
              </p>
              {role ? (
                <p className="mt-0.5 text-xs text-(--vaasenk-muted)">
                  {role.replace('_', ' ').toLowerCase()}
                </p>
              ) : null}
            </div>
          ) : null}
        </aside>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Topbar */}
          <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-(--vaasenk-line-sand)/60 bg-white/55 px-6 py-4 backdrop-blur-xl">
            <div className="flex flex-1 items-center gap-3">
              <div className="relative hidden w-full max-w-md md:block">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-(--vaasenk-subtle)" />
                <input
                  type="search"
                  placeholder="Search classrooms, notes, students…"
                  disabled
                  className="w-full rounded-full border border-(--vaasenk-line-sand) bg-white/80 py-2.5 pl-11 pr-4 text-sm text-(--vaasenk-ink) placeholder:text-(--vaasenk-subtle) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/20 disabled:opacity-70"
                />
              </div>
            </div>
            {/* Sprint 6.2 — real notification bell + center + WebSocket stream. */}
            <NotificationBell />
            <form action={signOutAction}>
              <VaasenkButton type="submit" variant="secondary" size="sm">
                Sign out
              </VaasenkButton>
            </form>
          </header>

          <main className="flex-1 px-6 py-8">{children}</main>
        </div>
      </div>
    </PageShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Nav items                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Sprint 8.2 — full admin sidebar. 9 links in the order requested by the
 * Playbook Prompt 28 spec. Routes that exist today (Dashboard, Teachers,
 * Syllabus, Billing) are real; the rest (Classes, Students, Sample Papers,
 * Classrooms, Settings) point to polite "Coming in v2" placeholder pages
 * to keep navigation unbroken.
 */
const ADMIN_NAV_ITEMS: ReadonlyArray<NavItem> = [
  { href: '/admin/dashboard', label: 'Dashboard', iconKey: 'dashboard' },
  { href: '/admin/classes', label: 'Classes', iconKey: 'school', comingSoon: true },
  { href: '/admin/teachers', label: 'Teachers', iconKey: 'users' },
  { href: '/admin/students', label: 'Students', iconKey: 'graduation-cap', comingSoon: true },
  { href: '/admin/syllabus', label: 'Syllabus', iconKey: 'file-text' },
  { href: '/admin/sample-papers', label: 'Sample Papers', iconKey: 'clipboard-list', comingSoon: true },
  { href: '/admin/classrooms', label: 'Classrooms', iconKey: 'book-open', comingSoon: true },
  { href: '/admin/billing', label: 'Billing', iconKey: 'credit-card' },
  { href: '/admin/settings', label: 'Settings', iconKey: 'settings', comingSoon: true },
];

const ROLE_SPACE_FALLBACK_ITEMS: ReadonlyArray<NavItem> = [
  { href: '/admin', label: 'Admin', iconKey: 'school' },
  { href: '/teacher', label: 'Teacher', iconKey: 'graduation-cap' },
  { href: '/student', label: 'Student', iconKey: 'book-open' },
];

const COMING_SOON_FALLBACK_ITEMS: ReadonlyArray<ComingSoonItem> = [
  { label: 'Classrooms', iconKey: 'dashboard' },
  { label: 'Notes', iconKey: 'book-open' },
  { label: 'AI chatbot', iconKey: 'sparkles' },
  { label: 'Members', iconKey: 'users' },
  { label: 'Settings', iconKey: 'settings' },
];
