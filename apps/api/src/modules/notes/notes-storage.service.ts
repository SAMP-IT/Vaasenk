import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.config';
import { SupabaseService } from '../../common/supabase/supabase.service';

/**
 * Thin storage wrapper around Supabase Storage (signed URLs, upload, delete).
 *
 * Bucket: `vaasenk-storage`. Provisioned by the docker MinIO init container
 * for local dev; the same bucket name is used in the hosted Supabase project.
 *
 * All paths follow CLAUDE.md §3 rule 5:
 *   `{institutionId}/{classroomId}/{noteId}/{filename}`
 *
 * Storage values are PATHS — signed URLs are generated per-read at the
 * service layer with a 1h expiry, never stored on the row.
 */
@Injectable()
export class NotesStorageService {
  private readonly logger = new Logger(NotesStorageService.name);
  static readonly BUCKET = 'vaasenk-storage';
  static readonly DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  /**
   * True when the configured Supabase URL is a placeholder (dev without a
   * real Supabase project provisioned). In that case file writes are
   * intentionally rejected so we don't pretend a 200-OK upload succeeded.
   * Reads still work — they 404 cleanly because the storage host is
   * unreachable, which is acceptable for dev smoke tests.
   */
  isPlaceholder(): boolean {
    const url = this.config.get('SUPABASE_URL', { infer: true });
    return !url || url.includes('placeholder') || url.includes('your-project');
  }

  /**
   * Uploads a buffer to storage. Returns the canonical path the caller
   * should persist on the DB row.
   *
   * NOTE: Supabase upload uses `upsert: false` so a duplicate path
   * surfaces as a 409 rather than silently overwriting. Callers should
   * include a fresh `noteId` (UUID) in every path so collisions are
   * theoretically impossible — this is defense-in-depth.
   */
  async uploadObject(
    path: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<{ path: string }> {
    if (this.isPlaceholder()) {
      throw new ServiceUnavailableException(
        'File storage is not yet configured for this environment.',
      );
    }
    const { error } = await this.supabase.admin.storage
      .from(NotesStorageService.BUCKET)
      .upload(path, buffer, {
        contentType,
        upsert: false,
      });
    if (error) {
      this.logger.error(
        `Supabase storage upload failed for ${path}: ${error.message}`,
      );
      throw new ServiceUnavailableException(
        `Storage upload failed: ${error.message}`,
      );
    }
    return { path };
  }

  /**
   * Downloads a stored object as a `Buffer`. Returns `null` if the path is
   * falsy, storage is in placeholder mode, or the object cannot be fetched.
   *
   * Used by BullMQ workers (notes OCR, syllabus parsing, sample-paper
   * extraction) that need to read the uploaded file from the worker
   * process. Supabase storage returns a Blob; we coerce to a Node Buffer
   * so downstream libraries (pdf-parse, sharp, etc.) work without DOM
   * Blob shims.
   */
  async downloadObject(
    path: string | null | undefined,
  ): Promise<Buffer | null> {
    if (!path) return null;
    if (this.isPlaceholder()) return null;

    const { data, error } = await this.supabase.admin.storage
      .from(NotesStorageService.BUCKET)
      .download(path);
    if (error || !data) {
      this.logger.warn(
        `Failed to download ${path}: ${error?.message ?? 'unknown'}`,
      );
      return null;
    }
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Generates a time-limited signed URL for a stored object. Returns null
   * if `path` is falsy (some thumbnails may not exist) or storage is in
   * placeholder mode — frontend treats null as "no preview available".
   */
  async getSignedUrl(
    path: string | null | undefined,
    expiresInSeconds: number = NotesStorageService.DEFAULT_SIGNED_URL_TTL_SECONDS,
  ): Promise<string | null> {
    if (!path) return null;
    if (this.isPlaceholder()) return null;

    const { data, error } = await this.supabase.admin.storage
      .from(NotesStorageService.BUCKET)
      .createSignedUrl(path, expiresInSeconds);
    if (error || !data) {
      this.logger.warn(
        `Failed to create signed URL for ${path}: ${error?.message ?? 'unknown'}`,
      );
      return null;
    }
    return data.signedUrl;
  }

  /**
   * Hard-deletes the object. Reserved for admin "purge" flows — Sprint 2
   * notes delete is SOFT (status → ARCHIVED) and intentionally keeps the
   * underlying file so an admin can restore.
   */
  async deleteObject(path: string): Promise<void> {
    if (this.isPlaceholder()) return;
    const { error } = await this.supabase.admin.storage
      .from(NotesStorageService.BUCKET)
      .remove([path]);
    if (error) {
      this.logger.warn(`Failed to delete ${path}: ${error.message}`);
    }
  }

  /**
   * Sanitizes a user-provided file name so it's safe to use as the last
   * path segment. Strips path separators, control characters, and trims
   * extreme lengths. Preserves the extension if present.
   */
  static sanitizeFilename(name: string): string {
    if (!name) return 'file';
    // Strip path separators and control characters; collapse whitespace.
    // We strip anything outside the printable ASCII range (0x20-0x7E) which
    // is the simplest portable filter and avoids the no-control-regex rule.
    let safe = '';
    for (const ch of name) {
      const code = ch.codePointAt(0) ?? 0;
      if (code === 0x2f || code === 0x5c) {
        safe += '_';
      } else if (code >= 0x20 && code <= 0x7e) {
        safe += ch;
      }
    }
    safe = safe.replace(/\s+/g, '_').trim();
    if (safe.length === 0) safe = 'file';
    // Cap total length at 180 chars to keep the storage key well under any
    // S3/Supabase per-object key limit (1024) even after path prefixes.
    if (safe.length > 180) {
      const lastDot = safe.lastIndexOf('.');
      if (lastDot > 0 && safe.length - lastDot <= 10) {
        const ext = safe.slice(lastDot);
        safe = safe.slice(0, 180 - ext.length) + ext;
      } else {
        safe = safe.slice(0, 180);
      }
    }
    return safe;
  }
}
