/**
 * Vaasenk Mobile — Theme tokens entry point.
 *
 * Re-exports the platform-neutral `vaasenkNative` token object from
 * `@vaasenk/ui/tokens` so screens import a single, app-local module rather
 * than reaching across workspaces. This indirection also lets us layer
 * mobile-specific helpers (gradient prop spreads, role accent lookups)
 * without polluting the shared design package.
 *
 * Per CLAUDE.md §4: ALL colors, spacing, radii, and gradients MUST come
 * from here (or directly from `@vaasenk/ui/tokens`). Never hardcode.
 */

import { vaasenkNative, type VaasenkNativeRole } from '@vaasenk/ui/tokens';

export { vaasenkNative };
export type { VaasenkNativeRole };

/**
 * Spread props for `<LinearGradient />` (from `expo-linear-gradient`)
 * for a named Vaasenk gradient — keeps screens free of token plumbing.
 *
 * Usage:
 *   <LinearGradient {...gradientProps('heroSunrise')} style={...}>
 */
export function gradientProps(name: keyof typeof vaasenkNative.gradients) {
  const g = vaasenkNative.gradients[name];
  return {
    // RN LinearGradient expects mutable string[] / number[] — the tokens
    // are `readonly` tuples. Cast at the boundary; values are identical.
    colors: g.colors as unknown as readonly [string, string, ...string[]],
    locations: g.locations as unknown as readonly [number, number, ...number[]],
    start: g.start,
    end: g.end,
  };
}

/**
 * Role -> gradient name. Used by SplashScreen + tab headers to pick the
 * right hero gradient without sprinkling switch statements through
 * navigation code.
 */
export const roleGradient: Record<VaasenkNativeRole, keyof typeof vaasenkNative.gradients> = {
  admin: 'redGlow',
  teacher: 'goldCard',
  student: 'studentCandy',
};
