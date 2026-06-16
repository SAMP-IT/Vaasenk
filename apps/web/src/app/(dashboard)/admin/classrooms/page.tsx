import type { Metadata } from 'next';
import { ClassroomsClient } from './classrooms-client';

export const metadata: Metadata = {
  title: 'Classrooms · Vaasenk Admin',
  description:
    'Create classrooms, assign teachers, and hand out invite codes so students can join.',
};

/**
 * Admin classrooms — the core-loop entry point. This is where an admin
 * actually creates a classroom (the #1 P0 blocker before this shipped).
 *
 * Thin Server Component shell; all data fetching + interactivity lives in the
 * client component (identity bootstrap via /auth/me, list via /classrooms,
 * create via the drawer → POST /classrooms).
 */
export default function AdminClassroomsPage() {
  return <ClassroomsClient />;
}
