/**
 * Vaasenk Mobile — Gradient hero header.
 *
 * Used on top of student/teacher/admin landing screens. Renders one of the
 * named Vaasenk gradients with a title + optional subtitle, leaving body
 * content below on the Warm Canvas background.
 *
 * Per CLAUDE.md §4: gradient definitions come from @vaasenk/ui/tokens —
 * we never inline color stops here.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  gradientProps,
  vaasenkNative,
  type VaasenkNativeRole,
} from '@/theme/tokens';

type GradientName = keyof typeof vaasenkNative.gradients;

const ROLE_GRADIENT: Record<VaasenkNativeRole, GradientName> = {
  student: 'studentCandy',
  teacher: 'goldCard',
  admin: 'redGlow',
};

type Props = {
  title: string;
  subtitle?: string;
  /** Override gradient. Defaults to the role-specific one when `role` is set. */
  gradient?: GradientName;
  role?: VaasenkNativeRole;
  style?: ViewStyle;
};

export function GradientHero({ title, subtitle, gradient, role, style }: Props) {
  const insets = useSafeAreaInsets();
  const gradientName: GradientName =
    gradient ?? (role ? ROLE_GRADIENT[role] : 'heroSunrise');

  return (
    <LinearGradient
      {...gradientProps(gradientName)}
      style={[
        {
          paddingTop: insets.top + vaasenkNative.spacing.lg,
          paddingBottom: vaasenkNative.spacing['3xl'],
          paddingHorizontal: vaasenkNative.spacing.xl,
          borderBottomLeftRadius: vaasenkNative.radius['2xl'],
          borderBottomRightRadius: vaasenkNative.radius['2xl'],
        },
        style,
      ]}
    >
      <Text
        style={{
          color: vaasenkNative.colors.text.inverse,
          fontSize: vaasenkNative.typography.title.fontSize,
          lineHeight: vaasenkNative.typography.title.lineHeight,
          fontWeight: vaasenkNative.typography.title.fontWeight,
        }}
      >
        {title}
      </Text>
      {subtitle ? (
        <View style={{ marginTop: vaasenkNative.spacing.sm }}>
          <Text
            style={{
              color: 'rgba(255,255,255,0.92)',
              fontSize: vaasenkNative.typography.body.fontSize,
              lineHeight: vaasenkNative.typography.body.lineHeight,
            }}
          >
            {subtitle}
          </Text>
        </View>
      ) : null}
    </LinearGradient>
  );
}
