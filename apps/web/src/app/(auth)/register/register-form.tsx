'use client';

import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { VaasenkButton } from '@/components/ui/vaasenk-button';
import { ApiClientError, apiFetch } from '@/lib/api-client';

type AcceptResponse = {
  user: {
    id: string;
    name: string;
    email: string | null;
    role: 'SUPER_ADMIN' | 'ADMIN' | 'TEACHER' | 'STUDENT';
  };
};

/**
 * Client-side register / invite-accept form.
 *
 * Reads `?token=<invite>` from the URL. If absent we render an explanatory
 * empty state instead of a half-functional form — registration is
 * invite-gated per CLAUDE.md (only admins provision users).
 */
export function RegisterForm() {
  const router = useRouter();
  const search = useSearchParams();
  const token = search?.get('token') ?? '';
  const presetEmail = search?.get('email') ?? '';

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="space-y-3 rounded-2xl border border-[color:var(--vaasenk-line-sand,#EAD7CF)] bg-white/60 p-5 text-sm">
        <p className="font-medium text-[color:var(--vaasenk-ink)]">
          Registration requires an invite.
        </p>
        <p className="text-[color:var(--vaasenk-muted)]">
          Vaasenk accounts are provisioned by your institution admin. Open the
          invite link they sent you — it includes a one-time token.
        </p>
        <Link
          className="inline-block text-sm font-medium text-[color:var(--vaasenk-red)] hover:underline"
          href="/login"
        >
          ← Back to sign in
        </Link>
      </div>
    );
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setErrorMessage(null);

    if (password !== confirm) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters.');
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch<AcceptResponse>('/api/v1/auth/invite/accept', {
        method: 'POST',
        body: { token, name, password },
        unauthenticated: true,
      });
      router.replace('/login?registered=1' as never);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit} noValidate aria-busy={submitting}>
      <div className="space-y-2">
        <label
          htmlFor="register-name"
          className="text-sm font-medium text-[color:var(--vaasenk-deep-maroon)]"
        >
          Full name
        </label>
        <input
          id="register-name"
          name="name"
          type="text"
          autoFocus
          autoComplete="name"
          placeholder="Priya Iyer"
          required
          minLength={2}
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={submitting}
          className="w-full rounded-2xl border border-[color:var(--vaasenk-line-sand,#EAD7CF)] bg-white/80 px-4 py-3 text-base text-[color:var(--vaasenk-ink)] placeholder:text-[color:var(--vaasenk-subtle,#A88479)] focus:border-[color:var(--vaasenk-red)] focus:outline-none focus:ring-2 focus:ring-[color:var(--vaasenk-red)]/30 disabled:cursor-not-allowed disabled:opacity-70"
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="register-email"
          className="text-sm font-medium text-[color:var(--vaasenk-deep-maroon)]"
        >
          Email
        </label>
        <input
          id="register-email"
          name="email"
          type="email"
          value={presetEmail}
          readOnly
          disabled
          placeholder="from your invite"
          className="w-full cursor-not-allowed rounded-2xl border border-[color:var(--vaasenk-line-sand,#EAD7CF)] bg-white/40 px-4 py-3 text-base text-[color:var(--vaasenk-muted)] placeholder:text-[color:var(--vaasenk-subtle,#A88479)]"
        />
        <p className="text-xs text-[color:var(--vaasenk-subtle,#A88479)]">
          Locked to the address your invite was issued to.
        </p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="register-password"
          className="text-sm font-medium text-[color:var(--vaasenk-deep-maroon)]"
        >
          Password
        </label>
        <input
          id="register-password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          required
          minLength={8}
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
          className="w-full rounded-2xl border border-[color:var(--vaasenk-line-sand,#EAD7CF)] bg-white/80 px-4 py-3 text-base text-[color:var(--vaasenk-ink)] placeholder:text-[color:var(--vaasenk-subtle,#A88479)] focus:border-[color:var(--vaasenk-red)] focus:outline-none focus:ring-2 focus:ring-[color:var(--vaasenk-red)]/30 disabled:cursor-not-allowed disabled:opacity-70"
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="register-password-confirm"
          className="text-sm font-medium text-[color:var(--vaasenk-deep-maroon)]"
        >
          Confirm password
        </label>
        <input
          id="register-password-confirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat your password"
          required
          minLength={8}
          maxLength={128}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={submitting}
          className="w-full rounded-2xl border border-[color:var(--vaasenk-line-sand,#EAD7CF)] bg-white/80 px-4 py-3 text-base text-[color:var(--vaasenk-ink)] placeholder:text-[color:var(--vaasenk-subtle,#A88479)] focus:border-[color:var(--vaasenk-red)] focus:outline-none focus:ring-2 focus:ring-[color:var(--vaasenk-red)]/30 disabled:cursor-not-allowed disabled:opacity-70"
        />
      </div>

      {errorMessage ? (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-2xl border border-[color:var(--vaasenk-danger,#DC2626)]/30 bg-[color:var(--vaasenk-danger,#DC2626)]/10 px-4 py-3 text-sm text-[color:var(--vaasenk-danger,#DC2626)]"
        >
          {errorMessage}
        </p>
      ) : null}

      <VaasenkButton type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Creating account…
          </>
        ) : (
          'Create account'
        )}
      </VaasenkButton>
    </form>
  );
}
