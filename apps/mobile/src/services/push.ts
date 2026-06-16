/**
 * Vaasenk Mobile — Expo Push registration (Sprint 7.4).
 *
 * Two public functions:
 *
 *   registerForPushNotifications()
 *     Called from RootNavigator AFTER auth resolves to `authenticated`.
 *     Walks the permission ladder, fetches an Expo push token, and POSTs
 *     it to `/users/me/devices`. The backend stores the token + transfers
 *     ownership idempotently if the same token was previously registered
 *     under a different user (sign-out / re-sign-in flow). On success the
 *     returned device id is persisted to SecureStore so we can DELETE
 *     against `/users/me/devices/:id` on sign-out.
 *
 *   unregisterPushNotifications()
 *     Called from auth-context.signOut BEFORE the Supabase session is
 *     cleared (we still need a valid JWT to authenticate the DELETE).
 *     Best-effort — failures are swallowed because the user has signed
 *     out locally regardless of whether the backend got the message.
 *
 * Permission gotchas this code handles:
 *
 *   • iOS first launch — getPermissionsAsync returns `undetermined`. We
 *     request, but if the user denies we stash the denial in SecureStore
 *     so subsequent boots short-circuit and don't pester. The user can
 *     re-enable via system Settings; we'll re-evaluate on next launch.
 *   • Android 13+ — POST_NOTIFICATIONS runtime permission. Behaviour
 *     identical to iOS — request once, remember the denial.
 *   • Simulator / Expo Go — getExpoPushTokenAsync throws because there's
 *     no device-bound APNs/FCM endpoint. We catch and return a structured
 *     "skipped" result so the dev experience doesn't crash. Real push
 *     QA requires `eas build --profile development` on a physical device.
 *   • Web — `expo-notifications` is partially implemented but the device
 *     registration flow is irrelevant for our use case (web has Socket.IO
 *     foreground only). We short-circuit and skip.
 *
 * Per CLAUDE.md §3: `institutionId` NEVER appears in the request body —
 * the backend derives it from the JWT. We only send the platform/device
 * metadata the backend needs to deduplicate + display in admin tooling.
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { apiDelete, apiPost, ApiClientError } from './api';
import { ensureAndroidChannels } from './push-channels';

// SecureStore keys — namespaced under `vaasenk-push-*` so they sort
// together when inspecting Keychain entries during QA.
const DEVICE_ID_KEY = 'vaasenk-device-id';
const PERMISSION_DENIED_KEY = 'vaasenk-push-permission-denied';

/** Subset of `Device` matching the backend's `DeviceTokenPlatform` enum. */
type DevicePlatform = 'ios' | 'android' | 'web';

/** Shape of the device the backend returns after a register call. */
export type RegisteredDevice = {
  id: string;
  expoPushToken: string;
  platform: DevicePlatform;
  deviceName: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Discriminated result so callers can branch without try/catch ceremony. */
export type RegisterPushResult =
  | { status: 'registered'; device: RegisteredDevice }
  | { status: 'permission-denied' }
  | {
      status: 'skipped';
      /** Why we short-circuited — useful in dev-only console.info. */
      reason: 'simulator' | 'web' | 'no-project-id' | 'no-token';
    }
  | { status: 'error'; error: Error };

// ---------------------------------------------------------------------------
// Global foreground handler
// ---------------------------------------------------------------------------

/**
 * Default foreground behaviour. The in-app socket + bell sheet provides a
 * richer real-time surface than the OS heads-up notification, so when the
 * app is foregrounded we DON'T show the OS banner — we only bump the badge.
 * `notifications-socket.ts` flips this back to "show banner" when AppState
 * goes inactive/background so lock-screen pushes still appear normally.
 *
 * Idempotent — Expo replaces the previous handler when called again.
 *
 * Note on shape: SDK 52 uses the legacy `shouldShowAlert` flag (controls
 * banner + heads-up on iOS; controls notification visibility on Android).
 * SDK 53 splits this into `shouldShowBanner` + `shouldShowList` — when we
 * upgrade we'll widen this object accordingly. Keep both names additive
 * to make that migration mechanical.
 */
export function installDefaultForegroundHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: false,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });
}

/**
 * Tells expo-notifications to show heads-up banners when the app is in
 * the background. Mirrors {@link installDefaultForegroundHandler} — used
 * by the AppState listener in `notifications-socket.ts`.
 */
export function installBackgroundForegroundHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Resolve the EAS projectId Expo's push token API needs. Order:
 *   1. Constants.expoConfig.extra.eas.projectId (set by `eas init`).
 *   2. Constants.easConfig.projectId (legacy field on older SDKs).
 *
 * Returns `null` if neither is set — we then skip token fetching because
 * `getExpoPushTokenAsync` would throw at runtime. The EAS Build setup
 * for this repo will populate `extra.eas.projectId` in app.json once the
 * project is initialised; until then push only works in Expo Go's
 * unauthenticated namespace which we don't rely on.
 */
function resolveProjectId(): string | null {
  const expoConfig = Constants.expoConfig as
    | { extra?: { eas?: { projectId?: string } } }
    | null;
  const fromExtra = expoConfig?.extra?.eas?.projectId;
  if (fromExtra && fromExtra.length > 0) return fromExtra;
  const easConfig = (Constants as unknown as { easConfig?: { projectId?: string } })
    .easConfig;
  if (easConfig?.projectId && easConfig.projectId.length > 0) {
    return easConfig.projectId;
  }
  return null;
}

/**
 * Map RN `Platform.OS` to the backend's `DeviceTokenPlatform` enum.
 * `'macos'` / `'windows'` collapse to `'web'` — RN-Web fallback path.
 */
function resolvePlatform(): DevicePlatform {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

/**
 * Pretty device name for the admin token list. `Device.deviceName` is the
 * user-set name on iOS (Settings → General → About → Name) and the model
 * name on Android. Falls back to "<Platform> device" so a non-null label
 * always lands in the backend.
 */
function resolveDeviceName(): string {
  const explicit = Device.deviceName;
  if (explicit && explicit.length > 0) return explicit;
  const modelName = Device.modelName ?? '';
  const platform = Platform.OS === 'ios' ? 'iOS' : 'Android';
  return modelName ? `${platform} ${modelName}` : `${platform} device`;
}

function resolveAppVersion(): string {
  const v = Constants.expoConfig?.version;
  return typeof v === 'string' && v.length > 0 ? v : '0.0.0';
}

function resolveOsVersion(): string {
  return String(Platform.Version);
}

/**
 * Read the "user denied us once" SecureStore flag. Truthy strings count as
 * a denial; everything else (incl. SecureStore errors) is `false`.
 */
async function hasPersistedDenial(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const value = await SecureStore.getItemAsync(PERMISSION_DENIED_KEY);
    return value === '1';
  } catch {
    return false;
  }
}

async function setPersistedDenial(denied: boolean): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (denied) {
      await SecureStore.setItemAsync(PERMISSION_DENIED_KEY, '1');
    } else {
      await SecureStore.deleteItemAsync(PERMISSION_DENIED_KEY);
    }
  } catch {
    // Best effort; not fatal.
  }
}

/**
 * Walk the iOS/Android permission ladder. Returns the final granted-ness.
 *
 * Strategy:
 *   1. Read existing permissions.
 *   2. If `undetermined`, request.
 *   3. iOS provides finer-grained alert/badge/sound flags — we ask for
 *      all three by default (matches Expo's recommended defaults).
 *
 * Persists denial so we don't keep prompting the user on every cold start
 * (Apple will reject the build for prompt spam). The user can re-enable
 * via system Settings; we re-evaluate naturally on the next launch.
 */
async function ensurePushPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === 'granted') {
    await setPersistedDenial(false);
    return true;
  }

  // Don't keep re-prompting after a hard denial. The user must go to
  // system Settings to re-enable.
  if (existing.status === 'denied') {
    await setPersistedDenial(true);
    return false;
  }

  // status === 'undetermined' on iOS, or null on Android pre-13.
  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
      // Provisional + critical alert are NOT requested — they're for
      // medical / safety apps and Apple rejects general apps that ask.
    },
  });
  const granted = requested.status === 'granted';
  await setPersistedDenial(!granted);
  return granted;
}

/**
 * Main entry: ensure channels, walk permission, get token, register with
 * the backend, persist the returned device id.
 *
 * Returns a discriminated result so the caller can decide what to do —
 * RootNavigator just logs and moves on (registration is non-blocking).
 *
 * Calls are idempotent: if the same `expoPushToken` is already on file,
 * the backend transfers ownership to the current user and returns the
 * existing row. We overwrite the SecureStore device id either way.
 */
export async function registerForPushNotifications(): Promise<RegisterPushResult> {
  // 1. Skip on web / Expo Go SDK 53+ proxy unavailable / simulator.
  if (Platform.OS === 'web') {
    return { status: 'skipped', reason: 'web' };
  }

  // `Device.isDevice` is `false` for iOS simulator and Android emulator.
  // APNs/FCM tokens cannot be acquired on these — Expo's API throws.
  if (!Device.isDevice) {
    return { status: 'skipped', reason: 'simulator' };
  }

  // 2. Ensure Android channels exist BEFORE token request.
  await ensureAndroidChannels();

  // 3. If we've already been told "no", short-circuit.
  if (await hasPersistedDenial()) {
    const granted = await ensurePushPermission();
    if (!granted) {
      return { status: 'permission-denied' };
    }
  } else {
    const granted = await ensurePushPermission();
    if (!granted) {
      return { status: 'permission-denied' };
    }
  }

  // 4. Resolve project id — required by SDK 49+ for cross-org token isolation.
  const projectId = resolveProjectId();
  if (!projectId) {
    // Dev-only nudge — without a project id, Expo Push API has no way
    // to route notifications to this build. In production EAS Build
    // injects the id automatically.
    if (__DEV__) {
       
      console.warn(
        '[push] EAS projectId not configured. Set expo.extra.eas.projectId ' +
          'in app.json after running `eas init`. Push notifications will ' +
          'remain inactive until then.',
      );
    }
    return { status: 'skipped', reason: 'no-project-id' };
  }

  // 5. Fetch the Expo push token.
  let expoPushToken: string;
  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    expoPushToken = result.data;
  } catch (err) {
    return {
      status: 'error',
      error:
        err instanceof Error
          ? err
          : new Error('Failed to fetch Expo push token'),
    };
  }

  if (!expoPushToken || expoPushToken.length === 0) {
    return { status: 'skipped', reason: 'no-token' };
  }

  // 6. POST to the backend. Idempotent on the server side.
  try {
    const result = await apiPost<{ device: RegisteredDevice }>(
      '/api/v1/users/me/devices',
      {
        expoPushToken,
        platform: resolvePlatform(),
        deviceName: resolveDeviceName(),
        appVersion: resolveAppVersion(),
        osVersion: resolveOsVersion(),
      },
    );
    await SecureStore.setItemAsync(DEVICE_ID_KEY, result.device.id).catch(
      () => undefined,
    );
    return { status: 'registered', device: result.device };
  } catch (err) {
    // ApiClientError carries enough context to debug; anything else gets
    // wrapped so the return type stays uniform.
    if (err instanceof ApiClientError) {
      return { status: 'error', error: err };
    }
    return {
      status: 'error',
      error:
        err instanceof Error
          ? err
          : new Error('Failed to register device with backend'),
    };
  }
}

/**
 * Best-effort sign-out cleanup. Reads the cached device id, DELETEs it,
 * then wipes the SecureStore key whether or not the network call worked.
 *
 * Errors are intentionally swallowed because the user has signed out
 * locally; we don't want to block the UI on a backend round-trip that
 * the user can't observe. The backend also has TTL-based cleanup for
 * stale tokens.
 */
export async function unregisterPushNotifications(): Promise<void> {
  let deviceId: string | null = null;
  try {
    deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  } catch {
    deviceId = null;
  }

  if (deviceId && deviceId.length > 0) {
    try {
      await apiDelete(`/api/v1/users/me/devices/${deviceId}`);
    } catch {
      // Swallow — see fn doc.
    }
  }

  try {
    await SecureStore.deleteItemAsync(DEVICE_ID_KEY);
  } catch {
    // Best effort.
  }
}

/**
 * Convenience: read the currently registered device id from SecureStore.
 * Returns `null` if nothing is cached. Exposed so debug screens can show
 * "Registered as device X" without re-fetching from the backend.
 */
export async function getRegisteredDeviceId(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    return await SecureStore.getItemAsync(DEVICE_ID_KEY);
  } catch {
    return null;
  }
}
