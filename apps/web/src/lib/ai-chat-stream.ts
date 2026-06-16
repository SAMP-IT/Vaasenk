/**
 * SSE parser for the Vaasenk teacher AI chat endpoint.
 *
 * The backend's `POST /api/v1/classrooms/:id/ai/sessions/:sessionId/chat`
 * speaks Server-Sent Events. Frames look like:
 *
 *     event: token
 *     data: {"type":"token","content":"Hello"}
 *
 *     event: usage
 *     data: {"type":"usage","promptTokens":312,...}
 *
 *     event: error
 *     data: {"type":"error","code":"STREAM_ERROR","message":"..."}
 *
 * Pre-flight errors (401/403/404/412/402) come back as a normal JSON envelope
 * `{ error: { code, message } }`. Once streaming starts the response body is
 * only SSE frames.
 *
 * This helper exposes an `AsyncIterable<ChatStreamEvent>` so the consumer can
 * `for await (const event of streamAiChat(...))` and switch on `event.type`.
 *
 * It is intentionally framework-free (no React imports) — lives in
 * `src/lib/` so it can be tested or reused outside the chat panel.
 */

import { createClient as createBrowserSupabase } from './supabase/client';

const baseUrl = (() => {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  return raw.replace(/\/$/, '');
})();

// -------------------------------------------------------------------------
// Wire types — keep aligned with apps/api ai-chat module.
// -------------------------------------------------------------------------

export type Citation = {
  index: number;
  chapter?: string | null;
  topic?: string | null;
  syllabusName?: string | null;
  syllabusVersion?: string | null;
  pageNumber?: number | null;
};

export type ChatStreamToken = {
  type: 'token';
  content: string;
};

export type ChatStreamUsage = {
  type: 'usage';
  promptTokens: number;
  completionTokens: number;
  model: string;
  citations?: Citation[];
};

export type ChatStreamError = {
  type: 'error';
  code: string;
  message: string;
};

export type ChatStreamEvent = ChatStreamToken | ChatStreamUsage | ChatStreamError;

// -------------------------------------------------------------------------
// Stream helper
// -------------------------------------------------------------------------

export type StreamAiChatOptions = {
  classroomId: string;
  sessionId: string;
  content: string;
  /** Provide an AbortController.signal to support cancellation. */
  signal?: AbortSignal;
  /**
   * Optional override — primarily for tests. Defaults to reading the
   * Supabase access token from the browser session.
   */
  accessToken?: string;
};

/**
 * Open the streaming POST and yield each parsed SSE event in order.
 *
 * Yields exactly one of these terminal events before returning:
 *   • `{ type: 'usage', ... }` on successful completion
 *   • `{ type: 'error', ... }` on pre-flight failure or stream error
 *
 * Throws only on cancellation (the consumer's AbortError).
 */
export async function* streamAiChat(
  opts: StreamAiChatOptions,
): AsyncIterable<ChatStreamEvent> {
  const url = `${baseUrl}/api/v1/classrooms/${encodeURIComponent(
    opts.classroomId,
  )}/ai/sessions/${encodeURIComponent(opts.sessionId)}/chat`;

  let token = opts.accessToken;
  if (!token) {
    const supabase = createBrowserSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    token = session?.access_token ?? '';
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ content: opts.content }),
      signal: opts.signal,
    });
  } catch (err) {
    // Network failure — surface as an error event rather than throwing so
    // the UI can render a single, consistent error path.
    if ((err as { name?: string })?.name === 'AbortError') throw err;
    yield {
      type: 'error',
      code: 'NETWORK_ERROR',
      message:
        err instanceof Error
          ? err.message
          : 'Could not reach Vaasenk AI. Check your connection and retry.',
    };
    return;
  }

  // Pre-flight errors are plain JSON `{ error: { code, message } }`.
  if (!res.ok) {
    let code = `HTTP_${res.status}`;
    let message = res.statusText || 'Request failed';
    try {
      const payload = (await res.json()) as {
        error?: { code?: string; message?: string };
      };
      if (payload?.error?.code) code = payload.error.code;
      if (payload?.error?.message) message = payload.error.message;
    } catch {
      // Body wasn't JSON — keep the HTTP fallback.
    }
    yield { type: 'error', code, message };
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    yield {
      type: 'error',
      code: 'NO_STREAM',
      message: 'The AI response was empty. Try again.',
    };
    return;
  }

  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line. Tolerate \r\n and \n.
      // Search for whichever boundary appears first in the buffer.
      while (true) {
        const boundary = nextFrameBoundary(buffer);
        if (boundary.index === -1) break;
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.length);

        const dataLine = frame
          .split(/\r?\n/)
          .find((line) => line.startsWith('data:'));
        if (!dataLine) continue;

        const json = dataLine.slice('data:'.length).trim();
        if (!json) continue;

        try {
          const event = JSON.parse(json) as ChatStreamEvent;
          if (event && typeof event === 'object' && 'type' in event) {
            yield event;
          }
        } catch {
          // Ignore malformed frames — the stream may interleave keep-alives.
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* noop */
    }
  }
}

/**
 * Locate the next SSE frame terminator (blank line). Returns the index plus
 * the byte length of the terminator so the caller can slice past it.
 * Handles both `\r\n\r\n` (canonical) and `\n\n` (common in Node servers).
 */
function nextFrameBoundary(buffer: string): { index: number; length: number } {
  const crlf = buffer.indexOf('\r\n\r\n');
  const lf = buffer.indexOf('\n\n');
  if (crlf === -1 && lf === -1) return { index: -1, length: 0 };
  if (crlf === -1) return { index: lf, length: 2 };
  if (lf === -1) return { index: crlf, length: 4 };
  return crlf < lf ? { index: crlf, length: 4 } : { index: lf, length: 2 };
}
