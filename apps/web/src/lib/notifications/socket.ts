/**
 * Socket.IO transport for the notifications bell — Sprint 6.2.
 *
 * The backend gateway lives at:
 *
 *   <NEXT_PUBLIC_API_URL>/notifications      (namespace `notifications`)
 *
 * with the Engine.IO path defaulting to `/socket.io`. The handshake reads
 * the Supabase JWT from `auth.token` (preferred), `?token=` query, or the
 * `Authorization: Bearer …` header. On reconnect Supabase may have rotated
 * the token, so we resolve it ON EACH attempt via a callback.
 *
 * Failure modes the callers must handle:
 *   • Reconnect storm — capped by Socket.IO's exponential backoff; we set
 *     `reconnection: true` with `reconnectionAttempts: Infinity` so the
 *     bell stays warm if the API blips during a deploy.
 *   • Auth error — the gateway emits a synthetic `error` event then
 *     `disconnect(true)`s the socket. The client surfaces this via
 *     `onConnectionChange('disconnected')` and stops trying for one cycle.
 */

import { io, type Socket } from 'socket.io-client';
import { createClient as createBrowserSupabase } from '../supabase/client';
import {
  NOTIFICATION_EVENTS,
  type NotificationCreatedEvent,
  type NotificationUnreadCountEvent,
} from './types';

const baseUrl = (() => {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  return raw.replace(/\/$/, '');
})();

export type SocketConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export type CreateNotificationsSocketArgs = {
  /**
   * Called when a brand-new notification arrives on the user's socket.
   * Payload is the full {@link NotificationView}.
   */
  onCreated: (event: NotificationCreatedEvent) => void;
  /**
   * Called when the server pushes the authoritative unread count. The
   * server sends this on connect AND after any mark-as-read operation
   * succeeds, so the badge stays in sync without a REST round-trip.
   */
  onUnreadCount: (event: NotificationUnreadCountEvent) => void;
  /** Connection lifecycle — used by the bell to show a tiny status hint. */
  onConnectionChange?: (state: SocketConnectionState) => void;
};

export type NotificationsSocketHandle = {
  /** Disconnect the socket and remove every listener. Idempotent. */
  disconnect: () => void;
  /** Force a reconnect immediately (e.g. after the user signs back in). */
  reconnect: () => void;
  /** Read-only — current Socket.IO connection state. */
  getState: () => SocketConnectionState;
};

/**
 * Resolves the current Supabase access token. Returns `null` when the user
 * is signed out — the caller short-circuits and never opens the socket in
 * that case.
 */
async function resolveAccessToken(): Promise<string | null> {
  const supabase = createBrowserSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

/**
 * Open a Socket.IO connection against the `/notifications` namespace.
 *
 * Returns a handle whose `.disconnect()` cleans up the socket and every
 * listener. Designed to be called from a `useEffect` cleanup path — see
 * {@link useNotifications}.
 */
export function createNotificationsSocket(
  args: CreateNotificationsSocketArgs,
): NotificationsSocketHandle {
  let state: SocketConnectionState = 'idle';
  const setState = (next: SocketConnectionState) => {
    if (state === next) return;
    state = next;
    args.onConnectionChange?.(state);
  };

  setState('connecting');

  // `${baseUrl}/notifications` resolves to the namespace; the path stays
  // at the default `/socket.io`. socket.io-client treats the path segment
  // as the namespace name when there's no explicit `path` option.
  const url = `${baseUrl}/notifications`;

  const socket: Socket = io(url, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    // Use the callback form so reconnect attempts always pull a FRESH
    // token from the Supabase session — Supabase rotates the access
    // token before expiry and the previous one would 401 the handshake.
    auth: (cb: (data: object) => void) => {
      resolveAccessToken()
        .then((token) => {
          cb(token ? { token } : {});
        })
        .catch(() => {
          // If we can't fetch a token, send an empty auth payload — the
          // gateway will reject the handshake with UNAUTHORIZED and the
          // `connect_error` handler below flips state to 'error'.
          cb({});
        });
    },
    // Keep the handshake header path available too — some corporate
    // proxies strip the Engine.IO auth packet. The token is the same in
    // both places; the server reads whichever arrives first.
    // Note: extraHeaders cannot be set asynchronously, so we rely on the
    // auth callback as the primary path.
  });

  socket.on('connect', () => {
    setState('connected');
  });

  socket.on('disconnect', (reason: string) => {
    // Server-initiated disconnect (e.g. invalid token) means we should
    // surface 'error' so the UI can flag the bell. Client-initiated
    // (`io client disconnect`) is the normal cleanup path. socket.io
    // exports DisconnectReason as a namespaced union; we use the string
    // form here to avoid an extra type import.
    if (reason === 'io server disconnect') {
      setState('error');
    } else {
      setState('disconnected');
    }
  });

  socket.on('connect_error', () => {
    setState('error');
  });

  socket.on(NOTIFICATION_EVENTS.CREATED, (payload: NotificationCreatedEvent) => {
    args.onCreated(payload);
  });

  socket.on(
    NOTIFICATION_EVENTS.UNREAD_COUNT,
    (payload: NotificationUnreadCountEvent) => {
      args.onUnreadCount(payload);
    },
  );

  return {
    disconnect: () => {
      socket.removeAllListeners();
      socket.disconnect();
      setState('disconnected');
    },
    reconnect: () => {
      setState('connecting');
      socket.connect();
    },
    getState: () => state,
  };
}
