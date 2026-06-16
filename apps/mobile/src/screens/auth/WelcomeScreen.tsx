/**
 * Vaasenk Mobile — Welcome screen.
 *
 * First impression for unauthenticated users. Brand Flame gradient hero
 * card with the Vaasenk wordmark + tagline, plus a primary CTA into
 * Login. Marketing copy stays brief — the Web app handles the long
 * marketing surface.
 */

import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { gradientProps, vaasenkNative } from '@/theme/tokens';
import type { AuthScreenProps } from '@/navigation/types';

export function WelcomeScreen({ navigation }: AuthScreenProps<'Welcome'>) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: vaasenkNative.colors.surface.warmCanvas,
        paddingTop: insets.top + vaasenkNative.spacing.lg,
        paddingBottom: insets.bottom + vaasenkNative.spacing.lg,
        paddingHorizontal: vaasenkNative.spacing.xl,
      }}
    >
      {/* Hero card — Brand Flame gradient with the brand mark. */}
      <LinearGradient
        {...gradientProps('heroSunrise')}
        style={[
          {
            flex: 1,
            borderRadius: vaasenkNative.radius['2xl'],
            padding: vaasenkNative.spacing['3xl'],
            justifyContent: 'space-between',
          },
          vaasenkNative.shadows.glowRed,
        ]}
      >
        <View>
          <View
            style={{
              alignSelf: 'flex-start',
              paddingHorizontal: vaasenkNative.spacing.md,
              paddingVertical: vaasenkNative.spacing.xs,
              borderRadius: vaasenkNative.radius.full,
              backgroundColor: 'rgba(255,255,255,0.18)',
            }}
          >
            <Text
              style={{
                color: vaasenkNative.colors.text.inverse,
                fontSize: vaasenkNative.typography.label.fontSize,
                fontWeight: vaasenkNative.typography.label.fontWeight,
                letterSpacing: 0.5,
              }}
            >
              CLASSROOM PRODUCTIVITY
            </Text>
          </View>
        </View>

        <View>
          <Text
            style={{
              color: vaasenkNative.colors.text.inverse,
              fontSize: 56,
              fontWeight: '800',
              letterSpacing: -1.5,
              lineHeight: 60,
            }}
          >
            Vaasenk
          </Text>
          <Text
            style={{
              color: 'rgba(255,255,255,0.92)',
              fontSize: 18,
              lineHeight: 26,
              marginTop: vaasenkNative.spacing.sm,
              fontWeight: '500',
            }}
          >
            Teach more.{'\n'}Copy less.
          </Text>
        </View>
      </LinearGradient>

      {/* Primary CTA pinned below the hero. */}
      <Pressable
        onPress={() => navigation.navigate('Login')}
        accessibilityRole="button"
        accessibilityLabel="Get started"
        style={({ pressed }) => [
          {
            marginTop: vaasenkNative.spacing.xl,
            opacity: pressed ? 0.85 : 1,
            borderRadius: vaasenkNative.components.button.borderRadius,
            overflow: 'hidden',
          },
          vaasenkNative.shadows.cardSoft,
        ]}
      >
        <LinearGradient
          {...gradientProps('heroSunrise')}
          style={{
            minHeight: vaasenkNative.components.button.minHeight,
            paddingHorizontal: vaasenkNative.components.button.paddingHorizontal,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              color: vaasenkNative.colors.text.inverse,
              fontSize: 17,
              fontWeight: '700',
              letterSpacing: 0.2,
            }}
          >
            Get started
          </Text>
        </LinearGradient>
      </Pressable>

      <Text
        style={{
          textAlign: 'center',
          color: vaasenkNative.colors.text.muted,
          fontSize: 13,
          marginTop: vaasenkNative.spacing.md,
        }}
      >
        Your school will share your login details.
      </Text>
    </View>
  );
}
