import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

/**
 * Single source of truth for the OpenAI SDK client.
 *
 * Mirrors `apps/api/src/common/supabase/supabase.service.ts` — instantiated
 * once at module init, exposes the bare SDK via the `client` getter. Any
 * caller that depends on OpenAI MUST go through this service (CLAUDE.md §6).
 *
 * The API key is intentionally OPTIONAL at boot (Sprint 4+ requires it, but
 * placeholders in dev should not crash the API). When the key is missing or
 * a placeholder, the `client` getter throws ServiceUnavailableException so
 * the failure is loud at first use, not silent.
 */
@Injectable()
export class OpenAIClient {
  private readonly logger = new Logger(OpenAIClient.name);
  private readonly instance: OpenAI | null;
  private readonly configured: boolean;

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string | undefined>('OPENAI_API_KEY');
    const trimmed = (key ?? '').trim();
    const isPlaceholder =
      trimmed === '' ||
      trimmed.toLowerCase().includes('placeholder') ||
      trimmed.toLowerCase().startsWith('your-') ||
      trimmed.toLowerCase().startsWith('sk-replace');

    if (isPlaceholder) {
      this.configured = false;
      this.instance = null;
      this.logger.warn(
        'OPENAI_API_KEY is not configured. Embedding and AI-chat endpoints ' +
          'will return 503 until a real key is set.',
      );
      return;
    }

    this.configured = true;
    this.instance = new OpenAI({ apiKey: trimmed });
  }

  /**
   * Returns the live SDK client. Throws 503 if the API key was not provided
   * — the caller never sees `null`, so they don't need defensive checks.
   */
  get client(): OpenAI {
    if (!this.instance) {
      throw new ServiceUnavailableException(
        'OpenAI is not configured for this environment.',
      );
    }
    return this.instance;
  }

  /** Cheap configuration probe for health checks. */
  get isConfigured(): boolean {
    return this.configured;
  }
}
