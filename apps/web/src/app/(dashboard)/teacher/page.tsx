import type { Metadata } from 'next';
import { TeacherHomeClient } from './teacher-home-client';

export const metadata: Metadata = {
  title: 'Teacher · Vaasenk',
  description:
    'Your classrooms — upload board notes, ask the AI assistant, and generate question papers.',
};

/**
 * Teacher home. Thin Server Component shell; the client component fetches the
 * teacher's assigned classrooms (role-filtered GET /classrooms) and lists them
 * as cards linking into the existing /teacher/classrooms/[id] detail page.
 */
export default function TeacherHomePage() {
  return <TeacherHomeClient />;
}
