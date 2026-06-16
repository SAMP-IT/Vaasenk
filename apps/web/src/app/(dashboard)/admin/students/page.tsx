import type { Metadata } from 'next';
import { AdminComingSoonPage } from '../_coming-soon/coming-soon';

export const metadata: Metadata = {
  title: 'Students · Vaasenk Admin',
  description: 'Manage student accounts, classroom enrolment, and CSV import. Coming in v2.',
};

/**
 * Sprint 8.2 placeholder. Student management has API-level support (create
 * student + CSV import in Sprint 1.5) but no dedicated admin UI yet —
 * teachers add students by sharing the classroom invite code from the
 * teacher classroom-detail page, and the CSV-import endpoint is reachable
 * by ops via direct API calls. A first-class admin surface lands in v2.
 */
export default function AdminStudentsPage() {
  return (
    <AdminComingSoonPage
      eyebrow="Admin · Members"
      title="Students"
      description="A dedicated student-management surface — invite, edit, archive, bulk-import CSV, and view per-student progress — is coming in v2."
      bullets={[
        'Searchable, filterable table of all active students',
        'CSV bulk-import with row-level validation feedback',
        'Per-classroom enrolment + transfer between sections',
        'Activity timeline per student (notes viewed, AI usage)',
      ]}
      ctaHref="/admin/teachers"
      ctaLabel="Manage teachers instead"
      related={
        <p>
          For now, teachers can share each classroom&apos;s 6-character invite code
          (visible on the teacher classroom-detail page) so students self-enrol from the
          mobile app. CSV bulk-import is available via the backend endpoint
          <code className="mx-1 rounded bg-(--vaasenk-rose-wash) px-1.5 py-0.5 text-[12px] text-(--vaasenk-deep-maroon)">
            POST /api/v1/users/students/import
          </code>
          for ops staff.
        </p>
      }
    />
  );
}
