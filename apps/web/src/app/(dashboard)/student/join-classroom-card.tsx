'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, UserPlus, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { VaasenkButton } from '@/components/ui/vaasenk-button';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import { cn } from '@/lib/utils';

/**
 * Quick-action tile + Radix Dialog for the student "Join a classroom"
 * flow. Posts to `/api/v1/classrooms/join` and surfaces the three error
 * paths the backend documents (404 NOT_FOUND, 410 GONE/expired, generic).
 *
 * The visual tile uses GlassCard styling for consistency with the other
 * two quick-actions (Bookmarks, Downloads) — see student-dashboard-client.tsx.
 */

type JoinResponse = {
  classroom: { id: string; name: string };
};

const MSG = {
  tileTitle: 'Join a classroom',
  tileDescription: 'Have an invite code from your teacher? Enter it here.',
  dialogTitle: 'Join a classroom',
  dialogDescription:
    'Ask your teacher for the 6-character invite code, then enter it below.',
  fieldLabel: 'Invite code',
  fieldHelper: 'Codes are 6 characters — letters and numbers only.',
  cancel: 'Cancel',
  submit: 'Join classroom',
  submitting: 'Joining…',
  close: 'Close',
  errorNotFound:
    'That code didn’t match any active classroom. Double-check it with your teacher.',
  errorExpired:
    'That invite code has expired. Ask your teacher for a fresh one.',
  errorGeneric: 'Couldn’t join right now. Please try again.',
  success: (name: string) => `Joined ${name}!`,
} as const;

const CODE_LENGTH = 6;
// Backend allows alphanumeric uppercase — strip everything else on input.
const CODE_PATTERN = /[^A-Z0-9]/g;

export function JoinClassroomCard({
  onJoined,
}: {
  /** Called with the joined classroom's display name. Parent should refetch. */
  onJoined: (classroomName: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={MSG.tileTitle}
        className={cn(
          // Match GlassCard surface (CLAUDE.md §4) but as a button so the
          // whole tile is keyboard + click activatable.
          'group relative flex w-full flex-col items-start gap-3 rounded-[24px] p-6 text-left',
          'border border-(--vaasenk-line-sand) bg-white/72 backdrop-blur-[20px]',
          'shadow-[0_8px_24px_rgba(160,0,0,0.08)]',
          'transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(74,5,8,0.12)] hover:border-(--vaasenk-red)/40',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red) focus-visible:ring-offset-2 focus-visible:ring-offset-(--vaasenk-warm-canvas)',
          'min-h-[44px]',
        )}
      >
        <span
          aria-hidden
          className="grid size-11 place-items-center rounded-xl bg-(image:--gradient-brand-flame) text-white shadow-[0_8px_24px_rgba(160,0,0,0.18)]"
        >
          <UserPlus className="size-5" />
        </span>
        <h3 className="text-lg font-semibold text-(--vaasenk-ink)">
          {MSG.tileTitle}
        </h3>
        <p className="text-sm text-(--vaasenk-muted)">{MSG.tileDescription}</p>
      </button>

      {open ? (
        <JoinClassroomDialog
          open={open}
          onOpenChange={setOpen}
          onJoined={(name) => {
            setOpen(false);
            onJoined(name);
          }}
        />
      ) : null}
    </>
  );
}

function JoinClassroomDialog({
  open,
  onOpenChange,
  onJoined,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJoined: (classroomName: string) => void;
}) {
  const formId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on every open so a previous error / stale code doesn't linger.
  useEffect(() => {
    if (!open) return undefined;
    setCode('');
    setError(null);
    setSubmitting(false);
    // Defer focus until after Radix has mounted the dialog so we don't
    // race the auto-focus trap.
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  const trimmed = code.replace(CODE_PATTERN, '');
  const ready = trimmed.length === CODE_LENGTH && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await apiFetch<JoinResponse>('/api/v1/classrooms/join', {
        method: 'POST',
        body: { inviteCode: trimmed },
      });
      onJoined(result.classroom.name);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 404) {
          setError(MSG.errorNotFound);
        } else if (err.status === 410) {
          setError(MSG.errorExpired);
        } else {
          setError(err.message || MSG.errorGeneric);
        }
      } else {
        setError(err instanceof Error ? err.message : MSG.errorGeneric);
      }
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-(--vaasenk-deep-maroon)/35 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          )}
        />
        <Dialog.Content
          aria-describedby={`${formId}-helper`}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2',
            'flex flex-col gap-5 rounded-[28px] p-6',
            'bg-(image:--gradient-cream-sunrise)',
            'border border-(--vaasenk-line-sand)',
            'shadow-[0_32px_90px_rgba(160,0,0,0.18)]',
            'focus:outline-none',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          )}
        >
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold text-(--vaasenk-ink)">
                {MSG.dialogTitle}
              </Dialog.Title>
              <Dialog.Description
                id={`${formId}-helper`}
                className="mt-1 text-sm text-(--vaasenk-muted)"
              >
                {MSG.dialogDescription}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={MSG.close}
                disabled={submitting}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-(--vaasenk-muted) transition-colors hover:bg-(--vaasenk-rose-wash) hover:text-(--vaasenk-red) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </header>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label
                htmlFor={`${formId}-code`}
                className="text-sm font-medium text-(--vaasenk-deep-maroon)"
              >
                {MSG.fieldLabel}
              </label>
              <input
                ref={inputRef}
                id={`${formId}-code`}
                type="text"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                required
                aria-required="true"
                aria-invalid={error ? true : undefined}
                aria-describedby={`${formId}-helper-text${error ? ` ${formId}-error` : ''}`}
                value={code}
                onChange={(e) => {
                  // Uppercase + strip non-alphanumeric. Cap at CODE_LENGTH so
                  // a paste of "abc-123-456" still lands cleanly.
                  const next = e.target.value
                    .toUpperCase()
                    .replace(CODE_PATTERN, '')
                    .slice(0, CODE_LENGTH);
                  setCode(next);
                  if (error) setError(null);
                }}
                maxLength={CODE_LENGTH}
                placeholder="ABC123"
                disabled={submitting}
                className={cn(
                  'min-h-[56px] w-full rounded-2xl border px-4 py-3 text-center font-mono text-2xl font-semibold tracking-[0.5em] uppercase',
                  'text-(--vaasenk-ink) placeholder:text-(--vaasenk-subtle)/60',
                  'bg-white/85 backdrop-blur-sm',
                  'focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30',
                  'disabled:cursor-not-allowed disabled:opacity-70',
                  error
                    ? 'border-(--vaasenk-danger) focus:border-(--vaasenk-danger)'
                    : 'border-(--vaasenk-line-sand) focus:border-(--vaasenk-red)',
                )}
              />
              <p
                id={`${formId}-helper-text`}
                className="text-xs text-(--vaasenk-subtle)"
              >
                {MSG.fieldHelper}
              </p>
              {error ? (
                <p
                  id={`${formId}-error`}
                  role="alert"
                  aria-live="polite"
                  className="rounded-xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-3 py-2 text-sm font-medium text-(--vaasenk-danger)"
                >
                  {error}
                </p>
              ) : null}
            </div>

            <footer className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Dialog.Close asChild>
                <VaasenkButton
                  type="button"
                  variant="ghost"
                  size="md"
                  disabled={submitting}
                >
                  {MSG.cancel}
                </VaasenkButton>
              </Dialog.Close>
              <VaasenkButton
                type="submit"
                variant="primary"
                size="md"
                disabled={!ready}
                aria-disabled={!ready}
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {MSG.submitting}
                  </>
                ) : (
                  <>
                    <UserPlus className="size-4" aria-hidden />
                    {MSG.submit}
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
