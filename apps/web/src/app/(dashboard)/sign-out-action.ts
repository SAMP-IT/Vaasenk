'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Server Action that signs the user out properly:
 *   1. Calls supabase.auth.signOut() on the server-side client so the
 *      @supabase/ssr cookie pair (sb-access-token + sb-refresh-token) is
 *      cleared from the browser.
 *   2. Redirects to /login.
 *
 * Replaces the prior `<Link href="/login">` in the dashboard topbar, which
 * looked like a sign-out but left the session cookies intact — a serious
 * security-perception bug.
 */
export async function signOutAction(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
