'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  CloudUpload,
  CreditCard,
  FileText,
  Info,
  Loader2,
  Lock,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { VaasenkButton } from '@/components/ui/vaasenk-button';
import { ApiClientError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { flattenValidationDetails, xhrUpload } from '@/lib/xhr-upload';
import {
  ALLOWED_EXT_HINT,
  ALLOWED_MIME,
  COMMON_BOARDS,
  formatBytes,
  LANGUAGE_OPTIONS,
  MAX_FILE_BYTES,
  type SyllabusView,
} from './syllabus-types';

/**
 * Upload-or-replace drawer.
 *
 * One Radix Dialog component used by two flows:
 *   - `mode="create"` → POST /syllabus     (multipart, creates a new doc)
 *   - `mode="replace"` → PATCH /syllabus/:id (multipart, bumps version,
 *     archives the previous active row)
 *
 * The "Class & Subject" rows are intentionally disabled — the backend doesn't
 * yet expose listable endpoints for taxonomies (created during the admin
 * setup wizard but not yet listable; Sprint 3.4 follow-up). The fields render
 * with helper copy so admins know it's coming.
 */

const MSG = {
  createTitle: 'Upload syllabus',
  createSubtitle:
    'Add a PDF syllabus to your library. We extract text, chunk it, and index for AI features.',
  replaceTitle: 'Replace syllabus version',
  replaceSubtitle:
    'Upload a new PDF to bump the version. The current version is archived but kept for reference.',
  replaceCallout:
    'Replacing creates a new version. The current version will be archived but kept for reference.',
  close: 'Close',
  drop: 'Drop your PDF here',
  browse: 'or click to browse',
  hint: 'PDF · up to 25 MB',
  remove: 'Remove',
  nameLabel: 'Syllabus name',
  namePlaceholder: 'Samacheer Kalvi Class 10 Mathematics 2025',
  nameRequired: 'Required — at least 2 characters.',
  boardLabel: 'Board / curriculum',
  boardPlaceholder: 'e.g. Samacheer Kalvi',
  boardHelper: 'Free text — pick from suggestions or type your own.',
  yearLabel: 'Year (optional)',
  yearPlaceholder: 'e.g. 2025',
  languageLabel: 'Language',
  versionLabel: 'Version (optional)',
  versionPlaceholder: 'v1',
  classLabel: 'Class',
  subjectLabel: 'Subject',
  taxonomyPending:
    'Class & subject taxonomy picker arrives in Sprint 3.4 — backend list endpoints pending.',
  cancel: 'Cancel',
  uploadCreate: 'Upload syllabus',
  uploadReplace: 'Upload new version',
  uploading: 'Uploading…',
  progress: (pct: number) => `Uploading ${pct}%`,
  fileTooLarge: 'File too large. Maximum size is 25 MB.',
  unsupportedType: 'Only PDF files are supported.',
} as const;

type UploadMode =
  | { kind: 'create' }
  | { kind: 'replace'; target: SyllabusView };

export function UploadSyllabusDrawer({
  open,
  onOpenChange,
  mode,
  onSuccess,
  apiBaseUrl,
  accessToken,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: UploadMode;
  onSuccess: (syllabus: SyllabusView, mode: UploadMode['kind']) => void;
  apiBaseUrl: string;
  accessToken: string | null;
}) {
  const formId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const isReplace = mode.kind === 'replace';
  const initial = isReplace ? mode.target : null;

  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [boardType, setBoardType] = useState('');
  const [year, setYear] = useState('');
  const [language, setLanguage] = useState('English');
  const [version, setVersion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);
  // Sprint 8.2 — 402 STORAGE_LIMIT_REACHED gets a rich upgrade prompt instead
  // of a generic red error. Separate state from serverError so the UI shows
  // a CreditCard icon + link to /admin/billing.
  const [planLimitHit, setPlanLimitHit] = useState<null | {
    message: string;
    plan?: string;
    limit?: number;
    current?: number;
  }>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Reset / seed on every open. For replace mode, prefill with the target's
  // metadata so the admin only needs to swap the file.
  useEffect(() => {
    if (!open) return;
    setFile(null);
    setSubmitting(false);
    setProgress(0);
    setServerError(null);
    setPlanLimitHit(null);
    setFileError(null);
    setIsDragOver(false);
    if (isReplace && initial) {
      setName(initial.name);
      setBoardType(initial.boardType ?? '');
      setLanguage(initial.language ?? 'English');
      setVersion(initial.version ?? '');
      setYear('');
    } else {
      setName('');
      setBoardType('');
      setLanguage('English');
      setVersion('');
      setYear('');
    }
  }, [open, isReplace, initial]);

  // Cancel in-flight upload on unmount so we don't fight a closing portal.
  useEffect(() => {
    return () => {
      if (xhrRef.current) {
        xhrRef.current.abort();
        xhrRef.current = null;
      }
    };
  }, []);

  const handleFileSelect = (next: File | null) => {
    setFileError(null);
    setServerError(null);
    setPlanLimitHit(null);
    if (!next) {
      setFile(null);
      return;
    }
    if (next.size > MAX_FILE_BYTES) {
      setFileError(MSG.fileTooLarge);
      return;
    }
    // Some browsers send empty `type` for .pdf — also accept based on
    // extension. The backend re-validates via Multer's fileFilter so this
    // is just a friendly client-side guard.
    const looksLikePdf =
      ALLOWED_MIME.has(next.type) ||
      next.name.toLowerCase().endsWith('.pdf');
    if (!looksLikePdf) {
      setFileError(MSG.unsupportedType);
      return;
    }
    setFile(next);
  };

  const nameTrimmed = name.trim();
  const nameInvalid = name.length > 0 && nameTrimmed.length < 2;
  const yearInvalid = useMemo(() => {
    if (year.length === 0) return false;
    const n = Number(year);
    return !Number.isInteger(n) || n < 2000 || n > 2100;
  }, [year]);

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (!file) return false;
    if (nameTrimmed.length < 2 || nameTrimmed.length > 200) return false;
    if (yearInvalid) return false;
    return true;
  }, [submitting, file, nameTrimmed, yearInvalid]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit || !file) return;
    setServerError(null);
    setPlanLimitHit(null);
    setSubmitting(true);
    setProgress(0);

    const fd = new FormData();
    fd.append('file', file);
    fd.append('name', nameTrimmed);
    if (boardType.trim()) fd.append('boardType', boardType.trim());
    if (language.trim()) fd.append('language', language.trim());
    if (version.trim()) fd.append('version', version.trim());
    // The backend doesn't currently accept `year` but we pass it as a
    // metadata field that the server can ignore safely — class-validator's
    // whitelist drops unknown fields.

    const url = isReplace
      ? `${apiBaseUrl}/api/v1/syllabus/${initial!.id}`
      : `${apiBaseUrl}/api/v1/syllabus`;
    const method = isReplace ? 'PATCH' : 'POST';

    try {
      const result = await xhrUpload<{ syllabus: SyllabusView }>({
        url,
        method,
        body: fd,
        accessToken,
        xhrRef,
        onProgress: setProgress,
      });
      setSubmitting(false);
      setProgress(100);
      onSuccess(result.data.syllabus, mode.kind);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setSubmitting(false);
        setProgress(0);
        return;
      }
      if (err instanceof ApiClientError) {
        // Sprint 8.2 — 402 STORAGE_LIMIT_REACHED renders a dedicated upgrade
        // prompt linking to /admin/billing, NOT the generic error cell.
        if (err.status === 402 && err.code === 'STORAGE_LIMIT_REACHED') {
          const d = (err.details ?? {}) as Record<string, unknown>;
          setPlanLimitHit({
            message: err.message,
            plan: typeof d.plan === 'string' ? d.plan : undefined,
            limit: typeof d.limit === 'number' ? d.limit : undefined,
            current: typeof d.current === 'number' ? d.current : undefined,
          });
          setSubmitting(false);
          setProgress(0);
          return;
        }
        let msg = err.message;
        if (err.status === 413) msg = MSG.fileTooLarge;
        if (err.status === 400) {
          msg = flattenValidationDetails(err.details, err.message);
        }
        setServerError(msg);
      } else {
        setServerError(
          err instanceof Error ? err.message : 'Upload failed.',
        );
      }
      setSubmitting(false);
      setProgress(0);
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (submitting) return;
    const next = e.dataTransfer.files?.[0];
    if (next) handleFileSelect(next);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
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
            'fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col',
            'bg-(image:--gradient-cream-sunrise)',
            'border-l border-(--vaasenk-line-sand)',
            'shadow-[0_32px_90px_rgba(160,0,0,0.18)]',
            'focus:outline-none',
            'data-[state=open]:animate-in data-[state=open]:slide-in-from-right',
            'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right',
          )}
        >
          <header className="flex items-start justify-between gap-3 border-b border-(--vaasenk-line-sand)/60 bg-white/40 px-6 py-5 backdrop-blur">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold text-(--vaasenk-ink)">
                {isReplace ? MSG.replaceTitle : MSG.createTitle}
              </Dialog.Title>
              <Dialog.Description
                id={`${formId}-helper`}
                className="mt-1 text-sm text-(--vaasenk-muted)"
              >
                {isReplace ? MSG.replaceSubtitle : MSG.createSubtitle}
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

          <form onSubmit={submit} className="flex flex-1 flex-col overflow-y-auto">
            <div className="flex-1 space-y-5 px-6 py-6">
              {isReplace ? (
                <div className="flex items-start gap-2.5 rounded-2xl border border-(--vaasenk-warning)/30 bg-(--vaasenk-warning)/10 px-4 py-3 text-sm text-(--vaasenk-deep-maroon)">
                  <Info
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-(--vaasenk-warning)"
                  />
                  <p>{MSG.replaceCallout}</p>
                </div>
              ) : null}

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
                        You&apos;ve reached your plan&apos;s storage limit
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

              {serverError ? (
                <div
                  role="alert"
                  aria-live="polite"
                  className="rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-4 py-3 text-sm text-(--vaasenk-danger)"
                >
                  {serverError}
                </div>
              ) : null}

              {/* File drop zone */}
              <div className="space-y-2">
                <span className="block text-sm font-medium text-(--vaasenk-deep-maroon)">
                  PDF file
                  <span className="ml-1 text-(--vaasenk-red)" aria-hidden>
                    *
                  </span>
                </span>
                {!file ? (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!submitting) setIsDragOver(true);
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={onDrop}
                    className={cn(
                      'relative flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
                      isDragOver
                        ? 'border-(--vaasenk-red) bg-(--vaasenk-rose-wash)'
                        : 'border-(--vaasenk-line-sand) bg-white/60',
                    )}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ALLOWED_EXT_HINT}
                      onChange={(e) =>
                        handleFileSelect(e.target.files?.[0] ?? null)
                      }
                      disabled={submitting}
                      className="absolute inset-0 cursor-pointer opacity-0"
                      aria-label="Choose a PDF to upload"
                    />
                    <div
                      aria-hidden
                      className="grid size-12 place-items-center rounded-2xl bg-(--vaasenk-peach-wash) text-(--vaasenk-red)"
                    >
                      <CloudUpload className="size-6" />
                    </div>
                    <p className="text-sm font-semibold text-(--vaasenk-ink)">
                      {MSG.drop}
                    </p>
                    <p className="text-xs text-(--vaasenk-muted)">
                      {MSG.browse}
                    </p>
                    <p className="mt-1 text-xs text-(--vaasenk-subtle)">
                      {MSG.hint}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-2xl border border-(--vaasenk-line-sand) bg-white/85 p-3">
                    <div
                      aria-hidden
                      className="grid size-14 shrink-0 place-items-center rounded-xl bg-(--vaasenk-peach-wash) text-(--vaasenk-red)"
                    >
                      <FileText className="size-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-(--vaasenk-ink)">
                        {file.name}
                      </p>
                      <p className="text-xs text-(--vaasenk-muted)">
                        {formatBytes(file.size)} · PDF
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleFileSelect(null)}
                      disabled={submitting}
                      className="inline-flex h-9 items-center rounded-full border border-(--vaasenk-line-sand) bg-white/80 px-3 text-xs font-medium text-(--vaasenk-deep-maroon) transition-colors hover:bg-(--vaasenk-rose-wash) hover:text-(--vaasenk-red) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {MSG.remove}
                    </button>
                  </div>
                )}
                {fileError ? (
                  <p
                    role="alert"
                    className="text-xs text-(--vaasenk-danger)"
                  >
                    {fileError}
                  </p>
                ) : null}
              </div>

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
                  aria-describedby={
                    nameInvalid ? `${formId}-name-error` : undefined
                  }
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={MSG.namePlaceholder}
                  maxLength={200}
                  disabled={submitting}
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

              {/* Board */}
              <div className="space-y-2">
                <label
                  htmlFor={`${formId}-board`}
                  className="block text-sm font-medium text-(--vaasenk-deep-maroon)"
                >
                  {MSG.boardLabel}
                </label>
                <input
                  id={`${formId}-board`}
                  type="text"
                  list={`${formId}-board-list`}
                  value={boardType}
                  onChange={(e) => setBoardType(e.target.value)}
                  placeholder={MSG.boardPlaceholder}
                  maxLength={120}
                  disabled={submitting}
                  className="min-h-[44px] w-full rounded-2xl border border-(--vaasenk-line-sand) bg-white/85 px-4 py-3 text-base text-(--vaasenk-ink) placeholder:text-(--vaasenk-subtle) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-70"
                />
                <datalist id={`${formId}-board-list`}>
                  {COMMON_BOARDS.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
                <p className="text-xs text-(--vaasenk-subtle)">
                  {MSG.boardHelper}
                </p>
              </div>

              {/* Year + Version row */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor={`${formId}-year`}
                    className="block text-sm font-medium text-(--vaasenk-deep-maroon)"
                  >
                    {MSG.yearLabel}
                  </label>
                  <input
                    id={`${formId}-year`}
                    type="number"
                    min={2000}
                    max={2100}
                    inputMode="numeric"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder={MSG.yearPlaceholder}
                    disabled={submitting}
                    aria-invalid={yearInvalid || undefined}
                    className="min-h-[44px] w-full rounded-2xl border border-(--vaasenk-line-sand) bg-white/85 px-4 py-3 text-base text-(--vaasenk-ink) placeholder:text-(--vaasenk-subtle) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-70 aria-invalid:border-(--vaasenk-danger)"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor={`${formId}-version`}
                    className="block text-sm font-medium text-(--vaasenk-deep-maroon)"
                  >
                    {MSG.versionLabel}
                  </label>
                  <input
                    id={`${formId}-version`}
                    type="text"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder={MSG.versionPlaceholder}
                    maxLength={20}
                    disabled={submitting}
                    className="min-h-[44px] w-full rounded-2xl border border-(--vaasenk-line-sand) bg-white/85 px-4 py-3 text-base text-(--vaasenk-ink) placeholder:text-(--vaasenk-subtle) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-70"
                  />
                </div>
              </div>

              {/* Language */}
              <div className="space-y-2">
                <label
                  htmlFor={`${formId}-language`}
                  className="block text-sm font-medium text-(--vaasenk-deep-maroon)"
                >
                  {MSG.languageLabel}
                </label>
                <select
                  id={`${formId}-language`}
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  disabled={submitting}
                  className="min-h-[44px] w-full rounded-2xl border border-(--vaasenk-line-sand) bg-white/85 px-4 py-3 text-base text-(--vaasenk-ink) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Deferred — class & subject */}
              <div className="grid gap-4 sm:grid-cols-2">
                <DeferredField
                  id={`${formId}-class`}
                  label={MSG.classLabel}
                />
                <DeferredField
                  id={`${formId}-subject`}
                  label={MSG.subjectLabel}
                />
              </div>
              <p className="-mt-2 flex items-start gap-2 text-xs text-(--vaasenk-subtle)">
                <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                {MSG.taxonomyPending}
              </p>

              {submitting ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="space-y-2 rounded-2xl border border-(--vaasenk-line-sand) bg-white/70 p-4"
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-(--vaasenk-deep-maroon)">
                    <Loader2 className="size-4 animate-spin" />
                    <span>{MSG.progress(progress)}</span>
                  </div>
                  <div
                    aria-hidden
                    className="h-2 w-full overflow-hidden rounded-full bg-(--vaasenk-peach-wash)"
                  >
                    <div
                      className="h-full rounded-full bg-(image:--gradient-brand-flame) transition-[width] duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </div>

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
                    {MSG.uploading}
                  </>
                ) : (
                  <>
                    <CloudUpload className="size-4" />
                    {isReplace ? MSG.uploadReplace : MSG.uploadCreate}
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

function DeferredField({ id, label }: { id: string; label: string }) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-(--vaasenk-subtle)"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          disabled
          aria-disabled
          placeholder="Coming in Sprint 3.4"
          className="min-h-[44px] w-full cursor-not-allowed rounded-2xl border border-(--vaasenk-line-sand)/60 bg-white/40 px-4 py-3 text-base text-(--vaasenk-subtle) placeholder:text-(--vaasenk-subtle)"
        />
        <Lock
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-(--vaasenk-subtle)"
        />
      </div>
    </div>
  );
}
