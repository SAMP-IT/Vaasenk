import Link from 'next/link';
import { Suspense } from 'react';
import { GlassCard } from '@/components/ui/glass-card';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <GlassCard padding="lg">
      <div className="mb-6">
        <span
          aria-hidden
          className="bg-linear-to-r from-vaasenk-red via-vaasenk-sunrise-orange to-vaasenk-gold bg-clip-text text-3xl font-bold tracking-tight text-transparent"
        >
          Vaasenk
        </span>
      </div>

      <h1 className="text-3xl font-semibold tracking-tight text-(--vaasenk-ink)">
        Welcome back
      </h1>
      <p className="mt-2 text-sm text-(--vaasenk-muted)">
        Sign in with the email or phone number your institution registered.
      </p>

      <div className="mt-6">
        {/* LoginForm reads ?next=... via useSearchParams, so it must be
            wrapped in Suspense for the static prerender to succeed. */}
        <Suspense fallback={<LoadingSkeleton className="h-64 w-full" />}>
          <LoginForm />
        </Suspense>
      </div>

      <div className="mt-6 space-y-2 text-center text-sm">
        <p className="text-(--vaasenk-muted)">
          Don&apos;t have an account?{' '}
          <span className="font-medium text-(--vaasenk-deep-maroon)">
            Contact your institution admin
          </span>{' '}
          for an invite.
        </p>
        <p className="text-(--vaasenk-subtle)">
          Have an invite link?{' '}
          <Link
            className="font-medium text-(--vaasenk-red) hover:underline"
            href="/register"
          >
            Accept it here
          </Link>
        </p>
      </div>
    </GlassCard>
  );
}
