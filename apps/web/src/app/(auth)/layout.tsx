import Link from 'next/link';
import { PageShell } from '@/components/ui/page-shell';

/**
 * Auth-route layout. No sidebar, no topbar — just a centered card on the
 * Cream Sunrise background per the design direction in
 * design-docs/README.md.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageShell>
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between px-6 py-6 sm:px-10">
          <Link href="/" className="flex items-center gap-2 group">
            <span
              aria-hidden
              className="grid size-9 place-items-center rounded-xl bg-linear-to-br from-vaasenk-red to-vaasenk-sunrise-orange text-white font-semibold shadow-[0_8px_24px_rgba(160,0,0,0.18)] group-hover:shadow-[0_12px_32px_rgba(160,0,0,0.28)] transition-shadow"
            >
              V
            </span>
            <span className="text-lg font-semibold tracking-tight text-(--vaasenk-ink)">
              Vaasenk
            </span>
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-(--vaasenk-muted) hover:text-(--vaasenk-red)"
          >
            ← Home
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center px-6 pb-16">
          <div className="w-full max-w-md">{children}</div>
        </main>

        <footer className="px-6 pb-8 text-center text-xs text-(--vaasenk-subtle)">
          Sprint 0 placeholder · Vaasenk
        </footer>
      </div>
    </PageShell>
  );
}
