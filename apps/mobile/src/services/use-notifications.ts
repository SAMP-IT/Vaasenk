/**
 * Vaasenk Mobile — useNotifications hook (Sprint 7.4).
 *
 * Centre of gravity for the bell + center sheet. Wires together four
 * surfaces into a single piece of state:
 *
 *   1. REST          — `GET /api/v1/notifications` for the initial list +
 *                      `meta.unreadTotal`. Also drives "Try again" retry.
 *   2. Socket.IO     — foreground real-time. Emits `notification:created`
 *                      and `notification:unread-count`. Always reconciles
 *                      with optimistic updates so the dropdown can't desync.
 *   3. Expo push     — `addNotificationReceivedListener` (OS-delivered
 *                      foreground notif — prepends to the list, increments
 *                      unread). `addNotificationResponseReceivedListener`
 *                      (user tapped the OS banner — dispatch to deep-link
 *                      router).
 *   4. AppState      — toggles the global notification handler between
 *                      "show banner" (background) and "silent badge"
 *                      (foreground) so the user sees exactly ONE surface
 *                      per event.
 *
 * The hook is intentionally NOT a context provider — for Sprint 7.4 the
 * bell is the only consumer, and the per-tab header pattern means each
 * tab subtree gets its own instance. If a standalone `/notifications`
 * screen is added later, this lifts trivially into a provider.
 *
 * Badge sync (iOS app icon + some Android launchers):
 *   - Every time `unreadTotal` changes we call `setBadgeCountAsync`.
 *   - On "mark all read" the badge clears to 0 immediately (optimistic).
 *
 * Tap routing:
 *   - When the user taps an OS-delivered notification while the app is
 *     backgrounded, iOS/Android wake the JS thread and fire the response
 *     listener. We dispatch to the navigationRef-aware deep-link router
 *     passed in by the caller via `onResponse`.
 *   - Initial response (cold-start from a tap) is also surfaced via
 *     `getLastNotificationResponseAsync`. We invoke `onResponse` once on
 *     mount if present so deep-links from a killed-app launch work.
 */

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './notifications-api';
import {
  createNotificationsSocket,
  type NotificationsSocketHandle,
  type SocketConnectionState,
} from './notifications-socket';
import {
  installBackgroundForegroundHandler,
  installDefaultForegroundHandler,
} from './push';
import type {
  NotificationCreatedEvent,
  NotificationUnreadCountEvent,
  NotificationView,
  PushNotificationData,
} from './notifications-types';

// -------------------------------------------------------------------------
// State + reducer
// -------------------------------------------------------------------------

type State = {
  notifications: NotificationView[];
  unreadTotal: number;
  isLoading: boolean;
  error: { message: string } | null;
  connectionState: SocketConnectionState;
};

type Action =
  | { type: 'fetch:start' }
  | {
      type: 'fetch:success';
      payload: { notifications: NotificationView[]; unreadTotal: number };
    }
  | { type: 'fetch:error'; payload: { message: string } }
  | { type: 'ws:created'; payload: NotificationView }
  | { type: 'ws:unread-count'; payload: number }
  | { type: 'ws:connection'; payload: SocketConnectionState }
  | { type: 'os:received'; payload: NotificationView }
  | { type: 'mark-read:optimistic'; payload: { id: string } }
  | { type: 'mark-read:reconcile'; payload: NotificationView }
  | { type: 'mark-read:rollback'; payload: { id: string } }
  | { type: 'mark-all-read:optimistic' }
  | { type: 'mark-all-read:rollback'; payload: { unreadTotal: number } };

const initialState: State = {
  notifications: [],
  unreadTotal: 0,
  isLoading: true,
  error: null,
  connectionState: 'idle',
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'fetch:start':
      return { ...state, isLoading: true, error: null };

    case 'fetch:success':
      return {
        ...state,
        notifications: action.payload.notifications,
        unreadTotal: action.payload.unreadTotal,
        isLoading: false,
        error: null,
      };

    case 'fetch:error':
      return { ...state, isLoading: false, error: action.payload };

    case 'ws:created':
    case 'os:received': {
      // De-dupe — Socket.IO might deliver the same payload that the OS
      // push handler already inserted, and vice versa. Same id, same row.
      const next = action.payload;
      if (state.notifications.some((n) => n.id === next.id)) {
        return state;
      }
      const isUnread = next.readAt === null;
      return {
        ...state,
        notifications: [next, ...state.notifications],
        unreadTotal: isUnread ? state.unreadTotal + 1 : state.unreadTotal,
      };
    }

    case 'ws:unread-count':
      return { ...state, unreadTotal: action.payload };

    case 'ws:connection':
      return { ...state, connectionState: action.payload };

    case 'mark-read:optimistic': {
      const { id } = action.payload;
      const target = state.notifications.find((n) => n.id === id);
      if (!target || target.readAt !== null) return state;
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
        ),
        unreadTotal: Math.max(0, state.unreadTotal - 1),
      };
    }

    case 'mark-read:reconcile': {
      const updated = action.payload;
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === updated.id ? updated : n,
        ),
      };
    }

    case 'mark-read:rollback': {
      const { id } = action.payload;
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, readAt: null } : n,
        ),
        unreadTotal: state.unreadTotal + 1,
      };
    }

    case 'mark-all-read:optimistic': {
      const now = new Date().toISOString();
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.readAt === null ? { ...n, readAt: now } : n,
        ),
        unreadTotal: 0,
      };
    }

    case 'mark-all-read:rollback':
      return { ...state, unreadTotal: action.payload.unreadTotal };

    default:
      return state;
  }
}

// -------------------------------------------------------------------------
// OS push -> NotificationView projection
// -------------------------------------------------------------------------

/**
 * Project an Expo `Notification` (the runtime shape an OS push delivers
 * to the foreground listener) into a `NotificationView` so we can prepend
 * it to the list without a REST round-trip.
 *
 * Push payloads strip metadata to stay under the 4KB cap — `metadata` is
 * always null here. The bell sheet handles that gracefully; the row is
 * still readable and tappable, and a re-fetch on next mount will fill in
 * any missing context.
 *
 * Returns null when the payload doesn't carry our `data.notificationId` —
 * that means it's not a Vaasenk push (could be a system locale-changed
 * notification or similar) and we shouldn't touch the list.
 */
function projectOsNotification(
  expoNotification: Notifications.Notification,
): NotificationView | null {
  const data = expoNotification.request.content.data as
    | Partial<PushNotificationData>
    | undefined;
  if (!data || typeof data.notificationId !== 'string') return null;

  return {
    id: data.notificationId,
    type: (data.type ?? 'SYSTEM_ANNOUNCEMENT') as NotificationView['type'],
    title: expoNotification.request.content.title ?? '',
    body: expoNotification.request.content.body ?? null,
    link: data.link ?? null,
    metadata: null,
    readAt: null,
    entityType: data.entityType ?? null,
    entityId: data.entityId ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function extractPushData(
  expoNotification: Notifications.Notification | null | undefined,
): PushNotificationData | null {
  if (!expoNotification) return null;
  const data = expoNotification.request.content.data as
    | Partial<PushNotificationData>
    | undefined;
  if (!data || typeof data.notificationId !== 'string') return null;
  return {
    notificationId: data.notificationId,
    type: (data.type ?? 'SYSTEM_ANNOUNCEMENT') as PushNotificationData['type'],
    entityType: data.entityType ?? null,
    entityId: data.entityId ?? null,
    link: data.link ?? null,
  };
}

// -------------------------------------------------------------------------
// Hook
// -------------------------------------------------------------------------

export type UseNotificationsArgs = {
  /**
   * Whether the user is signed in. When false, the hook short-circuits —
   * no REST fetch, no socket. Used by callers in the auth-gated header.
   */
  enabled: boolean;
  /**
   * Invoked when the user taps an OS-delivered notification banner OR a
   * cold-start tap delivers an initial response. The callee owns the
   * deep-link routing — this hook stays UI-agnostic.
   */
  onResponse?: (data: PushNotificationData) => void;
};

export type UseNotificationsResult = {
  notifications: NotificationView[];
  unreadTotal: number;
  isLoading: boolean;
  isConnected: boolean;
  connectionState: SocketConnectionState;
  error: { message: string } | null;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refetch: () => Promise<void>;
};

export function useNotifications(
  args: UseNotificationsArgs,
): UseNotificationsResult {
  const { enabled, onResponse } = args;
  const [state, dispatch] = useReducer(reducer, initialState);
  const socketRef = useRef<NotificationsSocketHandle | null>(null);
  const lastUnreadBeforeAllRead = useRef<number>(0);
  // Hold the latest onResponse callback in a ref so the response listener
  // can stay subscribed across renders without re-binding the OS listener.
  const onResponseRef = useRef<typeof onResponse>(onResponse);
  onResponseRef.current = onResponse;

  // -----------------------------------------------------------------
  // REST fetch
  // -----------------------------------------------------------------
  const fetchPage = useCallback(async (signal?: AbortSignal) => {
    dispatch({ type: 'fetch:start' });
    try {
      const response = await listNotifications({
        page: 1,
        limit: 20,
        ...(signal ? { signal } : {}),
      });
      dispatch({
        type: 'fetch:success',
        payload: {
          notifications: response.data,
          unreadTotal: response.meta.unreadTotal,
        },
      });
    } catch (err) {
      // AbortError on cleanup — silent.
      if (
        err instanceof Error &&
        (err.name === 'AbortError' || err.message === 'Aborted')
      ) {
        return;
      }
      const message =
        err instanceof Error
          ? err.message
          : "We couldn't load your notifications.";
      dispatch({ type: 'fetch:error', payload: { message } });
    }
  }, []);

  // -----------------------------------------------------------------
  // Mount: REST fetch + Socket.IO + OS listeners + AppState
  // -----------------------------------------------------------------
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const abort = new AbortController();
    void fetchPage(abort.signal);

    // ---- Socket.IO -----------------------------------------------
    const handle = createNotificationsSocket({
      onCreated: (event: NotificationCreatedEvent) => {
        dispatch({ type: 'ws:created', payload: event.notification });
      },
      onUnreadCount: (event: NotificationUnreadCountEvent) => {
        dispatch({ type: 'ws:unread-count', payload: event.unreadTotal });
      },
      onConnectionChange: (s: SocketConnectionState) => {
        dispatch({ type: 'ws:connection', payload: s });
      },
    });
    socketRef.current = handle;

    // ---- OS push: foreground received ----------------------------
    // Fires when a push arrives while the app is in the foreground.
    // The OS banner is suppressed (see installDefaultForegroundHandler);
    // we surface the row in the in-app list instead.
    const receivedSub = Notifications.addNotificationReceivedListener(
      (expoNotif) => {
        const view = projectOsNotification(expoNotif);
        if (view) {
          dispatch({ type: 'os:received', payload: view });
        }
      },
    );

    // ---- OS push: user tapped the banner -------------------------
    const responseSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = extractPushData(response.notification);
        if (data) {
          onResponseRef.current?.(data);
        }
      },
    );

    // ---- Cold-start tap -------------------------------------------
    // If the app was killed and the user tapped a notification to launch
    // it, this resolves once on mount with the response. Fires AFTER the
    // OS listener is registered so we don't miss the warm-start case.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        const data = extractPushData(response.notification);
        if (data) {
          onResponseRef.current?.(data);
        }
      })
      .catch(() => {
        // Non-fatal — initial-response surface is best-effort.
      });

    // ---- AppState: flip foreground handler ----------------------
    // Foreground = silent (socket delivers UI updates).
    // Backgrounded = show banner (push delivers updates).
    installDefaultForegroundHandler();

    const handleAppStateChange = (next: AppStateStatus) => {
      if (next === 'active') {
        installDefaultForegroundHandler();
      } else {
        installBackgroundForegroundHandler();
      }
    };
    const appStateSub = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );

    return () => {
      abort.abort();
      handle.disconnect();
      socketRef.current = null;
      receivedSub.remove();
      responseSub.remove();
      appStateSub.remove();
    };
  }, [enabled, fetchPage]);

  // -----------------------------------------------------------------
  // Badge sync (iOS + Android launchers that honour it)
  // -----------------------------------------------------------------
  useEffect(() => {
    Notifications.setBadgeCountAsync(state.unreadTotal).catch(() => {
      // Some Android launchers reject the call silently — not fatal.
    });
  }, [state.unreadTotal]);

  // -----------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------
  const markRead = useCallback(async (id: string) => {
    dispatch({ type: 'mark-read:optimistic', payload: { id } });
    try {
      const updated = await markNotificationRead(id);
      dispatch({ type: 'mark-read:reconcile', payload: updated });
    } catch (err) {
       
      console.warn('[notifications] markRead failed:', err);
      dispatch({ type: 'mark-read:rollback', payload: { id } });
      throw err;
    }
  }, []);

  const markAllRead = useCallback(async () => {
    lastUnreadBeforeAllRead.current = state.unreadTotal;
    dispatch({ type: 'mark-all-read:optimistic' });
    try {
      await markAllNotificationsRead();
      // Server will push notification:unread-count: { unreadTotal: 0 }
      // shortly; nothing more to do here.
    } catch (err) {
       
      console.warn('[notifications] markAllRead failed:', err);
      dispatch({
        type: 'mark-all-read:rollback',
        payload: { unreadTotal: lastUnreadBeforeAllRead.current },
      });
      throw err;
    }
  }, [state.unreadTotal]);

  const refetch = useCallback(async () => {
    await fetchPage();
  }, [fetchPage]);

  return {
    notifications: state.notifications,
    unreadTotal: state.unreadTotal,
    isLoading: state.isLoading,
    isConnected: state.connectionState === 'connected',
    connectionState: state.connectionState,
    error: state.error,
    markRead,
    markAllRead,
    refetch,
  };
}
