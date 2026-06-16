/**
 * Vaasenk Mobile — Notifications context provider (Sprint 7.4).
 *
 * Hosts ONE instance of `useNotifications` for the entire authenticated
 * subtree. Without this, the bell rendered in each tab header would spin
 * up its own socket + REST fetch + OS listeners on mount — N copies of
 * the same state.
 *
 * The provider is mounted in RootNavigator above the TabNavigator, scoped
 * to the authenticated user. When the user signs out, the provider
 * unmounts (RootNavigator swaps to AuthStack), the underlying socket
 * disconnects via the useEffect cleanup, and the OS push listeners are
 * removed. On next sign-in a fresh provider mounts.
 *
 * `useNotificationsContext()` throws when called outside the provider —
 * forces a clear stack trace in dev if a screen accidentally renders the
 * bell on the unauth side of the navigator.
 */

import {
  createContext,
  useContext,
  type ReactNode,
} from 'react';
import {
  useNotifications,
  type UseNotificationsArgs,
  type UseNotificationsResult,
} from './use-notifications';

const NotificationsContext = createContext<UseNotificationsResult | null>(null);

type Props = UseNotificationsArgs & {
  children: ReactNode;
};

export function NotificationsProvider({
  children,
  enabled,
  onResponse,
}: Props) {
  const value = useNotifications({ enabled, onResponse });
  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotificationsContext(): UseNotificationsResult {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error(
      'useNotificationsContext must be used inside <NotificationsProvider>.',
    );
  }
  return ctx;
}
