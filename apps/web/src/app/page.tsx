import Link from 'next/link';
import { PageShell } from '@/components/ui/page-shell';
import { GlassCard } from '@/components/ui/glass-card';
import { VaasenkButton } from '@/components/ui/vaasenk-button';

export default function Home() {
  return (
    <PageShell>
      <div className="mx-auto flex min-h-[80vh] max-w-3xl flex-col items-center justify-center gap-8 px-6 text-center">
        <span className="rounded-full border border-(--vaasenk-line-sand) bg-white/60 px-4 py-1 text-sm font-medium text-(--vaasenk-deep-maroon) backdrop-blur">
          Sprint 0 · Foundation
        </span>
        <h1 className="text-balance text-5xl font-semibold leading-tight tracking-tight text-(--vaasenk-ink) sm:text-6xl">
          Teach more.{' '}
          <span className="bg-linear-to-r from-vaasenk-red via-vaasenk-sunrise-orange to-vaasenk-gold bg-clip-text text-transparent">
            Copy less.
          </span>
        </h1>
        <p className="max-w-xl text-pretty text-lg text-(--vaasenk-muted)">
          Vaasenk is being built. This landing page is a placeholder so you can
          verify the cream canvas, Inter typography, and Vaasenk design tokens
          are wired correctly across the web app.
        </p>
        <GlassCard className="w-full max-w-md text-left">
          <h2 className="mb-2 text-lg font-semibold text-(--vaasenk-ink)">
            Route map
          </h2>
          <ul className="space-y-2 text-sm text-(--vaasenk-muted)">
            <li>
              <Link className="hover:text-(--vaasenk-red)" href="/login">
                → /login (auth layout)
              </Link>
            </li>
            <li>
              <Link className="hover:text-(--vaasenk-red)" href="/register">
                → /register
              </Link>
            </li>
            <li>
              <Link className="hover:text-(--vaasenk-red)" href="/admin">
                → /admin (Admin Royal gradient)
              </Link>
            </li>
            <li>
              <Link className="hover:text-(--vaasenk-red)" href="/teacher">
                → /teacher (Teacher Orange gradient)
              </Link>
            </li>
            <li>
              <Link className="hover:text-(--vaasenk-red)" href="/student">
                → /student (Student Coral gradient)
              </Link>
            </li>
          </ul>
        </GlassCard>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/login">
            <VaasenkButton variant="primary" size="lg">
              Go to login
            </VaasenkButton>
          </Link>
          <Link href="/teacher">
            <VaasenkButton variant="secondary" size="lg">
              Peek at teacher dashboard
            </VaasenkButton>
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
