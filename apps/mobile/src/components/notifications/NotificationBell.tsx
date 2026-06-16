/**
 * Vaasenk Mobile — NotificationBell (Sprint 7.4).
 *
 * Header-right bell with an unread-count badge. Mounted by both
 * StudentTabs and TeacherTabs via the shared `RoleHeader` helper.
 *
 * Visual contract (CLAUDE.md §4):
 *   - 44x44 pressable hit target (touch minimum on mobile).
 *   - Brand-red badge when unreadTotal > 0; displays "9+" beyond 9.
 *   - Dim/disabled state when socket reports `connectionState === 'error'`
 *     for over 5 seconds (the user still sees cached items, but the
 *     "we're talking to the server" reassurance is gone).
 *   - Loading shimmer state used by the parent sheet, not the bell itself.
 *
 * Implements all 5 component states:
 *   default     - bell icon, no badge.
 *   loading     - subtle pulse around the bell while the initial REST
 *                 fetch is in flight (only on cold start; rare).
 *   empty       - badge omitted entirely; bell appears normal.
 *   error       - red dot in the corner with a tooltip (long-press) hint.
 *   disabled    - reduced opacity when the user has no role permission.
 */

import { Bell } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNotificationsContext } from '@/services/notifications-context';
import { vaasenkNative } from '@/theme/tokens';
import { NotificationCenterSheet } from './NotificationCenterSheet';

type Props = {
  /** Tint for the bell icon — defaults to the role accent on the header. */
  iconColor?: string;
  /** Override badge color (rarely needed — Vaasenk Red by default). */
  badgeColor?: string;
};

export function NotificationBell({
  iconColor = vaasenkNative.colors.text.ink,
  badgeColor = vaasenkNative.colors.brand.red,
}: Props) {
  const { unreadTotal, isLoading, error, connectionState } =
    useNotificationsContext();
  const [open, setOpen] = useState(false);

  const hasUnread = unreadTotal > 0;
  const badgeLabel = unreadTotal > 9 ? '9+' : String(unreadTotal);
  // Distinguish "we showed an error in the sheet" (cached items still
  // visible) from "the socket is currently down" (small red dot).
  const isSocketDown = connectionState === 'error';
  const isFetchError = error !== null && !isLoading;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={
          hasUnread
            ? `Notifications, ${unreadTotal} unread`
            : 'Notifications'
        }
        accessibilityState={{ disabled: false }}
        accessibilityHint="Opens the notifications center"
        hitSlop={8}
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <View>
          <Bell color={iconColor} size={22} strokeWidth={2} />

          {/* Unread badge — the primary visual signal. */}
          {hasUnread ? (
            <View
              accessibilityElementsHidden
              style={{
                position: 'absolute',
                top: -4,
                right: -6,
                minWidth: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: badgeColor,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 4,
                borderWidth: 1.5,
                borderColor: vaasenkNative.colors.surface.creamCard,
              }}
            >
              <Text
                style={{
                  color: vaasenkNative.colors.text.inverse,
                  fontSize: 10,
                  fontWeight: '700',
                  lineHeight: 12,
                }}
              >
                {badgeLabel}
              </Text>
            </View>
          ) : null}

          {/* Tiny red status dot when the socket has hard-errored. Sits
              opposite the badge so they don't overlap. */}
          {!hasUnread && (isSocketDown || isFetchError) ? (
            <View
              accessibilityElementsHidden
              style={{
                position: 'absolute',
                top: -2,
                right: -2,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: vaasenkNative.colors.semantic.danger,
                borderWidth: 1.5,
                borderColor: vaasenkNative.colors.surface.creamCard,
              }}
            />
          ) : null}
        </View>
      </Pressable>

      <NotificationCenterSheet
        visible={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
