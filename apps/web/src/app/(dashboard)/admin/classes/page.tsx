import type { Metadata } from 'next';
import { AdminComingSoonPage } from '../_coming-soon/coming-soon';

export const metadata: Metadata = {
  title: 'Classes · Vaasenk Admin',
  description: 'Manage classes, sections, and academic-year structure. Coming in v2.',
};

/**
 * Sprint 8.2 placeholder. Class + section management lands as a dedicated
 * admin surface in v2. For now, classes and sections are seeded by the
 * Institution Setup Wizard (`/admin/setup`) — the link below points there.
 */
export default function AdminClassesPage() {
  return (
    <AdminComingSoonPage
      eyebrow="Admin · Academic structure"
      title="Classes & sections"
      description="A dedicated page to add, rename, archive, and reorder classes and sections — plus map subjects to them — is coming in v2."
      bullets={[
        'Inline edit class names and section labels',
        'Drag-to-reorder sections within a class',
        'Bulk archive classes at end of academic year',
        'Map subjects to specific class–section combinations',
      ]}
      ctaHref="/admin/setup"
      ctaLabel="Use the setup wizard"
      related={
        <p>
          You can already add classes and sections through the Institution Setup Wizard.
          Run it again any time — it will load your current configuration so you can
          extend it without starting over.
        </p>
      }
    />
  );
}
