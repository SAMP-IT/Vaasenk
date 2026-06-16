import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Glassmorphism card panel, per CLAUDE.md §4:
 *   • bg-white/72 + backdrop-blur 20px
 *   • Sand-coloured 1px border
 *   • 24px radius
 *   • Soft red shadow
 *
 * Use for content panels sitting on a Cream Sunrise background. Avoid
 * stacking glass cards on glass cards — the layering reads as muddy.
 */
export type GlassCardProps = React.HTMLAttributes<HTMLDivElement> & {
  as?: keyof React.JSX.IntrinsicElements;
  padding?: 'sm' | 'md' | 'lg' | 'none';
};

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, as: As = 'div', padding = 'md', children, ...props }, ref) => {
    const Comp = As as React.ElementType;
    const paddingClass =
      padding === 'none'
        ? ''
        : padding === 'sm'
          ? 'p-4'
          : padding === 'lg'
            ? 'p-8'
            : 'p-6';

    return (
      <Comp
        ref={ref}
        className={cn(
          'relative rounded-[24px]',
          'border border-(--vaasenk-line-sand)',
          'bg-white/72 backdrop-blur-[20px]',
          // Soft red glow — composed alpha shadow, not a named token.
          'shadow-[0_8px_24px_rgba(160,0,0,0.08)]',
          paddingClass,
          className,
        )}
        {...props}
      >
        {children}
      </Comp>
    );
  },
);
GlassCard.displayName = 'GlassCard';
