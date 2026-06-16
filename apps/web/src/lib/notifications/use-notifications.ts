'use client';

/**
 * `useNotifications` — central hook for the bell + center dropdown.
 *
 * Responsibilities:
 *   • Fetch the first page on mount (limit 20, ordered desc by createdAt).
 *   • Subscribe to Socket.IO and reconcile incoming events with local state.
 *   • Expose optimistic `markRead` / `markAllRead` actions.
 *   • Track `isConnected` / `isLoading` / `error` flags so the bell can pick
 *     the right visual state (default / loading / error / disabled).
 *
 * Architecture notes:
 *   • Single `useReducer` keeps every transition atomic (e.g. a brand-new
 *     notification arriving while we're optimistically marking another as
 *     read can't desync the unread counter).
 *   • The socket is created once per mount; cleanup runs `disconnect()`
 *     which removes every listener and tears the underlying transport.
 *   • The hook is safe to call from any client component in a
 *     `(dashboard)/layout.tsx` subtree — there's no provider required.
 *     We intentionally avoid React Context here because the bell is the
 *     only consumer for Sprint 6.2; if a standalone `/notifications` page
 *     is added later, this can be lifted to a provider trivially.
 */

import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './api';
import {
  createNotificationsSocket,
  type NotificationsSocketHandle,
  type SocketConnectionState,
} from './socket';
import type {
  NotificationCreatedEvent,
  NotificationUnreadCountEvent,
  NotificationView,
} from './types';

// -------------------------------------------------------------------------
// State + reducer
// -------------------------------------------------------------------------

type State = {
  notifications: NotificationView[];
  unreadTotal: number;
  isLoading: boolean;
  /** Discriminated error so the UI can show inline messages without `any`. */
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

    case 'ws:created': {
      // De-dupe — server could deliver the same payload to two reconnect
      // attempts within the same render tick.
      const next = action.payload;
      if (state.notifications.some((n) => n.id === next.id)) {
        return state;
      }
      const isUnread = next.readAt === null;
      return {
        ...state,
        notifications: [next, ...state.notifications],
        // Server will also push `notification:unread-count` shortly, but
        // optimistically bumping the badge here keeps the visual snappy.
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
      // Revert the optimistic write — restore readAt:null on the row.
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
// Hook
// -------------------------------------------------------------------------

export type UseNotificationsResult = {
  notifications: NotificationView[];
  unreadTotal: number;
  isLoading: boolean;
  isConnected: boolean;
  /** Lifecycle hint — useful for tooltips, not for control flow. */
  connectionState: SocketConnectionState;
  error: { message: string } | null;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refetch: () => Promise<void>;
};

export function useNotifications(): UseNotificationsResult {
  const [state, dispatch] = useReducer(reducer, initialState);
  // Hold the socket handle in a ref so we don't trigger renders when it
  // changes — only the connection-state callback should re-render the UI.
  const socketRef = useRef<NotificationsSocketHandle | null>(null);
  // We capture the previous unread total before any optimistic write so
  // a server-side rollback can restore the badge faithfully.
  const lastUnreadBeforeAllRead = useRef<number>(0);

  /**
   * Pull the first page from REST. Used on mount AND on user-driven retry
   * from the error state inside the dropdown.
   */
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
      // AbortError is a normal cleanup path — don't surface it as a
      // user-facing error. The standard DOMException name check works in
      // every modern browser plus Node's fetch.
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      const message =
        err instanceof Error
          ? err.message
          : 'We couldn’t load your notifications.';
      dispatch({ type: 'fetch:error', payload: { message } });
    }
  }, []);

  // ---- Initial fetch + socket lifecycle ---------------------------------
  useEffect(() => {
    const abort = new AbortController();
    fetchPage(abort.signal);

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

    return () => {
      abort.abort();
      handle.disconnect();
      socketRef.current = null;
    };
  }, [fetchPage]);

  // ---- Actions ----------------------------------------------------------

  const markRead = useCallback(async (id: string) => {
    dispatch({ type: 'mark-read:optimistic', payload: { id } });
    try {
      const updated = await markNotificationRead(id);
      dispatch({ type: 'mark-read:reconcile', payload: updated });
    } catch (err) {
      // Don't break the dropdown — keep the optimistic UI but log so the
      // bug surfaces in dev. The server may have already marked the row
      // read via a sibling tab, in which case the WS unread-count event
      // will reconcile shortly.
      // eslint-disable-next-line no-console
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
      // shortly; nothing more to do here. We don't fetch again — the
      // local optimistic state is already authoritative.
    } catch (err) {
      // eslint-disable-next-line no-console
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
