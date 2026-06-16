/**
 * Vaasenk Mobile — Floating bell overlay (Sprint 7.4).
 *
 * The tab navigators run with `headerShown: false` because each screen
 * draws its own role-themed gradient hero. That leaves no `headerRight`
 * slot for a global bell. Rather than retrofit every screen with a header
 * (or break the existing hero design), we pin the bell as a floating
 * overlay at the top-right corner of the tabs subtree.
 *
 * The overlay:
 *   - Sits inside the SafeArea (insets.top + a small margin) so it never
 *     overlaps the status bar.
 *   - Uses pointerEvents='box-none' so taps fall through to the screen
 *     UNLESS they land on the bell itself.
 *   - Pinned to the WINDOW, not the screen — works equally well on the
 *     student coral hero, the teacher orange hero, or the cream canvas.
 *   - Drawn ABOVE everything else via zIndex / elevation. The Modal that
 *     the bell opens covers it anyway.
 *
 * Token contract: glass surface from `vaasenkNative.colors.surface.glassWhite`
 * + a soft drop shadow so the bell stays legible on both white and
 * gradient backdrops. No hardcoded hex.
 */

import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { vaasenkNative } from '@/theme/tokens';
import { NotificationBell } from './NotificationBell';

type Props = {
  /** Override the bell icon tint. Defaults to white for hero backgrounds. */
  iconColor?: string;
};

export function BellOverlay({
  iconColor = vaasenkNative.colors.text.inverse,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: insets.top + vaasenkNative.spacing.sm,
        right: vaasenkNative.spacing.lg,
        zIndex: 50,
        // Android needs explicit elevation for z-stacking.
        elevation: 12,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: vaasenkNative.colors.surface.glassWhite,
          alignItems: 'center',
          justifyContent: 'center',
          // Soft glow so the chip reads on a gradient hero without
          // looking like a stuck-on button.
          shadowColor: vaasenkNative.shadows.cardSoft.shadowColor,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.18,
          shadowRadius: 14,
        }}
      >
        <NotificationBell iconColor={iconColor} />
      </View>
    </View>
  );
}
