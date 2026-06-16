/**
 * Vaasenk Mobile — AI chat service (Sprint 7.3).
 *
 * Mirrors apps/api/src/modules/ai-chat/{ai-chat.controller,ai-chat.service}.ts:
 *
 *   POST   /api/v1/classrooms/:id/ai/sessions                       create a session
 *   GET    /api/v1/classrooms/:id/ai/sessions                       list sessions
 *   GET    /api/v1/classrooms/:id/ai/sessions/:sessionId            get a session + messages
 *   POST   /api/v1/classrooms/:id/ai/sessions/:sessionId/chat       stream chat (SSE)
 *
 * Streaming approach.
 * -------------------
 * The web client uses `fetch` + `response.body.getReader()` (ReadableStream).
 * React Native's fetch does NOT expose a ReadableStream on the response
 * body even in 2026 (RN 0.76 ships `text/event-stream` support for
 * `EventSource`, but ReadableStream is still polyfill-only). Two viable
 * approaches on RN:
 *
 *   1. XHR + responseType: 'text' + onProgress — `xhr.responseText` keeps
 *      growing during the stream. We slice the new portion on each
 *      progress event and parse complete SSE frames.
 *   2. `react-native-sse` — an EventSource polyfill that handles framing
 *      for us.
 *
 * We chose **approach 1**. No extra dependency, full control over the
 * frame parser (it's a 30-line cousin of the web's `nextFrameBoundary`),
 * and the back-pressure characteristics match RN's networking stack
 * exactly. Documented as a Sprint 7.3 deviation in CLAUDE.md.
 *
 * Per CLAUDE.md §3 we never send `institutionId` from the client; the
 * backend derives it from the JWT.
 *
 * Per CLAUDE.md §6 #1 we never call OpenAI/Anthropic directly from the
 * app — this module talks to apps/api only.
 */

import Constants from 'expo-constants';
import { apiFetchEnvelope, apiGet, apiPost } from './api';
import { getAccessToken } from './supabase';

// ---------------------------------------------------------------------------
// Wire types — keep aligned with the AiChatService output envelope.
// ---------------------------------------------------------------------------

export type AiChatCitation = {
  index: number;
  chapter?: string | null;
  topic?: string | null;
  syllabusName?: string | null;
  syllabusVersion?: string | null;
  pageNumber?: number | null;
};

export type AiChatMessageRole = 'USER' | 'ASSISTANT';

export type ServerChatMessage = {
  id: string;
  role: AiChatMessageRole;
  content: string;
  citations?: AiChatCitation[];
  createdAt: string;
};

export type ServerChatSession = {
  id: string;
  title: string | null;
  messageCount: number;
  lastMessageAt?: string | null;
  createdAt: string;
};

export type SessionDetail = {
  session: ServerChatSession;
  messages: ServerChatMessage[];
};

// ---------------------------------------------------------------------------
// REST helpers
// ---------------------------------------------------------------------------

export async function listSessions(
  classroomId: string,
  options?: { page?: number; limit?: number },
): Promise<{
  data: ServerChatSession[];
  meta: { page: number; limit: number; total: number };
}> {
  const params = new URLSearchParams();
  params.set('page', String(options?.page ?? 1));
  params.set('limit', String(options?.limit ?? 30));
  const result = await apiFetchEnvelope<ServerChatSession[]>(
    `/api/v1/classrooms/${classroomId}/ai/sessions?${params.toString()}`,
  );
  return {
    data: result.data ?? [],
    meta: {
      page: result.meta?.page ?? 1,
      limit: result.meta?.limit ?? 30,
      total: result.meta?.total ?? (result.data ?? []).length,
    },
  };
}

export async function getSession(
  classroomId: string,
  sessionId: string,
): Promise<SessionDetail> {
  return apiGet<SessionDetail>(
    `/api/v1/classrooms/${classroomId}/ai/sessions/${sessionId}`,
  );
}

export async function createSession(
  classroomId: string,
  options?: { title?: string },
): Promise<{ session: ServerChatSession }> {
  return apiPost<{ session: ServerChatSession }>(
    `/api/v1/classrooms/${classroomId}/ai/sessions`,
    options?.title ? { title: options.title.trim() } : {},
  );
}

// ---------------------------------------------------------------------------
// Streaming chat
// ---------------------------------------------------------------------------

export type ChatStreamToken = { type: 'token'; content: string };
export type ChatStreamUsage = {
  type: 'usage';
  promptTokens: number;
  completionTokens: number;
  model: string;
  citations?: AiChatCitation[];
};
export type ChatStreamError = {
  type: 'error';
  code: string;
  message: string;
};
export type ChatStreamEvent =
  | ChatStreamToken
  | ChatStreamUsage
  | ChatStreamError;

export type StreamChatOptions = {
  classroomId: string;
  sessionId: string;
  content: string;
  /** Pass `signal` from an AbortController so the caller can stop generation. */
  signal?: AbortSignal;
};

/**
 * Open a streaming POST and yield each parsed SSE event in order.
 *
 * Yields exactly one terminal event:
 *   - `{ type: 'usage', ... }` on successful completion
 *   - `{ type: 'error', ... }` on pre-flight failure or stream error
 *
 * Throws only on caller abort (the standard AbortError). Pre-flight HTTP
 * errors materialise as a single `error` event then the generator returns.
 */
export async function* streamChat(
  opts: StreamChatOptions,
): AsyncGenerator<ChatStreamEvent, void, undefined> {
  const url = `${resolveBaseUrl()}/api/v1/classrooms/${encodeURIComponent(
    opts.classroomId,
  )}/ai/sessions/${encodeURIComponent(opts.sessionId)}/chat`;

  const token = await getAccessToken();
  const xhrEvents: ChatStreamEvent[] = [];
  // Box the network-failure flag so TS doesn't narrow it to `null` after
  // the initial assignment (it's set inside xhr.onerror which fires later).
  const xhrErrorBox: { current: { code: string; message: string } | null } = {
    current: null,
  };
  let xhrComplete = false;
  let notify: (() => void) | null = null;
  const wait = () =>
    new Promise<void>((resolve) => {
      notify = () => {
        notify = null;
        resolve();
      };
    });

  const xhr = new XMLHttpRequest();
  let buffer = '';
  let lastIndex = 0;
  let abortListener: (() => void) | null = null;

  xhr.open('POST', url);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Accept', 'text/event-stream');
  if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

  // Pre-flight (non-2xx) errors come back as a JSON envelope.
  const flush = () => {
    if (notify) notify();
  };

  xhr.onprogress = () => {
    // `xhr.responseText` accumulates the full body; we only parse the
    // newly-received slice each tick. This keeps the parser linear in
    // total bytes received.
    const fullText = xhr.responseText;
    if (fullText.length <= lastIndex) return;
    const delta = fullText.slice(lastIndex);
    lastIndex = fullText.length;
    buffer += delta;

    // SSE frames are separated by a blank line (CRLF/CRLF or LF/LF).
    while (true) {
      const boundary = nextFrameBoundary(buffer);
      if (boundary.index === -1) break;
      const frame = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary.length);

      const dataLine = frame
        .split(/\r?\n/)
        .find((l) => l.startsWith('data:'));
      if (!dataLine) continue;
      const json = dataLine.slice('data:'.length).trim();
      if (!json) continue;
      try {
        const event = JSON.parse(json) as ChatStreamEvent;
        if (event && typeof event === 'object' && 'type' in event) {
          xhrEvents.push(event);
          flush();
        }
      } catch {
        // Ignore malformed frames (could be keep-alives).
      }
    }
  };

  xhr.onload = () => {
    // Pre-flight error path — the backend sends a normal JSON envelope
    // BEFORE switching to SSE on errors. Detect by HTTP status.
    if (xhr.status < 200 || xhr.status >= 300) {
      let code = `HTTP_${xhr.status}`;
      let message = xhr.statusText || 'Request failed';
      try {
        const parsed = JSON.parse(xhr.responseText || '{}') as {
          error?: { code?: string; message?: string };
        };
        if (parsed.error?.code) code = parsed.error.code;
        if (parsed.error?.message) message = parsed.error.message;
      } catch {
        // Body wasn't JSON — keep the HTTP fallback.
      }
      xhrEvents.push({ type: 'error', code, message });
    }
    xhrComplete = true;
    flush();
  };

  xhr.onerror = () => {
    xhrErrorBox.current = {
      code: 'NETWORK_ERROR',
      message: 'Could not reach Vaasenk AI. Check your connection and retry.',
    };
    xhrComplete = true;
    flush();
  };

  xhr.onabort = () => {
    xhrComplete = true;
    flush();
  };

  if (opts.signal) {
    if (opts.signal.aborted) {
      xhr.abort();
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }
    abortListener = () => xhr.abort();
    opts.signal.addEventListener('abort', abortListener);
  }

  try {
    xhr.send(JSON.stringify({ content: opts.content }));

    // Drain the event buffer as it fills.
    while (true) {
      while (xhrEvents.length > 0) {
        const next = xhrEvents.shift();
        if (next) yield next;
      }
      if (xhrErrorBox.current) {
        yield {
          type: 'error',
          code: xhrErrorBox.current.code,
          message: xhrErrorBox.current.message,
        };
        return;
      }
      if (xhrComplete) {
        // Drain any final batched events the onload pushed AFTER the last
        // flush in the same tick.
        while (xhrEvents.length > 0) {
          const next = xhrEvents.shift();
          if (next) yield next;
        }
        if (opts.signal?.aborted) {
          const err = new Error('aborted');
          err.name = 'AbortError';
          throw err;
        }
        return;
      }
      await wait();
    }
  } finally {
    if (opts.signal && abortListener) {
      opts.signal.removeEventListener('abort', abortListener);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mirrors api.ts's resolver so we don't depend on its private internals. */
function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  const fromExtra =
    (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  const raw = fromEnv ?? fromExtra ?? 'http://localhost:4000';
  return raw.replace(/\/$/, '');
}

/**
 * Locate the next SSE frame terminator (blank line). Returns the index plus
 * the byte length of the terminator so the caller can slice past it. Handles
 * both `\r\n\r\n` (canonical) and `\n\n` (common in Node servers).
 *
 * Identical algorithm to apps/web/src/lib/ai-chat-stream.ts.
 */
function nextFrameBoundary(buffer: string): { index: number; length: number } {
  const crlf = buffer.indexOf('\r\n\r\n');
  const lf = buffer.indexOf('\n\n');
  if (crlf === -1 && lf === -1) return { index: -1, length: 0 };
  if (crlf === -1) return { index: lf, length: 2 };
  if (lf === -1) return { index: crlf, length: 4 };
  return crlf < lf ? { index: crlf, length: 4 } : { index: lf, length: 2 };
}

/** Mandatory disclaimer copy per CLAUDE.md §6 #5. */
export const AI_DISCLAIMER = 'AI can make mistakes. Verify important information.';
