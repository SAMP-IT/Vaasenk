/**
 * Vaasenk Mobile — Android notification channels (Sprint 7.4).
 *
 * Android 8+ (API 26+) refuses to display a notification that doesn't
 * declare a channel. The channels we install here mirror the three logical
 * buckets the backend writes into `channelId` on the push payload:
 *
 *   notes  — NOTE_PUBLISHED + future doubt activity. HIGH importance
 *            (heads-up + sound) because a new note is the core student
 *            value loop.
 *   ai     — PAPER_GENERATED / PAPER_FAILED / SYLLABUS_READY / SYLLABUS_FAILED.
 *            DEFAULT importance — the user kicked these off and is usually
 *            waiting, so we surface them in the shade without interrupting.
 *   system — CLASSROOM_JOINED / AI_CREDITS_LOW / SYSTEM_ANNOUNCEMENT. The
 *            default fallback when a payload arrives without a channelId.
 *
 * Channels must exist BEFORE `getExpoPushTokenAsync` resolves, otherwise the
 * first foreground push has nowhere to land. {@link ensureAndroidChannels}
 * is therefore called from boot in apps/mobile/App.tsx via push.ts.
 *
 * iOS has no equivalent — the channelId on the payload is silently ignored
 * by the OS but is still consumed by the Expo Push API to set per-payload
 * sound + interruption-level behaviour. We don't gate the helper on iOS;
 * we just no-op early when the platform isn't Android.
 *
 * Calling this more than once is safe: Notifications.setNotificationChannelAsync
 * is idempotent — it updates the channel definition if it already exists.
 * Android won't let us LOWER an importance once the user has installed the
 * channel; we ship the most opinionated values up front and never change
 * them afterwards.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/** Channel id constants — string-typed for downstream comparisons. */
export const PUSH_CHANNEL_NOTES = 'notes';
export const PUSH_CHANNEL_AI = 'ai';
export const PUSH_CHANNEL_SYSTEM = 'system';

export type PushChannelId =
  | typeof PUSH_CHANNEL_NOTES
  | typeof PUSH_CHANNEL_AI
  | typeof PUSH_CHANNEL_SYSTEM;

/**
 * Idempotently create the three Vaasenk channels. No-op on iOS / web.
 *
 * Resolves once every `setNotificationChannelAsync` returns. We deliberately
 * await each one sequentially — the Android NotificationManager keeps its
 * own internal lock and parallel writes occasionally race on Pixel devices.
 *
 * Throwing here would block boot, so any individual channel failure is
 * caught and surfaced via a `console.warn` so QA can spot it in the dev
 * client logs without crashing the app.
 */
export async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  try {
    await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_NOTES, {
      name: 'Notes',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      description: 'New notes from your teachers',
      lightColor: '#A00000',
      enableVibrate: true,
      enableLights: true,
      showBadge: true,
    });
  } catch (err) {
     
    console.warn('[push] failed to create channel "notes":', err);
  }

  try {
    await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_AI, {
      name: 'AI & Generation',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
      description: 'AI-related events and paper generation status',
      lightColor: '#A00000',
      enableVibrate: true,
      showBadge: true,
    });
  } catch (err) {
     
    console.warn('[push] failed to create channel "ai":', err);
  }

  try {
    await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_SYSTEM, {
      name: 'System',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
      description: 'System messages and account updates',
      lightColor: '#A00000',
      enableVibrate: false,
      showBadge: true,
    });
  } catch (err) {
     
    console.warn('[push] failed to create channel "system":', err);
  }
}
