/**
 * Vaasenk Mobile — Auth service.
 *
 * Thin wrapper around the API client and the Supabase client. Encapsulates
 * the login / logout / refresh flow so screens don't need to know that:
 *   1. Login is API-mediated (POST /auth/login) — NOT a direct Supabase
 *      call. The backend validates and returns a Supabase session payload.
 *   2. After login, we hydrate the Supabase client with `setSession` so
 *      subsequent API calls can read the token via SecureStore (see
 *      services/supabase.ts).
 *   3. Role is cached separately in SecureStore so cold-start splash can
 *      route without a network round-trip (then revalidates against
 *      /auth/me in the background).
 *
 * This mirrors the web pattern (memory: vaasenk-auth-architecture).
 */

import * as SecureStore from 'expo-secure-store';
import { apiPost, apiGet } from './api';
import { supabase } from './supabase';
import type { LoginResponse, MeResponse, UserRole } from './auth-types';

const ROLE_CACHE_KEY = 'vaasenk-role';

export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  // Backend validates credentials and returns a Supabase session bundle.
  // CLAUDE.md §3: the institutionId comes back baked into the access token
  // via Supabase app_metadata — we never pass it in the request body.
  const result = await apiPost<LoginResponse>(
    '/api/v1/auth/login',
    { email, password },
    { unauthenticated: true },
  );

  // Hydrate the Supabase client so future requests pick up the session.
  // setSession persists to SecureStore via our storage adapter.
  const { error } = await supabase.auth.setSession({
    access_token: result.accessToken,
    refresh_token: result.refreshToken,
  });
  if (error) {
    // The backend already succeeded — failing here is a client-side
    // SecureStore issue. Surface a useful error rather than silently
    // leaving the client in an inconsistent state.
    throw new Error(`Failed to persist session: ${error.message}`);
  }

  await cacheRole(result.user.role);
  return result;
}

export async function logout(): Promise<void> {
  // Best-effort backend revoke (matches the web flow). If the network is
  // down we still tear down the local session below so the user can't
  // be stuck in a "logged in but no token" state.
  try {
    await apiPost('/api/v1/auth/logout');
  } catch {
    // ignored — local sign-out must always succeed.
  }
  await supabase.auth.signOut();
  await SecureStore.deleteItemAsync(ROLE_CACHE_KEY).catch(() => undefined);
}

export async function fetchMe(): Promise<MeResponse> {
  const me = await apiGet<MeResponse>('/api/v1/auth/me');
  // Refresh the cache so the next cold start routes to the right tabs
  // even if the backend changed the user's role in the meantime.
  await cacheRole(me.user.role);
  return me;
}

/**
 * Read the cached role from SecureStore. Used by SplashScreen to route
 * immediately on cold start while /auth/me is still in flight.
 *
 * Returns null if no role has ever been cached (first install / post-logout).
 */
export async function getCachedRole(): Promise<UserRole | null> {
  const value = await SecureStore.getItemAsync(ROLE_CACHE_KEY).catch(() => null);
  if (!value) return null;
  if (!isUserRole(value)) return null;
  return value;
}

async function cacheRole(role: UserRole): Promise<void> {
  await SecureStore.setItemAsync(ROLE_CACHE_KEY, role).catch(() => undefined);
}

function isUserRole(value: string): value is UserRole {
  return (
    value === 'SUPER_ADMIN' ||
    value === 'ADMIN' ||
    value === 'TEACHER' ||
    value === 'STUDENT'
  );
}
