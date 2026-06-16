import Link from 'next/link';
import { Suspense } from 'react';
import { GlassCard } from '@/components/ui/glass-card';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { RegisterForm } from './register-form';

export const metadata = { title: 'Create account' };

export default function RegisterPage() {
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
        Accept your invitation
      </h1>
      <p className="mt-2 text-sm text-(--vaasenk-muted)">
        Set a password to complete the invite your institution admin sent you.
      </p>

      <div className="mt-6">
        {/* RegisterForm reads ?token=... via useSearchParams, so it must be
            wrapped in Suspense for the static prerender to succeed. */}
        <Suspense fallback={<LoadingSkeleton className="h-72 w-full" />}>
          <RegisterForm />
        </Suspense>
      </div>

      <p className="mt-6 text-center text-sm text-(--vaasenk-muted)">
        Already have an account?{' '}
        <Link
          className="font-medium text-(--vaasenk-red) hover:underline"
          href="/login"
        >
          Sign in
        </Link>
      </p>
    </GlassCard>
  );
}
