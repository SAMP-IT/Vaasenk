import type { LucideIcon } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';

/**
 * Placeholder body for tabs that aren't built in Sprint 2.3 yet.
 *
 * Renders a glass card with a friendly icon, the target sprint, and a
 * disabled CTA-style preview row so the tab still feels intentional rather
 * than blank. Per CLAUDE.md §5 "Empty — never a blank page".
 */
export function TabPlaceholder({
  icon: Icon,
  title,
  description,
  sprintTag,
  previewCta,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  sprintTag: string;
  previewCta: string;
}) {
  return (
    <GlassCard
      padding="lg"
      className="flex flex-col items-center text-center"
    >
      <div
        aria-hidden
        className="mb-5 grid size-16 place-items-center rounded-2xl bg-(image:--gradient-deep-ai-glow) text-white shadow-[0_18px_50px_rgba(74,5,8,0.16)]"
      >
        <Icon className="size-7" />
      </div>
      <span className="inline-flex items-center rounded-full bg-(--vaasenk-rose-wash) px-3 py-1 text-xs font-semibold uppercase tracking-wider text-(--vaasenk-deep-maroon)">
        {sprintTag}
      </span>
      <h3 className="mt-3 text-xl font-semibold text-(--vaasenk-ink)">
        {title}
      </h3>
      <p className="mt-2 max-w-md text-sm text-(--vaasenk-muted)">
        {description}
      </p>
      <button
        type="button"
        disabled
        aria-disabled="true"
        title="Coming soon"
        className="mt-6 inline-flex min-h-[44px] cursor-not-allowed items-center gap-2 rounded-full border border-(--vaasenk-line-sand) bg-white/60 px-6 py-2 text-sm font-medium text-(--vaasenk-subtle) opacity-80"
      >
        {previewCta}
      </button>
    </GlassCard>
  );
}
