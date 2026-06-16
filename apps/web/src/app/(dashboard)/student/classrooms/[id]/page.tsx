import type { Metadata } from 'next';
import { ClassroomFeedClient } from './classroom-feed-client';

/**
 * Sprint 2.5 / Playbook Prompt 14 — Student Classroom Feed.
 *
 * Server-component shell only: metadata + delegation to the client
 * component below, mirroring the teacher classroom-detail pattern so the
 * SEO/OG-image story for both roles stays uniform.
 *
 * The dashboard chrome (sidebar + topbar) is provided by
 * apps/web/src/app/(dashboard)/layout.tsx, and the 4px Student Coral
 * accent strip is rendered by
 * apps/web/src/app/(dashboard)/student/layout.tsx — this page renders into
 * the main column only.
 */
export const metadata: Metadata = {
  title: 'Classroom · Vaasenk',
  description:
    'Browse and bookmark your teacher’s published notes for this classroom.',
};

type PageProps = {
  // Next 15 made `params` a Promise — same shape as the teacher page.
  params: Promise<{ id: string }>;
};

export default async function StudentClassroomFeedPage({ params }: PageProps) {
  const { id } = await params;
  return <ClassroomFeedClient classroomId={id} />;
}
