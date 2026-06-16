import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { PageShell } from '@/components/ui/page-shell';

/**
 * Root App Router loading state.
 *
 * Rendered automatically by Next.js while a server-rendered page's data is
 * being fetched. Uses the Vaasenk <LoadingSkeleton> primitive so the
 * skeleton matches the cream-canvas / glass surface aesthetic instead of a
 * stock spinner.
 *
 * Per CLAUDE.md §5: every interactive surface must handle the loading
 * state — this fulfils the boundary-level commitment for the entire web app.
 */
export default function GlobalLoading() {
  return (
    <PageShell bare>
      <main
        className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-16"
        aria-busy
        aria-live="polite"
      >
        <LoadingSkeleton className="h-10 w-1/3" />
        <LoadingSkeleton variant="text" className="w-2/3" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <LoadingSkeleton className="h-32" />
          <LoadingSkeleton className="h-32" />
          <LoadingSkeleton className="h-32" />
          <LoadingSkeleton className="h-32" />
        </div>
        <span className="sr-only">Loading Vaasenk…</span>
      </main>
    </PageShell>
  );
}
