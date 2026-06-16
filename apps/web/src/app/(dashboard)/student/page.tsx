import type { Metadata } from 'next';
import { StudentDashboardClient } from './student-dashboard-client';

/**
 * Sprint 2.4 / Playbook Prompt 13 — Student Home Dashboard.
 *
 * Server-component shell only: it sets metadata and delegates the data
 * fetching + state to the client component below. The shell stays a
 * Server Component so future SEO / OG-image work has a clean entry point.
 *
 * The 4px Student Coral accent strip already lives in
 * `student/layout.tsx` — do NOT re-add it here.
 */
export const metadata: Metadata = {
  title: 'Student · Vaasenk',
  description:
    'Your classroom notes, bookmarks, and quick actions in one calm place.',
};

export default function StudentDashboardPage() {
  return <StudentDashboardClient />;
}
