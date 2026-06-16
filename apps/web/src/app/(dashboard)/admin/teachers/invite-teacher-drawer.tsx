'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { CreditCard, Loader2, Send, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useMemo, useState } from 'react';
import { VaasenkButton } from '@/components/ui/vaasenk-button';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import { cn } from '@/lib/utils';

/**
 * Right-side slide-in drawer to invite a teacher.
 *
 * Calls POST /api/v1/users/teachers per the FROZEN API contract in the
 * Sprint 1.6 brief. On 409 (duplicate user or duplicate invite), we surface
 * the message inline above the fields rather than dismissing the drawer.
 */

const MSG = {
  title: 'Invite a teacher',
  subtitle:
    'Send a one-time link by email. The teacher fills in a password when they accept.',
  nameLabel: 'Teacher name',
  namePlaceholder: 'Priya Subramanian',
  nameRequired: 'Required — at least 2 characters.',
  emailLabel: 'Email address',
  emailPlaceholder: 'priya@school.in',
  emailInvalid: 'Enter a valid email address.',
  expiresLabel: 'Link expires after',
  cancel: 'Cancel',
  send: 'Send invite',
  sending: 'Sending…',
  close: 'Close',
  helper:
    'You can revoke this invite from the pending tab if you change your mind.',
} as const;

const EXPIRY_OPTIONS = [
  { value: 1, label: '1 day' },
  { value: 3, label: '3 days' },
  { value: 7, label: '7 days (default)' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
] as const;

type InviteTeacherDto = {
  email: string;
  name: string;
  expiresInDays?: number;
};

type InviteCreatedResponse = {
  invite: {
    id: string;
    email: string;
    role: 'TEACHER';
    token: string;
    expiresAt: string;
  };
};

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function InviteTeacherDrawer({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (email: string) => void;
}) {
  const formId = useId();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<number>(7);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // Sprint 8.2 — when the backend rejects with 402 USER_LIMIT_REACHED, we
  // surface an upgrade CTA instead of the generic error string. Separate
  // state from serverError so the UI can render a richer cell (icon + link).
  const [planLimitHit, setPlanLimitHit] = useState<null | {
    message: string;
    plan?: string;
    limit?: number;
    current?: number;
  }>(null);

  // Reset state every time the drawer opens — avoids "stale data flash" when
  // the user closes after sending one invite and immediately opens it again.
  useEffect(() => {
    if (open) {
      setName('');
      setEmail('');
      setExpiresInDays(7);
      setServerError(null);
      setPlanLimitHit(null);
      setSubmitting(false);
    }
  }, [open]);

  const nameTrimmed = name.trim();
  const emailTrimmed = email.trim();

  // Surface field-level invalidity only after the user has typed something.
  const nameInvalid = name.length > 0 && nameTrimmed.length < 2;
  const emailInvalid = email.length > 0 && !isValidEmail(emailTrimmed);

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (nameTrimmed.length < 2 || nameTrimmed.length > 120) return false;
    if (!isValidEmail(emailTrimmed) || emailTrimmed.length > 254) return false;
    return true;
  }, [submitting, nameTrimmed, emailTrimmed]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    setServerError(null);
    setPlanLimitHit(null);
    setSubmitting(true);
    try {
      const body: InviteTeacherDto = {
        name: nameTrimmed,
        email: emailTrimmed,
        expiresInDays,
      };
      const data = await apiFetch<InviteCreatedResponse>(
        '/api/v1/users/teachers',
        { method: 'POST', body },
      );
      onSuccess(data.invite.email);
    } catch (err) {
      if (err instanceof ApiClientError) {
        // Sprint 8.2 — 402 USER_LIMIT_REACHED gets its own UI cell (upgrade CTA)
        // instead of being dumped as a plain string. Backend's envelope is
        // `{ code, message, details }` (Sprint 8.1 deviation).
        if (err.status === 402 && err.code === 'USER_LIMIT_REACHED') {
          const d = (err.details ?? {}) as Record<string, unknown>;
          setPlanLimitHit({
            message: err.message,
            plan: typeof d.plan === 'string' ? d.plan : undefined,
            limit: typeof d.limit === 'number' ? d.limit : undefined,
            current: typeof d.current === 'number' ? d.current : undefined,
          });
        } else if (err.status === 400 && Array.isArray(err.details)) {
          // class-validator may return an array of strings on 400; flatten.
          const lines = (err.details as unknown[])
            .filter((d): d is string => typeof d === 'string')
            .join(' ');
          setServerError(lines || err.message);
        } else {
          setServerError(err.message);
        }
      } else if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError('Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* Backdrop — Radix handles overlay click-to-close automatically. */}
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-(--vaasenk-deep-maroon)/30 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          )}
        />
        <Dialog.Content
          aria-describedby={`${formId}-helper`}
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col',
            'bg-(image:--gradient-cream-sunrise)',
            'border-l border-(--vaasenk-line-sand)',
            'shadow-[0_32px_90px_rgba(160,0,0,0.18)]',
            'focus:outline-none',
            'data-[state=open]:animate-in data-[state=open]:slide-in-from-right',
            'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right',
          )}
        >
          {/* Header */}
          <header className="flex items-start justify-between gap-3 border-b border-(--vaasenk-line-sand)/60 bg-white/40 px-6 py-5 backdrop-blur">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold text-(--vaasenk-ink)">
                {MSG.title}
              </Dialog.Title>
              <Dialog.Description
                id={`${formId}-helper`}
                className="mt-1 text-sm text-(--vaasenk-muted)"
              >
                {MSG.subtitle}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={MSG.close}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-(--vaasenk-muted) transition-colors hover:bg-(--vaasenk-rose-wash) hover:text-(--vaasenk-red) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30"
              >
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </header>

          {/* Body */}
          <form onSubmit={submit} className="flex flex-1 flex-col overflow-y-auto">
            <div className="flex-1 space-y-5 px-6 py-6">
              {/* Plan-limit hit (Sprint 8.2) — 402 USER_LIMIT_REACHED gets a
                  dedicated upgrade prompt that links to /admin/billing rather
                  than the generic red error string. */}
              {planLimitHit ? (
                <div
                  role="alert"
                  aria-live="polite"
                  className="rounded-2xl border border-(--vaasenk-gold)/50 bg-(--vaasenk-gold)/12 px-4 py-3 text-sm text-(--vaasenk-deep-maroon)"
                >
                  <div className="flex items-start gap-2.5">
                    <CreditCard className="mt-0.5 size-5 shrink-0 text-(--vaasenk-deep-maroon)" />
                    <div className="flex-1">
                      <p className="font-semibold">
                        You&apos;ve reached your plan&apos;s user limit
                      </p>
                      <p className="mt-1 text-(--vaasenk-muted)">
                        {planLimitHit.message}
                      </p>
                      <Link
                        href="/admin/billing"
                        onClick={() => onOpenChange(false)}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-(image:--gradient-brand-flame) px-4 py-1.5 text-xs font-semibold text-white shadow-[0_6px_14px_rgba(160,0,0,0.20)] hover:brightness-105"
                      >
                        Upgrade plan
                      </Link>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Server error */}
              {serverError ? (
                <div
                  role="alert"
                  aria-live="polite"
                  className="rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-4 py-3 text-sm text-(--vaasenk-danger)"
                >
                  {serverError}
                </div>
              ) : null}

              {/* Name */}
              <div className="space-y-2">
                <label
                  htmlFor={`${formId}-name`}
                  className="block text-sm font-medium text-(--vaasenk-deep-maroon)"
                >
                  {MSG.nameLabel}
                  <span className="ml-1 text-(--vaasenk-red)" aria-hidden>
                    *
                  </span>
                </label>
                <input
                  id={`${formId}-name`}
                  type="text"
                  required
                  aria-required="true"
                  aria-invalid={nameInvalid || undefined}
                  aria-describedby={nameInvalid ? `${formId}-name-error` : undefined}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={MSG.namePlaceholder}
                  autoComplete="name"
                  maxLength={120}
                  disabled={submitting}
                  autoFocus
                  className="min-h-[44px] w-full rounded-2xl border border-(--vaasenk-line-sand) bg-white/85 px-4 py-3 text-base text-(--vaasenk-ink) placeholder:text-(--vaasenk-subtle) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-70 aria-invalid:border-(--vaasenk-danger)"
                />
                {nameInvalid ? (
                  <p
                    id={`${formId}-name-error`}
                    className="text-xs text-(--vaasenk-danger)"
                  >
                    {MSG.nameRequired}
                  </p>
                ) : null}
              </div>

              {/* Email */}
              <div className="space-y-2">
                <label
                  htmlFor={`${formId}-email`}
                  className="block text-sm font-medium text-(--vaasenk-deep-maroon)"
                >
                  {MSG.emailLabel}
                  <span className="ml-1 text-(--vaasenk-red)" aria-hidden>
                    *
                  </span>
                </label>
                <input
                  id={`${formId}-email`}
                  type="email"
                  required
                  aria-required="true"
                  aria-invalid={emailInvalid || undefined}
                  aria-describedby={emailInvalid ? `${formId}-email-error` : undefined}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={MSG.emailPlaceholder}
                  autoComplete="email"
                  maxLength={254}
                  inputMode="email"
                  disabled={submitting}
                  className="min-h-[44px] w-full rounded-2xl border border-(--vaasenk-line-sand) bg-white/85 px-4 py-3 text-base text-(--vaasenk-ink) placeholder:text-(--vaasenk-subtle) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-70 aria-invalid:border-(--vaasenk-danger)"
                />
                {emailInvalid ? (
                  <p
                    id={`${formId}-email-error`}
                    className="text-xs text-(--vaasenk-danger)"
                  >
                    {MSG.emailInvalid}
                  </p>
                ) : null}
              </div>

              {/* Expiry */}
              <div className="space-y-2">
                <label
                  htmlFor={`${formId}-expires`}
                  className="block text-sm font-medium text-(--vaasenk-deep-maroon)"
                >
                  {MSG.expiresLabel}
                </label>
                <select
                  id={`${formId}-expires`}
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(Number(e.target.value))}
                  disabled={submitting}
                  className="min-h-[44px] w-full rounded-2xl border border-(--vaasenk-line-sand) bg-white/85 px-4 py-3 text-base text-(--vaasenk-ink) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {EXPIRY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-xs text-(--vaasenk-subtle)">{MSG.helper}</p>
            </div>

            {/* Footer */}
            <footer className="flex items-center justify-end gap-2 border-t border-(--vaasenk-line-sand)/60 bg-white/40 px-6 py-4 backdrop-blur">
              <Dialog.Close asChild>
                <VaasenkButton
                  variant="ghost"
                  size="md"
                  type="button"
                  disabled={submitting}
                >
                  {MSG.cancel}
                </VaasenkButton>
              </Dialog.Close>
              <VaasenkButton
                variant="primary"
                size="md"
                type="submit"
                disabled={!canSubmit}
                aria-disabled={!canSubmit}
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {MSG.sending}
                  </>
                ) : (
                  <>
                    <Send className="size-4" />
                    {MSG.send}
                  </>
                )}
              </VaasenkButton>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
