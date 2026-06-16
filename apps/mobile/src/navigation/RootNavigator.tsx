/**
 * Vaasenk Mobile — Root navigator (acts as the role gate).
 *
 * Reads the auth context and renders ONE of:
 *   - Splash      — while we're still resolving the session at cold start.
 *   - AuthStack   — when there is no session.
 *   - StudentTabs — authenticated as STUDENT.
 *   - TeacherTabs — authenticated as TEACHER.
 *   - AdminBlocked — authenticated as ADMIN / SUPER_ADMIN (web-only).
 *
 * Re-mounts the correct subgraph automatically when auth status / role
 * changes (e.g. logout). React Navigation handles the transition via
 * NavigationContainer-level rerender — no manual reset() needed.
 *
 * Sprint 7.4: when the user is authenticated as STUDENT or TEACHER we
 * also:
 *   1. Register the Expo push device token once via push.ts (best-effort,
 *      non-blocking). The result is stashed in SecureStore so sign-out
 *      can DELETE the row.
 *   2. Mount a NotificationsProvider over the tab subtree so every bell
 *      in every tab header shares one socket + one OS push listener.
 *   3. Wire deep-link routing from the OS-tapped push back into the
 *      navigation ref so a backgrounded user landing on the app via a
 *      banner tap ends up on the correct screen.
 */

import { useCallback, useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AdminBlockedScreen } from '@/screens/auth/AdminBlockedScreen';
import { SplashScreen } from '@/screens/auth/SplashScreen';
import { useAuth } from '@/services/auth-context';
import { NotificationsProvider } from '@/services/notifications-context';
import {
  getDeepLinkForNotification,
  type DeepLinkTarget,
} from '@/services/push-links';
import { registerForPushNotifications } from '@/services/push';
import { stackForRole } from '@/services/role';
import type { PushNotificationData } from '@/services/notifications-types';
import { AuthStack } from './AuthStack';
import { navigationRef } from './navigation-ref';
import { StudentTabs } from './StudentTabs';
import { TeacherTabs } from './TeacherTabs';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Dispatch a deep-link target into the active navigator. The target's
 * shape matches React Navigation's nested-stack params descriptor exactly
 * — `navigate(stack, { screen, params })` walks the nesting for us.
 *
 * No-op when the navigation ref isn't ready (e.g. cold-start tap arriving
 * before the container has mounted) — we retry once on each render of the
 * NotificationsProvider, which sees the resolved ref on its first effect.
 */
function dispatchDeepLink(target: DeepLinkTarget): void {
  if (!navigationRef.isReady()) return;
  // The discriminated DeepLinkTarget makes TS unhappy when the navigate
  // overloads are checked against the union. Cast the entire callable at
  // the boundary — the shape is correct by construction (see push-links.ts)
  // and React Navigation accepts (routeName, params) at runtime.
  const navigate = navigationRef.navigate as unknown as (
    name: string,
    params: object,
  ) => void;
  navigate(target.stack, target.params);
}

export function RootNavigator() {
  const { status, user } = useAuth();

  // -------------------------------------------------------------------
  // Push registration — called once per authenticated session.
  // -------------------------------------------------------------------
  useEffect(() => {
    if (status !== 'authenticated' || !user) return;
    if (user.role !== 'STUDENT' && user.role !== 'TEACHER') return;
    // Fire and forget — the function returns a discriminated result so
    // the caller can log if needed, but the UI doesn't block on it.
    registerForPushNotifications()
      .then((result) => {
        if (__DEV__ && result.status !== 'registered') {
           
          console.info('[push] registration result:', result.status, result);
        }
      })
      .catch((err) => {
         
        console.warn('[push] registration threw:', err);
      });
  }, [status, user]);

  // -------------------------------------------------------------------
  // Deep-link tap handler — passed to NotificationsProvider so the OS
  // push response (foreground or cold-start) routes into the right tab.
  // -------------------------------------------------------------------
  const handleNotificationResponse = useCallback(
    (data: PushNotificationData) => {
      if (!user) return;
      const target = getDeepLinkForNotification(data, user.role);
      if (target) {
        dispatchDeepLink(target);
      }
    },
    [user],
  );

  // First-paint loading: show Splash so the user never sees a blank tree.
  if (status === 'loading') {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Splash" component={SplashScreen} />
      </Stack.Navigator>
    );
  }

  if (status === 'unauthenticated' || !user) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Auth" component={AuthStack} />
      </Stack.Navigator>
    );
  }

  const target = stackForRole(user.role);

  // Admin sessions don't get the notifications surface (web-only). The
  // AdminBlocked screen short-circuits to a sign-out CTA.
  if (target === 'admin-blocked') {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="AdminBlocked" component={AdminBlockedScreen} />
      </Stack.Navigator>
    );
  }

  // Student + Teacher both get the NotificationsProvider wrapper. One
  // socket, one OS listener, one badge sync — shared across every bell
  // mounted in every tab header.
  return (
    <NotificationsProvider
      enabled={status === 'authenticated'}
      onResponse={handleNotificationResponse}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {target === 'student' && (
          <Stack.Screen name="StudentTabs" component={StudentTabs} />
        )}
        {target === 'teacher' && (
          <Stack.Screen name="TeacherTabs" component={TeacherTabs} />
        )}
      </Stack.Navigator>
    </NotificationsProvider>
  );
}
