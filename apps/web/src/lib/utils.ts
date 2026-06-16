import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Compose Tailwind classes with conflict resolution.
 *
 *   cn("p-4 bg-vaasenk-cream-card", isActive && "p-6")
 *   // → "bg-vaasenk-cream-card p-6"
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
