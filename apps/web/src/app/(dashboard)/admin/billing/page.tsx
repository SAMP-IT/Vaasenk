import type { Metadata } from 'next';
import { BillingClient } from './billing-client';

/**
 * Admin → Billing (Sprint 8.2 / Playbook Prompt 28).
 *
 * Renders the current-plan summary + plan picker. Billing is MANUALLY
 * TRACKED in Sprint 8 — there is no payment gateway integration. Picking
 * a plan PATCHes /institutions/:id/subscription with the new plan; the
 * backend applies plan-default caps but never resets observed usage
 * (Sprint 8.1 contract).
 *
 * The dashboard chrome (sidebar + topbar) is provided by
 * apps/web/src/app/(dashboard)/layout.tsx; the 4px Admin Royal accent
 * strip is rendered by apps/web/src/app/(dashboard)/admin/layout.tsx.
 */
export const metadata: Metadata = {
  title: 'Billing · Vaasenk Admin',
  description:
    'View current plan, change tier, see usage against caps. Manual billing tracking — no payment gateway yet.',
};

export default function AdminBillingPage() {
  return <BillingClient />;
}
