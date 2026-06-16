'use client';

import { AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageShell } from '@/components/ui/page-shell';

/**
 * Root App Router error boundary.
 *
 * Catches any unhandled error from a Server Component, Client Component, or
 * data-fetching call below the root layout. Next.js requires this file to
 * be a Client Component (the `reset()` callback runs in the browser).
 *
 * Per CLAUDE.md §5: surface errors as a friendly state with a retry option,
 * never a blank page. Uses the existing <EmptyState> Vaasenk primitive so
 * the error surface stays inside the design system.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In production, this hook is the natural place to forward errors to
    // Sentry / Datadog / etc. Keeping it local-only for now.
    // eslint-disable-next-line no-console
    console.error('App error boundary:', error);
  }, [error]);

  return (
    <PageShell>
      <main className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-6 py-16">
        <EmptyState
          title="Something went wrong"
          description={
            error.message ||
            'An unexpected error stopped this page from loading. Try refreshing — if it keeps happening, contact your institution admin.'
          }
          icon={<AlertTriangle className="size-7" />}
          action={{ label: 'Try again', onClick: reset }}
        />
      </main>
      {error.digest ? (
        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-(--vaasenk-subtle)">
          Reference: <span className="font-mono">{error.digest}</span>
        </p>
      ) : null}
    </PageShell>
  );
}
