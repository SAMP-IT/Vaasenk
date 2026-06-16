import type { Metadata } from 'next';
import { AdminComingSoonPage } from '../_coming-soon/coming-soon';

export const metadata: Metadata = {
  title: 'Settings · Vaasenk Admin',
  description: 'Institution profile, branding, AI configuration, notifications. Coming in v2.',
};

/**
 * Sprint 8.2 placeholder. Institution profile fields (name, board, address,
 * contact) are editable today through the setup wizard — the dedicated
 * settings surface that unifies branding, AI configuration, and
 * notification preferences is the v2 work.
 */
export default function AdminSettingsPage() {
  return (
    <AdminComingSoonPage
      eyebrow="Admin · Configuration"
      title="Institution settings"
      description="A consolidated settings surface — profile, branding, AI provider configuration, notification defaults — is coming in v2."
      bullets={[
        'Edit institution name, address, contact details, logo',
        'Choose AI provider per workload (Claude vs GPT-4o)',
        'Set default notification preferences for teachers and students',
        'Manage API keys and webhook integrations',
      ]}
      ctaHref="/admin/setup"
      ctaLabel="Open setup wizard"
      related={
        <p>
          The Institution Setup Wizard already lets you edit core profile fields like
          name, board, address, and contact person. Re-running the wizard loads your
          current values so you can update them piece by piece.
        </p>
      }
    />
  );
}
