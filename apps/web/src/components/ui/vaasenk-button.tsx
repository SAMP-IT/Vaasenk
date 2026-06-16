import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Vaasenk primary button.
 *
 * Per CLAUDE.md §4:
 *   • Primary  → Brand Flame gradient + white text
 *   • Rounded full (999px)
 *   • Soft glow shadow on hover
 *   • 44px minimum touch target on mobile
 */
const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center gap-2',
    'font-medium tracking-tight',
    'whitespace-nowrap select-none',
    'rounded-full',
    'transition-[transform,box-shadow,filter] duration-200 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-(--vaasenk-warm-canvas) focus-visible:ring-(--vaasenk-red)',
    'disabled:pointer-events-none disabled:opacity-50',
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ),
  {
    variants: {
      variant: {
        primary: cn(
          'text-white',
          // Brand Flame gradient — see packages/ui/tokens/tailwind.theme.css
          'bg-(image:--gradient-brand-flame)',
          'shadow-[0_8px_24px_rgba(160,0,0,0.18)]',
          'hover:shadow-[0_12px_32px_rgba(160,0,0,0.28)] hover:-translate-y-0.5 hover:brightness-[1.04]',
          'active:translate-y-0 active:brightness-95',
        ),
        secondary: cn(
          'text-(--vaasenk-red)',
          'bg-white/80 backdrop-blur',
          'border border-(--vaasenk-line-sand)',
          'shadow-[0_4px_12px_rgba(160,0,0,0.06)]',
          'hover:bg-white hover:border-(--vaasenk-red) hover:-translate-y-0.5',
        ),
        ghost: cn(
          'text-(--vaasenk-deep-maroon)',
          'hover:bg-(--vaasenk-rose-wash)',
        ),
        gold: cn(
          'text-(--vaasenk-deep-maroon)',
          'bg-linear-to-br from-vaasenk-gold to-[#FFB000]',
          'shadow-[0_8px_24px_rgba(254,202,2,0.28)]',
          'hover:shadow-[0_12px_32px_rgba(254,202,2,0.36)] hover:-translate-y-0.5',
        ),
      },
      size: {
        sm: 'h-9 px-4 text-sm',
        md: 'h-11 px-6 text-base min-h-[44px]',
        lg: 'h-12 px-7 text-base min-h-[48px]',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export type VaasenkButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export const VaasenkButton = React.forwardRef<HTMLButtonElement, VaasenkButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
VaasenkButton.displayName = 'VaasenkButton';

export { buttonVariants };
