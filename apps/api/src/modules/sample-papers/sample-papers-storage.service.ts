import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.config';
import { SupabaseService } from '../../common/supabase/supabase.service';

/**
 * Thin storage wrapper for sample question paper PDFs.
 *
 * Mirrors `SyllabusStorageService`. Same bucket (`vaasenk-storage`), same
 * placeholder-mode semantics. Path prefix is `sample-papers/`:
 *
 *   `{institutionId}/sample-papers/{paperId}/{filename}`
 *
 * Each entity-typed storage service is intentionally a separate file even
 * though the implementation is identical — naming + extension policy can
 * diverge as the product grows (e.g., sample papers may need DOCX support
 * later that syllabus never wants).
 */
@Injectable()
export class SamplePapersStorageService {
  private readonly logger = new Logger(SamplePapersStorageService.name);
  static readonly BUCKET = 'vaasenk-storage';
  static readonly DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

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
      .from(SamplePapersStorageService.BUCKET)
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

  async downloadObject(
    path: string | null | undefined,
  ): Promise<Buffer | null> {
    if (!path) return null;
    if (this.isPlaceholder()) return null;

    const { data, error } = await this.supabase.admin.storage
      .from(SamplePapersStorageService.BUCKET)
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
    expiresInSeconds: number = SamplePapersStorageService.DEFAULT_SIGNED_URL_TTL_SECONDS,
  ): Promise<string | null> {
    if (!path) return null;
    if (this.isPlaceholder()) return null;

    const { data, error } = await this.supabase.admin.storage
      .from(SamplePapersStorageService.BUCKET)
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
      .from(SamplePapersStorageService.BUCKET)
      .remove([path]);
    if (error) {
      this.logger.warn(`Failed to delete ${path}: ${error.message}`);
    }
  }

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
