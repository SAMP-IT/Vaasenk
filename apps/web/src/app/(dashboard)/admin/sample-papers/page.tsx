import type { Metadata } from 'next';
import { AdminComingSoonPage } from '../_coming-soon/coming-soon';

export const metadata: Metadata = {
  title: 'Sample Papers · Vaasenk Admin',
  description: 'Upload and manage sample question papers for AI pattern matching. Coming in v2.',
};

/**
 * Sprint 8.2 placeholder. Sample-paper backend (upload, extract, list) is
 * live (Sprint 3.2) but the dedicated admin library UI is deferred to v2.
 * Sample papers ARE consumed today via the question-paper generation
 * wizard (teacher side), which can pick from the AI_READY pool.
 */
export default function AdminSamplePapersPage() {
  return (
    <AdminComingSoonPage
      eyebrow="Admin · AI library"
      title="Sample papers"
      description="A dedicated library to upload, tag, and archive sample question papers — the patterns the AI uses to mirror your board's style — is coming in v2."
      bullets={[
        'Grid + list views with exam-type, year, term, and status filters',
        'Per-paper detail surface with extraction preview',
        'Replace a paper file in place; archive without losing history',
        'See which generated papers were patterned on which samples',
      ]}
      ctaHref="/admin/syllabus"
      ctaLabel="Go to syllabus library"
      related={
        <p>
          The backend is already complete — sample papers can be uploaded via
          <code className="mx-1 rounded bg-(--vaasenk-rose-wash) px-1.5 py-0.5 text-[12px] text-(--vaasenk-deep-maroon)">
            POST /api/v1/sample-papers
          </code>
          and teachers can already pick them from the question-paper wizard. The
          admin-facing browse + manage UI is the missing piece.
        </p>
      }
    />
  );
}
