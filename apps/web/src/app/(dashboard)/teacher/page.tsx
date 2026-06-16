import { Camera, FileQuestion, Sparkles, Upload } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { GlassCard } from '@/components/ui/glass-card';
import { VaasenkButton } from '@/components/ui/vaasenk-button';

export const metadata = { title: 'Teacher' };

export default function TeacherDashboardPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      {/* Teacher Orange gradient hero */}
      <section className="relative overflow-hidden rounded-[28px] bg-(image:--gradient-teacher-orange) p-8 text-white shadow-[0_24px_60px_rgba(255,122,26,0.24)]">
        <div className="relative z-10 max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-wider text-white/80">
            Teacher Dashboard
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Good to see you back
          </h1>
          <p className="mt-2 text-white/85">
            Snap your board, share notes, and let AI draft your next question
            paper. Three jobs that should take less than five minutes.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <VaasenkButton variant="gold">
              <Camera className="size-4" />
              Upload board notes
            </VaasenkButton>
            <VaasenkButton variant="secondary" className="bg-white! text-(--vaasenk-red)!">
              <FileQuestion className="size-4" />
              Generate question paper
            </VaasenkButton>
          </div>
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

      {/* Action-first quick tiles */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          {
            title: 'Upload board photo',
            description: 'Snap → tag → publish to a classroom in seconds.',
            icon: Upload,
          },
          {
            title: 'AI question paper',
            description: 'Pick portion + pattern. AI drafts a structured paper.',
            icon: FileQuestion,
          },
          {
            title: 'Syllabus chatbot',
            description: 'Ask your syllabus — get citations, not hallucinations.',
            icon: Sparkles,
          },
        ].map(({ title, description, icon: Icon }) => (
          <GlassCard key={title} padding="md" className="flex flex-col gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-(--vaasenk-peach-wash) text-(--vaasenk-red)">
              <Icon className="size-5" />
            </div>
            <h3 className="text-lg font-semibold text-(--vaasenk-ink)">
              {title}
            </h3>
            <p className="text-sm text-(--vaasenk-muted)">
              {description}
            </p>
            <span className="text-xs font-medium text-(--vaasenk-subtle)">
              Available in Sprint 2+
            </span>
          </GlassCard>
        ))}
      </section>

      <EmptyState
        title="No classrooms yet"
        description="An admin needs to assign you to a classroom — once they do, your notes and AI tools show up here."
        icon={<Sparkles className="size-7" />}
        action={{ label: 'View getting-started guide', href: '#' }}
      />
    </div>
  );
}
