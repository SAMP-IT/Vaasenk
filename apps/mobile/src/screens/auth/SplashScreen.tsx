/**
 * Vaasenk Mobile — Splash screen.
 *
 * Cold-start brand mark while the auth context resolves whether there's
 * an existing session. The auth context (services/auth-context.tsx)
 * automatically calls /auth/me on mount; this screen just shows the
 * Brand Flame gradient + wordmark until it does. The root navigator
 * swaps to the correct subgraph as soon as `status` changes.
 *
 * The native `expo-splash-screen` boot splash is dismissed by App.tsx
 * once fonts are loaded — so this JS Splash is what the user sees from
 * "fonts loaded" through "first auth response", typically <500ms.
 */

import { ActivityIndicator, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradientProps, vaasenkNative } from '@/theme/tokens';

export function SplashScreen() {
  return (
    <LinearGradient
      {...gradientProps('heroSunrise')}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={{ alignItems: 'center' }}>
        <Text
          style={{
            color: vaasenkNative.colors.text.inverse,
            fontSize: 56,
            fontWeight: '800',
            letterSpacing: -1.5,
          }}
        >
          Vaasenk
        </Text>
        <Text
          style={{
            color: 'rgba(255,255,255,0.9)',
            fontSize: vaasenkNative.typography.body.fontSize,
            marginTop: vaasenkNative.spacing.sm,
          }}
        >
          Teach more. Copy less.
        </Text>
        <ActivityIndicator
          color={vaasenkNative.colors.text.inverse}
          style={{ marginTop: vaasenkNative.spacing['3xl'] }}
          size="small"
        />
      </View>
    </LinearGradient>
  );
}
