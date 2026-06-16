import { Sparkles } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { GlassCard } from './glass-card';
import { VaasenkButton } from './vaasenk-button';

/**
 * Friendly empty-state per CLAUDE.md §5: never a blank page — always a
 * helpful illustration placeholder + message + CTA. Wraps everything in a
 * GlassCard so it stays consistent with the rest of the Vaasenk surface.
 */
export type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  className?: string;
};

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <GlassCard
      padding="lg"
      className={cn('flex flex-col items-center text-center', className)}
    >
      <div
        aria-hidden
        className={cn(
          'mb-4 flex size-16 items-center justify-center',
          'rounded-2xl',
          // Soft peach→blush wash — composed surface, not a named token.
          'bg-[linear-gradient(135deg,#FFE3D2_0%,#FFF0F4_100%)]',
          'text-(--vaasenk-red)',
          'shadow-[inset_0_0_0_1px_rgba(234,215,207,0.6)]',
        )}
      >
        {icon ?? <Sparkles className="size-7" />}
      </div>
      <h3 className="text-lg font-semibold text-(--vaasenk-ink)">
        {title}
      </h3>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-(--vaasenk-muted)">
          {description}
        </p>
      ) : null}
      {action ? (
        <div className="mt-5">
          {action.href ? (
            <a href={action.href}>
              <VaasenkButton size="md">{action.label}</VaasenkButton>
            </a>
          ) : (
            <VaasenkButton size="md" onClick={action.onClick}>
              {action.label}
            </VaasenkButton>
          )}
        </div>
      ) : null}
    </GlassCard>
  );
}
