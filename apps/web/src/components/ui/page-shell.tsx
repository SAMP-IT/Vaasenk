import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Page background wrapper using the Cream Sunrise gradient (CLAUDE.md §4).
 *
 * Renders a full-viewport surface composed of:
 *   • A linear gradient cream → peach → blush
 *   • A soft gold radial accent in the upper-left
 *   • Two large blurred floating blobs (one red, one orange) to evoke the
 *     "motion-inspired details" called out in design-docs/README.md
 *
 * Children render inside a relative wrapper above the decorative layers.
 */
export type PageShellProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Disable the floating blob decorations (use on dense list/table pages). */
  bare?: boolean;
};

export const PageShell = React.forwardRef<HTMLDivElement, PageShellProps>(
  ({ className, children, bare = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'relative isolate min-h-screen overflow-hidden',
          'text-(--vaasenk-ink)',
          // Cream Sunrise gradient — see packages/ui/tokens (CLAUDE.md §4).
          'bg-(image:--gradient-cream-sunrise)',
          className,
        )}
        {...props}
      >
        {!bare ? (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute -top-32 -left-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(160,0,0,0.18)_0%,transparent_60%)] blur-3xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -right-40 top-40 h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle,rgba(255,122,26,0.18)_0%,transparent_60%)] blur-3xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-48 left-1/3 h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,rgba(254,202,2,0.18)_0%,transparent_65%)] blur-3xl"
            />
          </>
        ) : null}
        <div className="relative z-10">{children}</div>
      </div>
    );
  },
);
PageShell.displayName = 'PageShell';
