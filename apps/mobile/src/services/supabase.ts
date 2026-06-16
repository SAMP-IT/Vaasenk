/**
 * Vaasenk Mobile — Supabase client.
 *
 * Mirrors the web client (apps/web/src/lib/supabase/client.ts) but uses
 * `expo-secure-store` for token persistence instead of cookies. SecureStore
 * is backed by Keychain on iOS and EncryptedSharedPreferences on Android —
 * the standard recommendation from Supabase for Expo apps.
 *
 * Auth flow mirrors web (per memory: vaasenk-auth-architecture):
 *   1. Mobile POSTs to `/auth/login` via apiFetch (api.ts).
 *   2. Backend signs in via Supabase admin SDK, returns
 *      { user, accessToken, refreshToken, expiresAt }.
 *   3. Mobile calls `supabase.auth.setSession({ accessToken, refreshToken })`
 *      which hydrates this client AND persists to SecureStore via the
 *      storage adapter below.
 *   4. Subsequent apiFetch calls read the access token from the live
 *      Supabase session and attach Authorization: Bearer headers.
 *
 * NEVER use AsyncStorage for auth tokens on mobile. AsyncStorage is plain
 * SQLite/files — a jailbroken device can read it. SecureStore lives in
 * the OS keystore.
 */

import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail fast at boot rather than mid-request. The .env.example file
  // documents these — copy it to .env.local before `expo start`.
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy apps/mobile/.env.example to .env.local and restart `expo start`.',
  );
}

/**
 * SecureStore-backed implementation of Supabase's Storage interface.
 *
 * SecureStore has a hard ~2KB per-value limit on iOS and is keyed by
 * string only (no namespacing). Supabase typically stores a single
 * JSON blob under one key (the project URL hash), well under 2KB.
 *
 * On web (when running Expo for web during dev), SecureStore throws —
 * fall back to in-memory storage so the dev experience doesn't crash.
 * Production native builds NEVER hit this branch.
 */
const inMemoryStore = new Map<string, string>();

const secureStoreAdapter: SupportedStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return inMemoryStore.get(key) ?? null;
    }
    return SecureStore.getItemAsync(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      inMemoryStore.set(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      inMemoryStore.delete(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    // Mobile deep links handle the OAuth callback explicitly via the
    // app's `scheme: "vaasenk"` (see app.json). The URL-detection mode
    // is for browser SPAs only.
    detectSessionInUrl: false,
  },
});

/**
 * Convenience: returns the current access token (refreshing if needed)
 * or null if there is no session. The API client uses this to attach
 * the Authorization header. Wraps `getSession` so callers don't have
 * to deal with Supabase's `{ data: { session } }` shape every time.
 */
export async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;
  return data.session.access_token;
}
