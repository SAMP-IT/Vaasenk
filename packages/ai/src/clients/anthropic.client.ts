import Anthropic from '@anthropic-ai/sdk';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Single source of truth for the Anthropic SDK client.
 *
 * Mirror of `OpenAIClient`; see that file for the configure-or-fail policy.
 * Sprint 4 uses Anthropic Claude Sonnet 4.x as the default chat model
 * (CLAUDE.md §2 "Sonnet for quality").
 */
@Injectable()
export class AnthropicClient {
  private readonly logger = new Logger(AnthropicClient.name);
  private readonly instance: Anthropic | null;
  private readonly configured: boolean;

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string | undefined>('ANTHROPIC_API_KEY');
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
        'ANTHROPIC_API_KEY is not configured. AI chat endpoints will return ' +
          '503 until a real key is set.',
      );
      return;
    }

    this.configured = true;
    this.instance = new Anthropic({ apiKey: trimmed });
  }

  get client(): Anthropic {
    if (!this.instance) {
      throw new ServiceUnavailableException(
        'Anthropic is not configured for this environment.',
      );
    }
    return this.instance;
  }

  get isConfigured(): boolean {
    return this.configured;
  }
}
