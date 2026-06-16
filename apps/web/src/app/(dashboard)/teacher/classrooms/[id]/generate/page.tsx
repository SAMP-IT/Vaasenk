import type { Metadata } from 'next';
import { GenerateWizardClient } from './generate-wizard-client';

/**
 * Teacher → Classroom → Question Paper Generator (Sprint 5.3 / Playbook
 * Prompt 21).
 *
 * Server component shell — the wizard itself is a Client Component that
 * manages a six-step state machine, sessionStorage persistence, and
 * a 2s polling loop for the generation job.
 *
 * Inherits the (dashboard) chrome (sidebar + topbar) from
 * apps/web/src/app/(dashboard)/layout.tsx and the 4px Teacher Orange strip
 * from apps/web/src/app/(dashboard)/teacher/layout.tsx.
 *
 * Per CLAUDE.md §6 + design-docs UI/UX §16 the AI disclaimer is rendered
 * on every screen of the wizard, not just step 1.
 */

export const metadata: Metadata = {
  title: 'Generate question paper · Vaasenk',
  description:
    'Generate a structured exam paper from your mapped syllabus using Vaasenk AI.',
};

type PageProps = {
  // Next 15 — params are async.
  params: Promise<{ id: string }>;
};

export default async function GenerateQuestionPaperPage({ params }: PageProps) {
  const { id } = await params;
  return <GenerateWizardClient classroomId={id} />;
}
