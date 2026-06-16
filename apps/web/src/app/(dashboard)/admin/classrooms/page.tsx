import type { Metadata } from 'next';
import { AdminComingSoonPage } from '../_coming-soon/coming-soon';

export const metadata: Metadata = {
  title: 'Classrooms · Vaasenk Admin',
  description: 'Cross-classroom admin view — usage, members, syllabus mapping. Coming in v2.',
};

/**
 * Sprint 8.2 placeholder. Teachers manage their own classrooms via the
 * teacher detail page (`/teacher/classrooms/[id]`) and that already covers
 * the core lifecycle (members, notes, invite code, syllabus assignment).
 * What's missing for v2 is an admin-side cross-classroom view: a single
 * table with all classrooms, their teachers, member counts, syllabus
 * mapping, and bulk actions.
 */
export default function AdminClassroomsPage() {
  return (
    <AdminComingSoonPage
      eyebrow="Admin · Operations"
      title="Classrooms"
      description="A cross-classroom admin surface — all classrooms in one searchable table with teachers, member counts, syllabus mapping, and bulk actions — is coming in v2."
      bullets={[
        'Single table across every classroom in the institution',
        'Filter by teacher, class, section, or active status',
        'Bulk-archive end-of-year classrooms with one click',
        'Re-map syllabus to multiple classrooms from one place',
      ]}
      ctaHref="/admin/syllabus"
      ctaLabel="Map syllabus to classrooms"
      related={
        <p>
          Teachers already manage their own classrooms at
          <code className="mx-1 rounded bg-(--vaasenk-rose-wash) px-1.5 py-0.5 text-[12px] text-(--vaasenk-deep-maroon)">
            /teacher/classrooms
          </code>
          . The syllabus library&apos;s &ldquo;Map to classrooms&rdquo; dialog covers
          syllabus assignment today.
        </p>
      }
    />
  );
}
