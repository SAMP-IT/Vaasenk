'use client';

import {
  AlertCircle,
  BookOpen,
  ChevronRight,
  FileText,
  GraduationCap,
  Sparkles,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { GlassCard } from '@/components/ui/glass-card';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { VaasenkButton } from '@/components/ui/vaasenk-button';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import { listClassrooms, type ClassroomView } from '@/lib/classrooms-api';
import { cn } from '@/lib/utils';

/**
 * Teacher home (`/teacher`). Replaces the dead static page (hardcoded copy,
 * action-less buttons, "Available in Sprint 2+" tiles, href="#").
 *
 * Fetches the teacher's classrooms via GET /classrooms (role-filtered
 * server-side — a teacher gets only the classrooms they're assigned to or a
 * member of) and lists them as cards linking to /teacher/classrooms/[id]
 * (which already exists, with Notes / AI / Papers tabs).
 *
 * Teacher Orange gradient hero. All 5 component states per CLAUDE.md §5.
 * Genuine empty state ("An admin needs to assign you to a classroom") when
 * there are none.
 */

// ---------------------------------------------------------------------------
// Strings
// ---------------------------------------------------------------------------

const MSG = {
  eyebrow: 'Teacher home',
  morning: (name: string | null) =>
    name ? `Good morning, ${name}` : 'Good morning',
  afternoon: (name: string | null) =>
    name ? `Good afternoon, ${name}` : 'Good afternoon',
  evening: (name: string | null) =>
    name ? `Good evening, ${name}` : 'Good evening',
  subtitleWithCount: (n: number) =>
    `You’re teaching ${n} ${n === 1 ? 'classroom' : 'classrooms'}. Open one to upload notes, ask the AI assistant, or generate a paper.`,
  subtitleEmpty:
    'Your classrooms will appear here once an admin assigns you to one.',

  sectionTitle: 'Your classrooms',
  sectionSubtitle: 'Tap a classroom to upload notes, chat with AI, or build a paper.',

  open: 'Open',
  openClassroom: 'Open classroom',
  generatePaper: 'Generate paper',

  members: (n: number) => `${n} ${n === 1 ? 'student' : 'students'}`,
  notes: (n: number) => `${n} ${n === 1 ? 'note' : 'notes'}`,
  syllabusReady: 'Syllabus ready',
  syllabusPending: 'Syllabus processing',
  noSyllabus: 'No syllabus',

  emptyTitle: 'No classrooms yet',
  emptyDescription:
    'An admin needs to assign you to a classroom. Once they do, your notes, AI assistant, and question-paper tools show up right here.',

  errorTitle: 'We couldn’t load your classrooms',
  retry: 'Try again',
  loadingHint: 'Loading your classrooms…',
} as const;

type AuthMeUser = {
  id: string;
  name: string | null;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'TEACHER' | 'STUDENT';
  institutionId: string;
};

function greet(name: string | null): string {
  const hour = new Date().getHours();
  if (hour < 12) return MSG.morning(name);
  if (hour < 17) return MSG.afternoon(name);
  return MSG.evening(name);
}

function firstName(name: string | null): string | null {
  if (!name) return null;
  return name.trim().split(/\s+/)[0] ?? null;
}

export function TeacherHomeClient() {
  const [name, setName] = useState<string | null>(null);
  const [classrooms, setClassrooms] = useState<ClassroomView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [meRes, listRes] = await Promise.all([
        apiFetch<{ user: AuthMeUser }>('/api/v1/auth/me'),
        listClassrooms({ status: 'ACTIVE', limit: 60 }),
      ]);
      setName(firstName(meRes.user.name));
      setClassrooms(listRes.data);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Something went wrong.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const hasClassrooms = classrooms.length > 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      {/* Teacher Orange gradient hero */}
      <section className="relative overflow-hidden rounded-vaasenk-xl bg-(image:--gradient-teacher-orange) p-8 text-white shadow-[0_24px_60px_rgba(255,122,26,0.24)]">
        <div className="relative z-10 max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-wider text-white/80">
            {MSG.eyebrow}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            {greet(name)}
          </h1>
          <p className="mt-2 text-white/85">
            {loading
              ? ' '
              : hasClassrooms
                ? MSG.subtitleWithCount(classrooms.length)
                : MSG.subtitleEmpty}
          </p>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-white/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 right-1/4 size-56 rounded-full bg-vaasenk-gold/30 blur-3xl"
        />
      </section>

      {/* Classrooms section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-(--vaasenk-ink)">
              {MSG.sectionTitle}
            </h2>
            <p className="mt-0.5 text-sm text-(--vaasenk-muted)">
              {MSG.sectionSubtitle}
            </p>
          </div>
        </div>

        {error ? (
          <GlassCard
            padding="lg"
            className="flex flex-col items-center gap-4 text-center"
          >
            <span
              aria-hidden
              className="grid size-14 place-items-center rounded-2xl bg-(--vaasenk-danger)/10 text-(--vaasenk-danger)"
            >
              <AlertCircle className="size-6" />
            </span>
            <div>
              <p className="text-base font-semibold text-(--vaasenk-ink)">
                {MSG.errorTitle}
              </p>
              <p role="alert" className="mt-1 text-sm text-(--vaasenk-muted)">
                {error}
              </p>
            </div>
            <VaasenkButton variant="secondary" size="sm" onClick={fetchAll}>
              {MSG.retry}
            </VaasenkButton>
          </GlassCard>
        ) : loading ? (
          <ClassroomGridSkeleton />
        ) : !hasClassrooms ? (
          <EmptyState
            title={MSG.emptyTitle}
            description={MSG.emptyDescription}
            icon={<GraduationCap className="size-7" />}
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {classrooms.map((c) => (
              <li key={c.id}>
                <TeacherClassroomCard classroom={c} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ===========================================================================
// Card
// ===========================================================================

function TeacherClassroomCard({ classroom }: { classroom: ClassroomView }) {
  const href = `/teacher/classrooms/${classroom.id}`;
  const pills = [
    classroom.class?.name,
    classroom.section ? `Section ${classroom.section.name}` : null,
    classroom.subject?.name,
  ].filter(Boolean) as string[];

  const syllabusTone = classroom.syllabus
    ? classroom.syllabus.status === 'AI_READY'
      ? { label: MSG.syllabusReady, text: 'text-(--vaasenk-success)' }
      : classroom.syllabus.status === 'FAILED'
        ? { label: MSG.noSyllabus, text: 'text-(--vaasenk-danger)' }
        : { label: MSG.syllabusPending, text: 'text-(--vaasenk-warning)' }
    : { label: MSG.noSyllabus, text: 'text-(--vaasenk-subtle)' };

  return (
    <GlassCard padding="md" className="flex h-full flex-col gap-4">
      <Link
        href={href}
        className="group flex items-start gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30"
      >
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-2xl bg-(image:--gradient-teacher-orange) text-white shadow-[0_8px_20px_rgba(255,122,26,0.22)]"
        >
          <BookOpen className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-(--vaasenk-ink) group-hover:text-(--vaasenk-red)">
            {classroom.name}
          </h3>
          {pills.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {pills.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center rounded-full bg-(--vaasenk-peach-wash) px-2.5 py-0.5 text-[11px] font-semibold text-(--vaasenk-deep-maroon)"
                >
                  {p}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <ChevronRight className="mt-1 size-5 shrink-0 text-(--vaasenk-subtle) transition-transform group-hover:translate-x-0.5 group-hover:text-(--vaasenk-red)" />
      </Link>

      {/* Counts + syllabus */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-(--vaasenk-muted)">
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-4 text-(--vaasenk-subtle)" />
          {MSG.members(classroom._count.members)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <FileText className="size-4 text-(--vaasenk-subtle)" />
          {MSG.notes(classroom._count.notes)}
        </span>
        <span className={cn('inline-flex items-center gap-1.5', syllabusTone.text)}>
          <Sparkles className="size-3.5" aria-hidden />
          {syllabusTone.label}
        </span>
      </div>

      {/* Quick actions — every link is a real working route (the classroom
          detail page hosts the Notes / AI / Papers tabs; /generate is the
          question-paper wizard). No dead href="#" links here. */}
      <div className="mt-auto flex flex-wrap gap-2">
        <ActionLink href={href}>
          <BookOpen className="size-3.5" />
          {MSG.openClassroom}
        </ActionLink>
        <ActionLink href={`${href}/generate`}>
          <FileText className="size-3.5" />
          {MSG.generatePaper}
        </ActionLink>
      </div>
    </GlassCard>
  );
}

function ActionLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-(--vaasenk-line-sand) bg-white/70 px-3 py-1.5 text-xs font-semibold text-(--vaasenk-deep-maroon) transition-colors hover:border-(--vaasenk-red)/40 hover:bg-white hover:text-(--vaasenk-red) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30"
    >
      {children}
    </Link>
  );
}

// ===========================================================================
// Skeleton
// ===========================================================================

function ClassroomGridSkeleton() {
  return (
    <ul
      role="status"
      aria-live="polite"
      aria-busy
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      <span className="sr-only">{MSG.loadingHint}</span>
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i}>
          <GlassCard padding="md" className="flex h-full flex-col gap-4">
            <div className="flex items-start gap-3">
              <LoadingSkeleton variant="rect" className="size-11" />
              <div className="flex-1 space-y-2">
                <LoadingSkeleton variant="text" className="w-2/3" />
                <LoadingSkeleton variant="text" className="w-1/2" />
              </div>
            </div>
            <LoadingSkeleton variant="text" className="w-3/4" />
            <div className="flex gap-2">
              <LoadingSkeleton variant="rect" className="h-8 w-24" />
              <LoadingSkeleton variant="rect" className="h-8 w-20" />
            </div>
          </GlassCard>
        </li>
      ))}
    </ul>
  );
}
