/**
 * Vaasenk Mobile — Auth context.
 *
 * Single source of truth for "who is signed in right now" across the app.
 * SplashScreen seeds it from SecureStore + /auth/me; Login mutates it on
 * successful sign-in; Profile drives logout. The root navigator subscribes
 * to `status` + `user` to decide which stack to mount.
 *
 * Status transitions:
 *   loading  -> authenticated | unauthenticated (after first me() resolves)
 *   unauthenticated -> authenticated            (after login())
 *   authenticated   -> unauthenticated          (after logout())
 *
 * NEVER read the user's role from any other place. The cache helper in
 * services/auth.ts is for the SPLASH boot path only — once the app is
 * running, this context is the truth.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { fetchMe, login as loginRequest, logout as logoutRequest } from './auth';
import { unregisterPushNotifications } from './push';
import { supabase } from './supabase';
import type { AuthUserView } from './auth-types';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUserView | null;
  /** Resolve and cache the current user from the backend. Safe to retry. */
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthUserView>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUserView | null>(null);

  const refresh = useCallback(async () => {
    // Check for an existing Supabase session first — avoids a 401 round-trip
    // when there's nothing to refresh against.
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setUser(null);
      setStatus('unauthenticated');
      return;
    }
    try {
      const me = await fetchMe();
      setUser(me.user);
      setStatus('authenticated');
    } catch {
      // Token might be stale or backend rejected the user (status change).
      // Force a clean unauthenticated state so the UI re-routes to Login.
      await supabase.auth.signOut().catch(() => undefined);
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Keep status in sync if the Supabase session changes from under us
  // (token expiry, multi-device sign-out, etc).
  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) {
          setUser(null);
          setStatus('unauthenticated');
        }
      },
    );
    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginRequest(email, password);
    setUser(result.user);
    setStatus('authenticated');
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    // Unregister the push device BEFORE we tear down the Supabase session,
    // otherwise the DELETE /users/me/devices/:id call would 401. Best-effort
    // — failures are swallowed inside unregisterPushNotifications so the
    // local sign-out always succeeds.
    await unregisterPushNotifications();
    await logoutRequest();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, refresh, login, logout }),
    [status, user, refresh, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return ctx;
}
