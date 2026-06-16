import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client. Use inside React client components only.
 * Persists the session in document cookies via @supabase/ssr.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Copy .env.local from the example and restart `next dev`.',
    );
  }
  return createBrowserClient(url, anonKey);
}
