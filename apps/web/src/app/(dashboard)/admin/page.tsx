import { redirect } from 'next/navigation';

/**
 * Sprint 8.2 — `/admin` is now an alias for `/admin/dashboard`. The Sprint 0
 * placeholder dashboard that used to live here is replaced by the real
 * dashboard at `/admin/dashboard` (Playbook Prompt 28), so admins landing
 * on the role root jump straight to the new home.
 */
export default function AdminRedirectPage(): never {
  redirect('/admin/dashboard');
}
