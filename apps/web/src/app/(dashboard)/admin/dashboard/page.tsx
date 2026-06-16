import type { Metadata } from 'next';
import { DashboardClient } from './dashboard-client';

/**
 * Admin → Dashboard (Sprint 8.2 / Playbook Prompt 28).
 *
 * The dashboard's hero, 5 stat sections (Setup Checklist, Stats Cards,
 * AI Processing Status, Recent Activity, Subscription Status), and any
 * interactive bits live in the client component. The page boundary stays
 * thin: identity bootstrap + data fetching happens client-side via apiFetch
 * because that's how the existing admin pages (setup, teachers, syllabus)
 * already do it — keeping the bearer-token plumbing in one place.
 *
 * The dashboard chrome (sidebar + topbar) is provided by
 * apps/web/src/app/(dashboard)/layout.tsx; the 4px Admin Royal accent
 * strip is rendered by apps/web/src/app/(dashboard)/admin/layout.tsx.
 */
export const metadata: Metadata = {
  title: 'Dashboard · Vaasenk Admin',
  description:
    'Institution-wide overview — setup checklist, usage statistics, AI processing, recent activity, and subscription status.',
};

export default function AdminDashboardPage() {
  return <DashboardClient />;
}
