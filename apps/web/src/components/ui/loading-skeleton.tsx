import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Shimmering skeleton placeholder, in Vaasenk warm-canvas tones.
 *
 * Use for default → loading state transitions per CLAUDE.md §5
 * (every UI must handle Default / Loading / Empty / Error / Disabled).
 *
 *   <LoadingSkeleton className="h-6 w-32" />
 *   <LoadingSkeleton variant="circle" className="size-12" />
 */
export type LoadingSkeletonProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: 'rect' | 'circle' | 'text';
};

export function LoadingSkeleton({
  className,
  variant = 'rect',
  ...props
}: LoadingSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy
      aria-live="polite"
      className={cn(
        'relative overflow-hidden',
        'bg-(--vaasenk-peach-wash)/60',
        variant === 'circle' && 'rounded-full',
        variant === 'rect' && 'rounded-[14px]',
        variant === 'text' && 'h-4 rounded-md',
        'after:absolute after:inset-0 after:translate-x-[-100%]',
        'after:bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.55)_50%,transparent_100%)]',
        'after:animate-[vaasenk-shimmer_1.6s_ease-in-out_infinite]',
        className,
      )}
      {...props}
    >
      <style>{`
        @keyframes vaasenk-shimmer {
          100% { transform: translateX(100%); }
        }
      `}</style>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
