import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Server-side Supabase client for Server Components, Route Handlers, and
 * Server Actions. Reads cookies via Next's async cookies() store.
 *
 * From Server Components the cookie writes are best-effort: Next does not
 * permit a Server Component to mutate cookies, so the setAll callback
 * silently swallows errors. Writes happen successfully in Server Actions
 * and middleware (where the request lifecycle allows it).
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Copy .env.local from the example and restart `next dev`.',
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component — no-op. Refresh happens in
          // middleware where cookie writes are allowed.
        }
      },
    },
  });
}
