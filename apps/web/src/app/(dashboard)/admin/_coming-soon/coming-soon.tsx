import type { ReactNode } from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { VaasenkButton } from '@/components/ui/vaasenk-button';

/**
 * Sprint 8.2 — shared "Coming in v2" placeholder for admin routes that are
 * intentionally not built in this sprint (Classes, Students, Sample Papers
 * admin view, Classrooms admin view, Settings). The sidebar links live so
 * navigation isn't broken; this surface tells the admin what's coming and
 * (where applicable) points them at the existing tool that already does
 * part of the job.
 *
 * Per CLAUDE.md §4 — admin pages get the Admin Royal gradient strip from
 * the parent admin/layout.tsx; this page lays out a single glass card on
 * the cream-sunrise canvas with a friendly "v2" badge.
 */
export function AdminComingSoonPage({
  eyebrow,
  title,
  description,
  ctaHref,
  ctaLabel,
  bullets,
  related,
}: {
  eyebrow: string;
  title: string;
  description: string;
  ctaHref?: string;
  ctaLabel?: string;
  bullets?: string[];
  related?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {/* Admin Royal mini-hero — keeps the role personality without overshadowing
          the "this is a placeholder" message. */}
      <section className="relative overflow-hidden rounded-[24px] bg-(image:--gradient-admin-royal) p-8 text-white shadow-[0_20px_50px_rgba(160,0,0,0.22)]">
        <div className="relative z-10 max-w-xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur">
            <Sparkles className="size-3.5" />
            Coming in v2
          </span>
          <p className="mt-4 text-sm font-medium uppercase tracking-wider text-white/75">
            {eyebrow}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-white/85">{description}</p>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-12 size-56 rounded-full bg-white/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 left-1/2 size-48 rounded-full bg-[#FFB000]/30 blur-3xl"
        />
      </section>

      {bullets && bullets.length > 0 ? (
        <GlassCard padding="lg">
          <h2 className="text-base font-semibold text-(--vaasenk-ink)">
            What we&apos;re planning
          </h2>
          <ul className="mt-4 space-y-2.5">
            {bullets.map((b) => (
              <li
                key={b}
                className="flex items-start gap-3 text-sm text-(--vaasenk-deep-maroon)"
              >
                <span
                  aria-hidden
                  className="mt-1.5 inline-block size-1.5 shrink-0 rounded-full bg-(--vaasenk-red)"
                />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </GlassCard>
      ) : null}

      {related ? (
        <GlassCard padding="lg">
          <h2 className="text-base font-semibold text-(--vaasenk-ink)">
            In the meantime
          </h2>
          <div className="mt-3 text-sm text-(--vaasenk-muted)">{related}</div>
        </GlassCard>
      ) : null}

      {ctaHref && ctaLabel ? (
        <div className="flex">
          <Link href={ctaHref}>
            <VaasenkButton variant="secondary" size="md">
              {ctaLabel}
            </VaasenkButton>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
