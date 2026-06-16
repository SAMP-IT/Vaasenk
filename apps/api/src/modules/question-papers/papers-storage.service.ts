import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.config';
import { SupabaseService } from '../../common/supabase/supabase.service';

/**
 * Thin storage wrapper around Supabase Storage for generated question papers.
 *
 * Mirrors `NotesStorageService` / `SyllabusStorageService` — same bucket
 * (`vaasenk-storage`), same signed-URL TTL, same placeholder-mode handling —
 * but pinned to the `papers/` path prefix per CLAUDE.md §3 rule 5:
 *
 *   `{institutionId}/papers/{paperId}/paper.pdf`
 *   `{institutionId}/papers/{paperId}/answer-key.pdf`
 *
 * The caller assembles the full path; this service stays oblivious to the
 * path scheme so the convention lives in exactly one place (the orchestrating
 * service).
 *
 * Sprint 5 — PROMPT 20.
 */
@Injectable()
export class PapersStorageService {
  private readonly logger = new Logger(PapersStorageService.name);
  static readonly BUCKET = 'vaasenk-storage';
  static readonly DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  /**
   * True when the configured Supabase URL is a placeholder (dev without a
   * real Supabase project). Uploads/downloads fail loudly; signed-URL
   * generation returns null.
   */
  isPlaceholder(): boolean {
    const url = this.config.get('SUPABASE_URL', { infer: true });
    return !url || url.includes('placeholder') || url.includes('your-project');
  }

  /**
   * Uploads (or overwrites) the PDF buffer at `path`. Papers can be exported
   * multiple times (re-export after edit) so we set `upsert: true` here —
   * unlike notes / syllabus where collisions should never happen.
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
      .from(PapersStorageService.BUCKET)
      .upload(path, buffer, {
        contentType,
        upsert: true,
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

  /** Downloads a stored PDF — used by admin tooling / future preview flows. */
  async downloadObject(
    path: string | null | undefined,
  ): Promise<Buffer | null> {
    if (!path) return null;
    if (this.isPlaceholder()) return null;

    const { data, error } = await this.supabase.admin.storage
      .from(PapersStorageService.BUCKET)
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

  /** Generates a time-limited signed URL (1h by default). */
  async getSignedUrl(
    path: string | null | undefined,
    expiresInSeconds: number = PapersStorageService.DEFAULT_SIGNED_URL_TTL_SECONDS,
  ): Promise<string | null> {
    if (!path) return null;
    if (this.isPlaceholder()) return null;

    const { data, error } = await this.supabase.admin.storage
      .from(PapersStorageService.BUCKET)
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
      .from(PapersStorageService.BUCKET)
      .remove([path]);
    if (error) {
      this.logger.warn(`Failed to delete ${path}: ${error.message}`);
    }
  }
}
