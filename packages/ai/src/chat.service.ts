import { Injectable, Logger } from '@nestjs/common';
import { AnthropicClient } from './clients/anthropic.client';
import { DEFAULT_CHAT_MODEL } from './pricing';
import { extractCitations } from './prompts/teacher-assistant.prompt';
import type {
  ChatCompleteParams,
  ChatCompleteResult,
  ChatStreamEvent,
  ChatStreamParams,
  Citation,
} from './types';

/**
 * Anthropic Claude chat wrapper — Sprint 4 PROMPT 18.
 *
 * Two methods:
 *   - `complete(...)` — non-streaming convenience for batch / background use.
 *   - `stream(...)` — primary path; returns an AsyncIterable of token events,
 *     a single usage event at the end, and an error event on failure.
 *
 * Both take `institutionId` as the mandatory first parameter (CLAUDE.md §3 /
 * AI Engineer's directive). Usage logging is the caller's responsibility —
 * the stream yields a `usage` event with prompt/completion token counts
 * which the caller writes to `ai_usage_logs`.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  private static readonly DEFAULT_MAX_TOKENS = 1024;

  constructor(private readonly anthropic: AnthropicClient) {}

  /**
   * Non-streaming completion. Returns the full assistant text + usage in one
   * promise. Citations are extracted from the response text against the
   * provided `contextChunks` for caller convenience.
   */
  async complete(
    _institutionId: string,
    params: ChatCompleteParams,
  ): Promise<ChatCompleteResult> {
    const model = params.model ?? DEFAULT_CHAT_MODEL;
    const sdk = this.anthropic.client;

    const response = await sdk.messages.create({
      model,
      max_tokens: params.maxTokens ?? ChatService.DEFAULT_MAX_TOKENS,
      system: params.systemPrompt,
      messages: this.buildMessages(params),
    });

    const content = this.joinAnthropicTextBlocks(response.content);
    const citations: Citation[] = params.contextChunks
      ? extractCitations(content, params.contextChunks)
      : [];

    return {
      content,
      model,
      promptTokens: response.usage?.input_tokens ?? 0,
      completionTokens: response.usage?.output_tokens ?? 0,
      citations,
    };
  }

  /**
   * Streaming completion — primary chat path. Yields:
   *   - one `{ type: 'token', content }` event per text delta,
   *   - a single `{ type: 'usage', ... }` event at the end with totals + the
   *     joined full content + extracted citations,
   *   - or a single `{ type: 'error', code, message }` event if Anthropic
   *     errors mid-stream (it then ends — no further events).
   *
   * The returned iterable is single-pass; the caller is expected to
   * `for await (...)` exactly once. SSE adapters in the API translate each
   * event to a `data: {json}\n\n` frame.
   */
  async *stream(
    _institutionId: string,
    params: ChatStreamParams,
  ): AsyncIterable<ChatStreamEvent> {
    const model = params.model ?? DEFAULT_CHAT_MODEL;
    const sdk = this.anthropic.client;

    let buffer = '';
    let promptTokens = 0;
    let completionTokens = 0;

    try {
      const stream = sdk.messages.stream({
        model,
        max_tokens: params.maxTokens ?? ChatService.DEFAULT_MAX_TOKENS,
        system: params.systemPrompt,
        messages: this.buildMessages(params),
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          const delta = event.delta.text;
          if (delta) {
            buffer += delta;
            yield { type: 'token', content: delta };
          }
        } else if (event.type === 'message_start') {
          // Anthropic provides input_tokens in message_start.
          promptTokens = event.message.usage?.input_tokens ?? promptTokens;
        } else if (event.type === 'message_delta') {
          completionTokens =
            event.usage?.output_tokens ?? completionTokens;
        }
      }

      // The SDK exposes a `finalMessage()` helper but iterating events is
      // already enough — message_delta carries final output_tokens.

      const citations: Citation[] = params.contextChunks
        ? extractCitations(buffer, params.contextChunks)
        : [];

      yield {
        type: 'usage',
        promptTokens,
        completionTokens,
        model,
        content: buffer,
        citations,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = this.classifyError(err);
      this.logger.error(
        `Anthropic stream failed (${code}): ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      yield { type: 'error', code, message: 'AI provider error. Please retry.' };
    }
  }

  /**
   * Converts history + the latest user message into Anthropic's wire format.
   * History items must alternate user/assistant per Anthropic's contract;
   * we trust the caller to respect that ordering — the chat service in
   * apps/api builds it from a single `findMany({ orderBy: createdAt })` so
   * the ordering invariant holds by construction.
   */
  private buildMessages(
    params: ChatCompleteParams | ChatStreamParams,
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (params.history) {
      for (const h of params.history) {
        messages.push({ role: h.role, content: h.content });
      }
    }
    messages.push({ role: 'user', content: params.userMessage });
    return messages;
  }

  /**
   * Anthropic returns content as an array of typed blocks. The teacher
   * chatbot only emits text blocks (no tool use in Sprint 4), so we flatten
   * the text blocks and ignore anything else.
   */
  private joinAnthropicTextBlocks(
    blocks: Array<{ type: string; text?: string }>,
  ): string {
    return blocks
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text ?? '')
      .join('');
  }

  /**
   * Maps SDK errors to internal codes. We intentionally surface a generic
   * "AI provider error" message to clients — the detailed stack lives in
   * logger output, never on the wire.
   */
  private classifyError(err: unknown): string {
    if (typeof err === 'object' && err !== null) {
      const candidate = err as { status?: number; name?: string };
      if (candidate.status === 401) return 'AUTH_ERROR';
      if (candidate.status === 429) return 'RATE_LIMITED';
      if (candidate.status === 503) return 'PROVIDER_UNAVAILABLE';
      if (candidate.name === 'AbortError') return 'TIMEOUT';
    }
    return 'STREAM_ERROR';
  }
}
