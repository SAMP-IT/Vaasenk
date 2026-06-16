/**
 * Open-redirect guard for any ?next=... parameter consumed by auth flows
 * or middleware.
 *
 * Allow ONLY same-origin relative paths:
 *   • Must start with a single `/`
 *   • Must NOT start with `//` (protocol-relative URLs would let an
 *     attacker redirect off-site)
 *   • Must NOT contain a scheme (anything before `:` would let
 *     `javascript:` / `data:` URIs through)
 *
 * Anything else is rejected so login + middleware redirects can't be
 * weaponised as open redirectors.
 */
export function isSafeRedirect(
  next: string | null | undefined,
): next is string {
  if (!next) return false;
  if (!next.startsWith('/')) return false;
  if (next.startsWith('//')) return false;
  // Defensive: backslash-prefixed paths get normalised by some browsers
  // to `//host`, so reject those too.
  if (next.startsWith('/\\')) return false;
  return true;
}
