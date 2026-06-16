import type { Metadata } from 'next';
import { SetupWizard } from './setup-wizard';

/**
 * Admin Institution Setup Wizard — Sprint 1 / Playbook Prompt 7.
 *
 * The wizard itself is a Client Component (interactive multi-step form
 * with local state). This page is a thin Server Component that asserts
 * the route exists and lets the (dashboard) layout chrome paint around
 * it. The wizard does its own auth/me + setup-status fetches client-side
 * via apiFetch so it can hydrate with the Supabase session cookies that
 * the @supabase/ssr middleware just refreshed.
 *
 * We deliberately keep the page boundary thin here:
 *   • Sprint 1 doesn't yet have a server-side apiFetch helper.
 *   • The wizard's data is short-lived UI state, not cacheable HTML.
 *   • Moving the initial fetch server-side would require duplicating the
 *     bearer-token plumbing that lib/api-client.ts already owns.
 * When a server apiFetch lands (Sprint 2+) we can hoist the bootstrap
 * fetch up here for a no-flash first paint.
 */
export const metadata: Metadata = { title: 'Institution Setup · Vaasenk' };

export default function AdminSetupPage() {
  return <SetupWizard />;
}
