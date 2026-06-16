import type { Metadata } from 'next';
import { TeachersClient } from './teachers-client';

/**
 * Admin → Teacher management (Sprint 1.6 / Playbook Prompt 9).
 *
 * Per design-docs Vaasenk UI/UX v0.1 §15 (lines 838–848):
 *   "Search/filter table + teacher cards + invite drawer + role/subject
 *    assignment. Primary actions: Invite teacher, assign class, deactivate,
 *    reset password. Required states: Duplicate email, invite expired,
 *    teacher already assigned, bulk upload failed. Permissions: Admin only.
 *    Design notes: Use simple table on web; mobile can show teacher cards."
 *
 * Bulk CSV import is a STUDENT-management feature in the spec; for teachers
 * the Playbook calls out a single-invite drawer only. Teacher CSV is
 * explicitly deferred — see <FollowUpInfoCard /> in teachers-client.tsx.
 *
 * The dashboard chrome (sidebar + topbar) is provided by
 * apps/web/src/app/(dashboard)/layout.tsx and the 4px Admin Royal accent
 * strip is rendered by apps/web/src/app/(dashboard)/admin/layout.tsx — this
 * page renders into the main column only.
 */

export const metadata: Metadata = {
  title: 'Teachers · Vaasenk Admin',
  description:
    'Invite, activate, and manage teachers in your institution. Admin only.',
};

export default function AdminTeachersPage() {
  return <TeachersClient />;
}
