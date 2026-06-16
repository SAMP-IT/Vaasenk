import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.config';
import { SupabaseService } from '../../common/supabase/supabase.service';

/**
 * Thin storage wrapper around Supabase Storage for syllabus PDFs.
 *
 * Mirrors `NotesStorageService` — same bucket (`vaasenk-storage`), same
 * signed-URL TTL, same placeholder-mode handling — but pinned to the
 * `syllabus/` path prefix per CLAUDE.md §3 rule 5:
 *
 *   `{institutionId}/syllabus/{syllabusId}/{filename}`
 *
 * The caller assembles the full path; this service stays oblivious to the
 * path scheme so the convention lives in exactly one place (the service
 * layer that owns the entity).
 */
@Injectable()
export class SyllabusStorageService {
  private readonly logger = new Logger(SyllabusStorageService.name);
  static readonly BUCKET = 'vaasenk-storage';
  static readonly DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  /**
   * True when the configured Supabase URL is a placeholder (dev without a
   * real Supabase project). Uploads/downloads fail loudly; signed-URL
   * generation returns null. Same semantics as NotesStorageService.
   */
  isPlaceholder(): boolean {
    const url = this.config.get('SUPABASE_URL', { infer: true });
    return !url || url.includes('placeholder') || url.includes('your-project');
  }

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
      .from(SyllabusStorageService.BUCKET)
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
   * Used by the syllabus worker to feed bytes into `pdf-parse`.
   */
  async downloadObject(
    path: string | null | undefined,
  ): Promise<Buffer | null> {
    if (!path) return null;
    if (this.isPlaceholder()) return null;

    const { data, error } = await this.supabase.admin.storage
      .from(SyllabusStorageService.BUCKET)
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

  async getSignedUrl(
    path: string | null | undefined,
    expiresInSeconds: number = SyllabusStorageService.DEFAULT_SIGNED_URL_TTL_SECONDS,
  ): Promise<string | null> {
    if (!path) return null;
    if (this.isPlaceholder()) return null;

    const { data, error } = await this.supabase.admin.storage
      .from(SyllabusStorageService.BUCKET)
      .createSignedUrl(path, expiresInSeconds);
    if (error || !data) {
      this.logger.warn(
        `Failed to create signed URL for ${path}: ${error?.message ?? 'unknown'}`,
      );
      return null;
    }
    return data.signedUrl;
  }

  async deleteObject(path: string): Promise<void> {
    if (this.isPlaceholder()) return;
    const { error } = await this.supabase.admin.storage
      .from(SyllabusStorageService.BUCKET)
      .remove([path]);
    if (error) {
      this.logger.warn(`Failed to delete ${path}: ${error.message}`);
    }
  }

  /**
   * Sanitizes a user-provided file name. Identical contract to
   * `NotesStorageService.sanitizeFilename` — duplicated here so each storage
   * service is self-contained and can evolve its naming rules independently
   * (e.g., syllabus may eventually want a `.pdf`-only extension policy).
   */
  static sanitizeFilename(name: string): string {
    if (!name) return 'file';
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
