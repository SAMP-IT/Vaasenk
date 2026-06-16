/**
 * Vaasenk Mobile — LoadingShimmer.
 *
 * A subtle pulsing placeholder block used in skeleton states across the
 * student screens. Animated via Reanimated 3 (already plumbed by 7.1).
 * Respects `prefers-reduced-motion`: if reduced-motion is on, we render
 * a static muted rectangle.
 */

import { useEffect } from 'react';
import { AccessibilityInfo, type DimensionValue, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { vaasenkNative } from '@/theme/tokens';

type Props = {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
};

export function LoadingShimmer({
  width = '100%',
  height = 14,
  borderRadius,
  style,
}: Props) {
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return;
      opacity.value = withRepeat(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height,
          borderRadius: borderRadius ?? vaasenkNative.radius.xs,
          backgroundColor: 'rgba(160,0,0,0.08)',
        },
        animatedStyle,
        style,
      ]}
    />
  );
}
