/**
 * Vaasenk Mobile — Socket.IO transport for the notifications bell (Sprint 7.4).
 *
 * Mirrors apps/web/src/lib/notifications/socket.ts. Same namespace, same
 * handshake, same event names — the only difference is that the access
 * token comes from the Expo Supabase client (SecureStore-backed) rather
 * than the browser client.
 *
 * The mobile transport complements but does NOT duplicate the OS push
 * channel:
 *
 *   Foreground (app open)   -> Socket.IO delivers the event, bell updates
 *                              immediately. OS push handler is installed
 *                              to suppress the banner (see push.ts —
 *                              installDefaultForegroundHandler) so the
 *                              user doesn't see "double-buzz".
 *   Background / locked     -> Socket.IO is disconnected. OS push handler
 *                              displays the banner via the Expo Push API.
 *                              On reopen, we reconnect the socket and
 *                              REST-fetch the first page to reconcile.
 *
 * The AppState listener handles flipping the foreground handler so the
 * user always gets exactly ONE notification surface per event.
 */

import { io, type Socket } from 'socket.io-client';
import Constants from 'expo-constants';
import { getAccessToken } from './supabase';
import {
  NOTIFICATION_EVENTS,
  type NotificationCreatedEvent,
  type NotificationUnreadCountEvent,
} from './notifications-types';

const baseUrl = (() => {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  const fromExtra =
    (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  const raw = fromEnv ?? fromExtra ?? 'http://localhost:4000';
  return raw.replace(/\/$/, '');
})();

export type SocketConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export type CreateNotificationsSocketArgs = {
  /** Called when a brand-new notification arrives on the user's socket. */
  onCreated: (event: NotificationCreatedEvent) => void;
  /** Called when the server pushes the authoritative unread count. */
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
 * Open a Socket.IO connection against the `/notifications` namespace.
 *
 * Returns a handle whose `.disconnect()` cleans up the socket and every
 * listener. Designed to be called from a `useEffect` cleanup path — see
 * {@link useNotifications}.
 *
 * Reconnect strategy: capped exponential backoff, infinite retries. The
 * bell stays warm across API deploys and mobile connectivity blips.
 * Server-initiated disconnects (`io server disconnect`) — usually means
 * the JWT was rejected — surface as `error` state so the UI can flag it.
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

  const url = `${baseUrl}/notifications`;

  const socket: Socket = io(url, {
    path: '/socket.io',
    // RN's native WebSocket implementation is solid — prefer it. Polling
    // fallback covers the (rare) case of an HTTP-only corporate proxy.
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    // Callback form: each reconnect pulls a FRESH token from the Supabase
    // session. Supabase rotates tokens before expiry and the previous one
    // would 401 the handshake.
    auth: (cb: (data: object) => void) => {
      getAccessToken()
        .then((token) => {
          cb(token ? { token } : {});
        })
        .catch(() => {
          // No token available — gateway will reject the handshake and
          // we'll show 'error' below via connect_error.
          cb({});
        });
    },
  });

  socket.on('connect', () => {
    setState('connected');
  });

  socket.on('disconnect', (reason: string) => {
    if (reason === 'io server disconnect') {
      setState('error');
    } else {
      setState('disconnected');
    }
  });

  socket.on('connect_error', () => {
    setState('error');
  });

  socket.on(
    NOTIFICATION_EVENTS.CREATED,
    (payload: NotificationCreatedEvent) => {
      args.onCreated(payload);
    },
  );

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
