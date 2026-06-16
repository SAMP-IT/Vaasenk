'use client';

import { Eye, EyeOff, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { VaasenkButton } from '@/components/ui/vaasenk-button';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import { isSafeRedirect } from '@/lib/safe-redirect';
import { createClient as createBrowserSupabase } from '@/lib/supabase/client';

type AuthUser = {
  id: string;
  email: string | null;
  name: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'TEACHER' | 'STUDENT';
  institutionId: string;
  institution: { id: string; name: string; status: string };
};

type LoginResponse = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
};

const ROLE_HOME: Record<AuthUser['role'], string> = {
  SUPER_ADMIN: '/admin',
  ADMIN: '/admin',
  TEACHER: '/teacher',
  STUDENT: '/student',
};

/**
 * Client-side login form.
 *
 * Flow:
 *   1. POST /api/v1/auth/login with the user's credentials.
 *   2. On success, call supabase.auth.setSession({ access_token, refresh_token })
 *      to populate the browser cookies @supabase/ssr expects. Without this,
 *      the next server-component fetch would still see no session.
 *   3. Push to /<role> (or honor ?next= if present and safe).
 */
export function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const nextParam = search?.get('next');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setErrorMessage(null);
    setSubmitting(true);

    try {
      const data = await apiFetch<LoginResponse>('/api/v1/auth/login', {
        method: 'POST',
        body: { email: email.trim(), password },
        unauthenticated: true,
      });

      // Hydrate the @supabase/ssr cookie store with the tokens we just got.
      const supabase = createBrowserSupabase();
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.accessToken,
        refresh_token: data.refreshToken,
      });
      if (sessionError) {
        throw new Error(sessionError.message);
      }

      const target = isSafeRedirect(nextParam) ? nextParam : ROLE_HOME[data.user.role];
      router.replace(target as never);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(
          err.status === 401 ? 'Invalid email or password.' : err.message,
        );
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={submit}
      noValidate
      aria-busy={submitting}
    >
      <div className="space-y-2">
        <label
          htmlFor="login-identifier"
          className="text-sm font-medium text-(--vaasenk-deep-maroon)"
        >
          Email or phone
        </label>
        <input
          id="login-identifier"
          name="email"
          type="text"
          autoComplete="username"
          inputMode="email"
          autoFocus
          placeholder="teacher@school.in"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
          className="w-full rounded-2xl border border-(--vaasenk-line-sand) bg-white/80 px-4 py-3 text-base text-(--vaasenk-ink) placeholder:text-(--vaasenk-subtle) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-70"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <label
            htmlFor="login-password"
            className="text-sm font-medium text-(--vaasenk-deep-maroon)"
          >
            Password
          </label>
          <Link
            href="/forgot-password"
            tabIndex={-1}
            className="text-xs font-medium text-(--vaasenk-red) hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <div className="relative">
          <input
            id="login-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            className="w-full rounded-2xl border border-(--vaasenk-line-sand) bg-white/80 px-4 py-3 pr-12 text-base text-(--vaasenk-ink) placeholder:text-(--vaasenk-subtle) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-70"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={-1}
            className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-(--vaasenk-subtle) hover:bg-(--vaasenk-rose-wash) hover:text-(--vaasenk-deep-maroon)"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      {errorMessage ? (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-4 py-3 text-sm text-(--vaasenk-danger)"
        >
          {errorMessage}
        </p>
      ) : null}

      <VaasenkButton
        type="submit"
        size="lg"
        className="w-full"
        disabled={submitting}
      >
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Signing in…
          </>
        ) : (
          'Sign in'
        )}
      </VaasenkButton>
    </form>
  );
}
