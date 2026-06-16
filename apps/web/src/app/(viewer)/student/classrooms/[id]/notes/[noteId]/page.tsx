import type { Metadata } from 'next';
import { NoteViewerClient } from './note-viewer-client';

/**
 * Sprint 2.5 / Playbook Prompt 14 — Student Note Detail / Viewer.
 *
 * Server-component shell only — the viewer is a heavy client surface
 * (pinch-zoom, PDF iframe, bookmark toggle), so we delegate immediately.
 *
 * Rendered inside the (viewer) route group's layout (no sidebar, no topbar)
 * so the note has the full viewport. See app/(viewer)/layout.tsx.
 */
export const metadata: Metadata = {
  title: 'Note · Vaasenk',
  description: 'Read, zoom, bookmark, and download a classroom note.',
};

type PageProps = {
  params: Promise<{ id: string; noteId: string }>;
};

export default async function StudentNoteViewerPage({ params }: PageProps) {
  const { id, noteId } = await params;
  return <NoteViewerClient classroomId={id} noteId={noteId} />;
}
