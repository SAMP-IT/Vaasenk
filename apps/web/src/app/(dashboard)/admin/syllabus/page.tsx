import type { Metadata } from 'next';
import { SyllabusLibraryClient } from './syllabus-library-client';

/**
 * Admin → Syllabus Library (Sprint 3.3 / Playbook Prompt 16).
 *
 * Per design-docs Vaasenk UI/UX v0.1 §15 (lines 794–805):
 *   Purpose:  "Upload and manage standard syllabus PDFs for Samacheer Kalvi,
 *              CBSE, or custom institution syllabus."
 *   Layout:   "Library grid/list with board, class, subject, version, upload
 *              status, AI indexing status."
 *   Actions:  "Upload PDF, replace version, map to class, archive, view AI
 *              status."
 *   States:   "Duplicate syllabus, invalid PDF, OCR failed, indexing pending,
 *              version conflict."
 *   Perms:    "Admin upload/manage. Teachers view mapped syllabus only.
 *              This is intentionally admin-side to reduce teacher burden."
 *
 * The dashboard chrome (sidebar + topbar) is provided by
 * apps/web/src/app/(dashboard)/layout.tsx and the 4px Admin Royal accent
 * strip is rendered by apps/web/src/app/(dashboard)/admin/layout.tsx — this
 * page renders into the main column only.
 *
 * The page is a Server Component that delegates to a client component for
 * filter / fetch / drawer state. RBAC is enforced server-side by the API
 * (controllers gate POST/PATCH/DELETE behind ADMIN | SUPER_ADMIN); the
 * dashboard layout enforces an authenticated session.
 */

export const metadata: Metadata = {
  title: 'Syllabus Library · Vaasenk Admin',
  description:
    'Upload and manage syllabus PDFs. Map to classrooms so AI features can ground responses in real curriculum. Admin only.',
};

export default function AdminSyllabusPage() {
  return <SyllabusLibraryClient />;
}
