'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  CloudUpload,
  FileText,
  Image as ImageIcon,
  Loader2,
  X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { VaasenkButton } from '@/components/ui/vaasenk-button';
import { ApiClientError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  NOTE_TAGS,
  TAG_CHIP_CLASSES,
  TAG_LABELS,
  type NoteTag,
} from '@/lib/notes-constants';
import { flattenValidationDetails, xhrUpload } from '@/lib/xhr-upload';

/**
 * Right-side slide-in drawer for uploading a note.
 *
 * Progress reporting goes through the shared @/lib/xhr-upload helper, which
 * also powers the admin Syllabus upload + Replace-version flows. The helper
 * mirrors apiFetch's auth convention (Authorization: Bearer <Supabase access
 * token>) and the standard {error:{code,message,details?}} envelope.
 */

const MSG = {
  title: 'Upload a note',
  subtitle:
    'Photograph the board, share a PDF, or attach a write-up. Students see it the moment you publish.',
  close: 'Close',
  drop: 'Drop your file here',
  browse: 'or click to browse',
  hint: 'JPEG, PNG, WebP, PDF, or TXT · up to 25 MB',
  remove: 'Remove',
  titleLabel: 'Title',
  titlePlaceholder: 'Trigonometry — Class 10 Board Notes',
  titleRequired: 'Required — at least 2 characters.',
  descriptionLabel: 'Description (optional)',
  descriptionPlaceholder: 'Any extra context for students…',
  tagsLabel: 'Tags',
  tagsHelper: 'Pick up to 6 — helps students find this faster.',
  statusLabel: 'Visibility',
  statusPublish: 'Publish now',
  statusPublishHint: 'Students will see this in their feed.',
  statusDraft: 'Save as draft',
  statusDraftHint: 'Only you can see it until you publish.',
  cancel: 'Cancel',
  upload: 'Upload',
  uploading: 'Uploading…',
  progress: (pct: number) => `Uploading ${pct}%`,
  fileTooLarge: 'File too large. Maximum size is 25 MB.',
  unsupportedType:
    'Unsupported file type. Allowed: JPEG, PNG, WebP, PDF, or plain text.',
} as const;

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
]);
const ALLOWED_EXT_HINT = '.jpg,.jpeg,.png,.webp,.pdf,.txt';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

type UploadStatus = 'DRAFT' | 'PUBLISHED';

export function UploadNoteDrawer({
  open,
  onOpenChange,
  classroomId,
  onSuccess,
  apiBaseUrl,
  accessToken,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classroomId: string;
  onSuccess: (publishedStatus: UploadStatus) => void;
  apiBaseUrl: string;
  accessToken: string | null;
}) {
  const formId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState<NoteTag[]>([]);
  const [status, setStatus] = useState<UploadStatus>('PUBLISHED');
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Reset state on every open. Avoids "ghost selection" when the drawer is
  // re-opened after a successful upload.
  useEffect(() => {
    if (open) {
      setFile(null);
      setFilePreview(null);
      setTitle('');
      setDescription('');
      setSelectedTags([]);
      setStatus('PUBLISHED');
      setSubmitting(false);
      setProgress(0);
      setServerError(null);
      setFileError(null);
      setIsDragOver(false);
    }
  }, [open]);

  // Build / revoke the preview object URL for image files.
  useEffect(() => {
    if (!file) {
      setFilePreview(null);
      return;
    }
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setFilePreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setFilePreview(null);
    return;
  }, [file]);

  // Cancel in-flight XHR on unmount — avoids the React "set state on
  // unmounted component" warning if the drawer closes mid-upload.
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
    if (!next) {
      setFile(null);
      return;
    }
    if (next.size > MAX_FILE_BYTES) {
      setFileError(MSG.fileTooLarge);
      return;
    }
    if (!ALLOWED_MIME.has(next.type)) {
      setFileError(MSG.unsupportedType);
      return;
    }
    setFile(next);
  };

  const titleTrimmed = title.trim();
  const titleInvalid = title.length > 0 && titleTrimmed.length < 2;
  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (!file) return false;
    if (titleTrimmed.length < 2 || titleTrimmed.length > 200) return false;
    if (description.length > 2000) return false;
    return true;
  }, [submitting, file, titleTrimmed, description.length]);

  const toggleTag = (tag: NoteTag) => {
    setSelectedTags((current) => {
      if (current.includes(tag)) return current.filter((t) => t !== tag);
      if (current.length >= 6) return current;
      return [...current, tag];
    });
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit || !file) return;
    setServerError(null);
    setSubmitting(true);
    setProgress(0);

    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', titleTrimmed);
    if (description.trim()) fd.append('description', description.trim());
    if (selectedTags.length > 0) {
      // Backend's @Transform accepts both comma-separated and repeated fields.
      // We send repeated fields — cleaner for class-validator's @IsArray.
      for (const tag of selectedTags) fd.append('tags', tag);
    }
    fd.append('status', status);

    try {
      await xhrUpload({
        url: `${apiBaseUrl}/api/v1/classrooms/${classroomId}/notes`,
        body: fd,
        accessToken,
        xhrRef,
        onProgress: setProgress,
      });
      setSubmitting(false);
      setProgress(100);
      onSuccess(status);
    } catch (err) {
      // AbortError → the drawer was closed mid-flight. Silently drop.
      if (err instanceof Error && err.name === 'AbortError') {
        setSubmitting(false);
        setProgress(0);
        return;
      }
      if (err instanceof ApiClientError) {
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
            'fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col',
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
                disabled={submitting}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-(--vaasenk-muted) transition-colors hover:bg-(--vaasenk-rose-wash) hover:text-(--vaasenk-red) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </header>

          {/* Body */}
          <form onSubmit={submit} className="flex flex-1 flex-col overflow-y-auto">
            <div className="flex-1 space-y-5 px-6 py-6">
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

              {/* File drop zone */}
              <div className="space-y-2">
                <span className="block text-sm font-medium text-(--vaasenk-deep-maroon)">
                  Attachment
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
                      'relative flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors',
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
                      aria-label="Choose a file to upload"
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
                    <p className="mt-2 text-xs text-(--vaasenk-subtle)">
                      {MSG.hint}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-2xl border border-(--vaasenk-line-sand) bg-white/85 p-3">
                    {filePreview ? (
                      // Image preview — we use a plain <img> because the
                      // URL is an in-memory object URL (next/image rejects
                      // blob: URLs).
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={filePreview}
                        alt=""
                        className="size-16 shrink-0 rounded-xl object-cover ring-1 ring-(--vaasenk-line-sand)"
                      />
                    ) : (
                      <div
                        aria-hidden
                        className="grid size-16 shrink-0 place-items-center rounded-xl bg-(--vaasenk-peach-wash) text-(--vaasenk-red)"
                      >
                        {file.type === 'application/pdf' ? (
                          <FileText className="size-6" />
                        ) : (
                          <ImageIcon className="size-6" />
                        )}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-(--vaasenk-ink)">
                        {file.name}
                      </p>
                      <p className="text-xs text-(--vaasenk-muted)">
                        {formatBytes(file.size)} · {file.type}
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

              {/* Title */}
              <div className="space-y-2">
                <label
                  htmlFor={`${formId}-title`}
                  className="block text-sm font-medium text-(--vaasenk-deep-maroon)"
                >
                  {MSG.titleLabel}
                  <span className="ml-1 text-(--vaasenk-red)" aria-hidden>
                    *
                  </span>
                </label>
                <input
                  id={`${formId}-title`}
                  type="text"
                  required
                  aria-required="true"
                  aria-invalid={titleInvalid || undefined}
                  aria-describedby={
                    titleInvalid ? `${formId}-title-error` : undefined
                  }
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={MSG.titlePlaceholder}
                  maxLength={200}
                  disabled={submitting}
                  className="min-h-[44px] w-full rounded-2xl border border-(--vaasenk-line-sand) bg-white/85 px-4 py-3 text-base text-(--vaasenk-ink) placeholder:text-(--vaasenk-subtle) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-70 aria-invalid:border-(--vaasenk-danger)"
                />
                {titleInvalid ? (
                  <p
                    id={`${formId}-title-error`}
                    className="text-xs text-(--vaasenk-danger)"
                  >
                    {MSG.titleRequired}
                  </p>
                ) : null}
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label
                  htmlFor={`${formId}-description`}
                  className="block text-sm font-medium text-(--vaasenk-deep-maroon)"
                >
                  {MSG.descriptionLabel}
                </label>
                <textarea
                  id={`${formId}-description`}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={MSG.descriptionPlaceholder}
                  maxLength={2000}
                  rows={3}
                  disabled={submitting}
                  className="min-h-[100px] w-full resize-y rounded-2xl border border-(--vaasenk-line-sand) bg-white/85 px-4 py-3 text-base text-(--vaasenk-ink) placeholder:text-(--vaasenk-subtle) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-70"
                />
                <p className="text-xs text-(--vaasenk-subtle)">
                  {description.length}/2000
                </p>
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <span className="block text-sm font-medium text-(--vaasenk-deep-maroon)">
                  {MSG.tagsLabel}
                </span>
                <div
                  role="group"
                  aria-label={MSG.tagsLabel}
                  className="flex flex-wrap gap-2"
                >
                  {NOTE_TAGS.map((tag) => {
                    const active = selectedTags.includes(tag);
                    const reachedMax = selectedTags.length >= 6 && !active;
                    return (
                      <button
                        key={tag}
                        type="button"
                        role="checkbox"
                        aria-checked={active}
                        aria-disabled={reachedMax || undefined}
                        onClick={() => toggleTag(tag)}
                        disabled={submitting || reachedMax}
                        className={cn(
                          'inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30 focus-visible:ring-offset-2 focus-visible:ring-offset-(--vaasenk-warm-canvas)',
                          active
                            ? cn(TAG_CHIP_CLASSES[tag], 'ring-1 ring-(--vaasenk-red)/30')
                            : 'border border-(--vaasenk-line-sand) bg-white/70 text-(--vaasenk-deep-maroon) hover:border-(--vaasenk-red)/40 hover:bg-white',
                          'disabled:cursor-not-allowed disabled:opacity-50',
                        )}
                      >
                        {TAG_LABELS[tag]}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-(--vaasenk-subtle)">
                  {MSG.tagsHelper}
                </p>
              </div>

              {/* Status */}
              <div className="space-y-2">
                <span className="block text-sm font-medium text-(--vaasenk-deep-maroon)">
                  {MSG.statusLabel}
                </span>
                <div
                  role="radiogroup"
                  aria-label={MSG.statusLabel}
                  className="grid gap-2 sm:grid-cols-2"
                >
                  <StatusOption
                    label={MSG.statusPublish}
                    hint={MSG.statusPublishHint}
                    selected={status === 'PUBLISHED'}
                    disabled={submitting}
                    onSelect={() => setStatus('PUBLISHED')}
                  />
                  <StatusOption
                    label={MSG.statusDraft}
                    hint={MSG.statusDraftHint}
                    selected={status === 'DRAFT'}
                    disabled={submitting}
                    onSelect={() => setStatus('DRAFT')}
                  />
                </div>
              </div>

              {/* Progress */}
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
                    {MSG.uploading}
                  </>
                ) : (
                  <>
                    <CloudUpload className="size-4" />
                    {MSG.upload}
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

function StatusOption({
  label,
  hint,
  selected,
  disabled,
  onSelect,
}: {
  label: string;
  hint: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        'flex flex-col items-start gap-1 rounded-2xl border px-4 py-3 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30',
        selected
          ? 'border-(--vaasenk-red) bg-(--vaasenk-rose-wash) text-(--vaasenk-deep-maroon)'
          : 'border-(--vaasenk-line-sand) bg-white/70 text-(--vaasenk-ink) hover:border-(--vaasenk-red)/40',
        'disabled:cursor-not-allowed disabled:opacity-60',
      )}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-xs text-(--vaasenk-muted)">{hint}</span>
    </button>
  );
}
