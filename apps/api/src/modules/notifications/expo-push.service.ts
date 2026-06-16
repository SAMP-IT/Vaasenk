import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationType } from '@prisma/client';
import { EnvConfig } from '../../config/env.config';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Expo Push API integration — Sprint 7.4.
 *
 * Why we don't pull in `expo-server-sdk`
 * --------------------------------------
 * The official SDK adds ~60kb plus another transitive dep tree just to wrap
 * a single REST endpoint. The wire format (POST JSON array, parse `data[i]`
 * receipts, watch for `details.error === 'DeviceNotRegistered'`) is small
 * enough that hand-rolling it keeps the install lean and lets us tailor the
 * error-handling to our own `device_tokens` cleanup path. If a future
 * requirement (sandboxed receipt polling, getReceiptIds, etc.) makes the
 * SDK worth it, swap in then.
 *
 * What this service guarantees
 * ----------------------------
 *  1. Chunks message arrays to Expo's documented 100-per-request limit.
 *  2. Sends each chunk via `https://exp.host/--/api/v2/push/send` with the
 *     `Accept: application/json` + optional `Authorization: Bearer …`
 *     headers Expo's "Enhanced security" mode expects.
 *  3. Iterates the per-message ticket receipts and deletes `device_tokens`
 *     rows whose Expo response shows `DeviceNotRegistered`. Other transient
 *     failures (`MessageRateExceeded`, `MessageTooBig`) are logged and left
 *     in place — the next push will retry.
 *  4. NEVER throws past the service boundary. A push failure must not
 *     poison the original in-app notify path; callers can `.catch` for
 *     logging but no path inside `NotificationsService.notify` waits on
 *     this.
 *
 * Multi-tenant note
 * -----------------
 * Token cleanup is done by `expoPushToken` equality, which is globally
 * unique. We don't need to filter on `institutionId` for the DELETE — but
 * the rows are tenant-tagged anyway because the inserting code path
 * (UsersService.registerDevice) only ever writes JWT-trusted ids.
 */

/** Maximum messages per Expo push API call — Expo's documented limit. */
const EXPO_PUSH_CHUNK_SIZE = 100;

/** Endpoint per https://docs.expo.dev/push-notifications/sending-notifications/ */
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** HTTP timeout for a single chunk send. */
const EXPO_PUSH_TIMEOUT_MS = 10_000;

/**
 * Android channel id routing. Mirrors the channel set the mobile agent will
 * create with `Notifications.setNotificationChannelAsync(...)` on first boot.
 * Per CLAUDE.md §4 + Playbook Prompt 27 these are:
 *
 *   "notes"  — note publishes (high importance, default sound)
 *   "ai"     — AI credit warnings, generation completes (default importance)
 *   "system" — everything else (default importance)
 *
 * iOS ignores channelId entirely; it's safe to set unconditionally.
 */
const NOTIFICATION_CHANNEL_BY_TYPE: Record<NotificationType, string> = {
  // Active types — what the Sprint 6.1 callers actually emit.
  NOTE_PUBLISHED: 'notes',
  PAPER_GENERATED: 'system',
  PAPER_FAILED: 'system',
  SYLLABUS_READY: 'system',
  SYLLABUS_FAILED: 'system',
  CLASSROOM_JOINED: 'system',
  AI_CREDITS_LOW: 'ai',
  SYSTEM_ANNOUNCEMENT: 'system',
  DOUBT_RECEIVED: 'system',
  DOUBT_REPLIED: 'system',
  // Legacy values — never emitted by current code but kept in the map so
  // the type check is exhaustive and a future stray `notify` call with a
  // legacy type still routes somewhere safe.
  PAPER_READY: 'system',
  AI_READY: 'system',
  SYLLABUS_PROCESSED: 'system',
  CLASSROOM_INVITE: 'system',
  SYSTEM: 'system',
};

/**
 * Shape of one Expo push message we send. Mirrors the documented Expo
 * payload — the mobile agent's `expo-notifications` handler reads `data.*`
 * to deep-link into the right screen.
 */
export interface ExpoPushMessage {
  to: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  channelId?: string;
  sound?: 'default' | null;
  badge?: number;
  priority?: 'default' | 'normal' | 'high';
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: {
    error?:
      | 'DeviceNotRegistered'
      | 'MessageTooBig'
      | 'MessageRateExceeded'
      | 'MismatchSenderId'
      | 'InvalidCredentials'
      | string;
  };
}

interface ExpoPushResponseEnvelope {
  data?: ExpoPushTicket[];
  errors?: Array<{ code: string; message: string }>;
}

@Injectable()
export class ExpoPushService {
  private readonly logger = new Logger(ExpoPushService.name);
  private readonly accessToken: string | undefined;

  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly prisma: PrismaService,
  ) {
    // The token is optional — Expo only requires it when the project has
    // "Enhanced push security" turned on. Without it, calls go through
    // unauthenticated which is fine for dev + small-scale prod.
    this.accessToken = this.config.get('EXPO_ACCESS_TOKEN', { infer: true });
  }

  /**
   * Build the channel id for a notification type. Exposed so the worker
   * (which runs the same logic without DI from outside) stays consistent.
   */
  channelFor(type: NotificationType): string {
    return NOTIFICATION_CHANNEL_BY_TYPE[type] ?? 'system';
  }

  /**
   * Fire-and-forget-safe entry point. Splits the messages into ≤100-message
   * chunks, sends each chunk, collects the failed-receipt tokens, and
   * cleans the database. Returns a small summary for logging — callers
   * should NOT block on this Promise in the request path.
   *
   * If the EXPO_ACCESS_TOKEN env var is set, it's attached as a Bearer
   * header on every chunk.
   */
  async sendBatch(messages: ExpoPushMessage[]): Promise<{
    sent: number;
    failedTransient: number;
    failedPermanent: number;
  }> {
    if (messages.length === 0) {
      return { sent: 0, failedTransient: 0, failedPermanent: 0 };
    }

    const chunks: ExpoPushMessage[][] = [];
    for (let i = 0; i < messages.length; i += EXPO_PUSH_CHUNK_SIZE) {
      chunks.push(messages.slice(i, i + EXPO_PUSH_CHUNK_SIZE));
    }

    let sent = 0;
    let failedTransient = 0;
    let failedPermanent = 0;
    const tokensToInvalidate: string[] = [];

    for (const chunk of chunks) {
      try {
        const tickets = await this.sendChunk(chunk);
        // Tickets line up 1:1 with the messages in the chunk. We pair them
        // so we can map a `DeviceNotRegistered` back to its `to` token.
        for (let i = 0; i < tickets.length; i += 1) {
          const ticket = tickets[i];
          const msg = chunk[i];
          if (!ticket || !msg) continue;
          if (ticket.status === 'ok') {
            sent += 1;
            continue;
          }
          const code = ticket.details?.error;
          if (code === 'DeviceNotRegistered') {
            failedPermanent += 1;
            tokensToInvalidate.push(msg.to);
          } else {
            failedTransient += 1;
            this.logger.warn(
              `Expo push transient failure (${code ?? 'unknown'}): ` +
                (ticket.message ?? '(no message)'),
            );
          }
        }
      } catch (err) {
        // A whole chunk failed (network error, 5xx, timeout). We can't tell
        // which messages would have succeeded; count them as transient and
        // move on. The notification row + Socket.IO emit already happened
        // synchronously inside notify/notifyMany so the user isn't blocked.
        failedTransient += chunk.length;
        this.logger.error(
          `Expo push chunk failed (${chunk.length} messages): ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    if (tokensToInvalidate.length > 0) {
      await this.invalidateTokens(tokensToInvalidate);
    }

    return { sent, failedTransient, failedPermanent };
  }

  /**
   * Synchronous send of one chunk. Throws on transport errors so the caller
   * (`sendBatch`) can decide whether the failure is transient or terminal.
   */
  private async sendChunk(chunk: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    };
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    // Native fetch (Node 20+) — no third-party HTTP client needed.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EXPO_PUSH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(chunk),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '(unreadable)');
      throw new Error(
        `Expo push API returned ${response.status}: ${text.slice(0, 500)}`,
      );
    }

    const payload = (await response.json()) as ExpoPushResponseEnvelope;

    // Top-level errors (e.g. malformed body, bearer rejected).
    if (payload.errors && payload.errors.length > 0) {
      const summary = payload.errors
        .map((e) => `${e.code}: ${e.message}`)
        .join('; ');
      throw new Error(`Expo push API rejected the batch: ${summary}`);
    }

    return Array.isArray(payload.data) ? payload.data : [];
  }

  /**
   * Removes device_token rows whose Expo response indicated the token is
   * no longer registered (uninstall, fresh install, etc.). Safe to call
   * with zero tokens (no-op) and with duplicates (deleteMany is set-based).
   */
  private async invalidateTokens(tokens: string[]): Promise<void> {
    const unique = [...new Set(tokens)];
    try {
      const result = await this.prisma.deviceToken.deleteMany({
        where: { expoPushToken: { in: unique } },
      });
      if (result.count > 0) {
        this.logger.log(
          `Pruned ${result.count} device token(s) flagged DeviceNotRegistered by Expo`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Failed to prune stale device tokens: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }
}
