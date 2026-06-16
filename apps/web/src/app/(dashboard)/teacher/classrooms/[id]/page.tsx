import type { Metadata } from 'next';
import { ClassroomDetailClient } from './classroom-detail-client';

/**
 * Teacher → Classroom Detail (Sprint 2.3 / Playbook Prompt 12).
 *
 * Per design-docs Vaasenk UI/UX v0.1 §16 (lines 935–948):
 *   "Header with class identity, tabs, recent notes, syllabus mapping, AI
 *    panel, student activity. Primary actions: Upload note, ask AI, generate
 *    paper, add assignment, view students. Use tabs and AI assistant; keep
 *    first fold action-oriented."
 *
 * Notes is the only fully-built tab for this sprint (Notes Library spec —
 * lines 962–971). Students and Settings are minimally functional (read-only
 * + invite-code refresh). Papers + AI Assistant are placeholder cards that
 * reference their target sprints (Sprint 5 and Sprint 4 respectively).
 *
 * The dashboard chrome (sidebar + topbar) is provided by
 * apps/web/src/app/(dashboard)/layout.tsx, and the 4px Teacher Orange accent
 * strip is rendered by apps/web/src/app/(dashboard)/teacher/layout.tsx — this
 * page renders into the main column only.
 */

export const metadata: Metadata = {
  title: 'Classroom · Vaasenk',
  description:
    'Manage your classroom — upload notes, browse students, and configure the invite code.',
};

type PageProps = {
  // Next 15 made `params` a Promise — see
  // https://nextjs.org/docs/app/building-your-application/upgrading/version-15
  params: Promise<{ id: string }>;
};

export default async function TeacherClassroomDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <ClassroomDetailClient classroomId={id} />;
}
