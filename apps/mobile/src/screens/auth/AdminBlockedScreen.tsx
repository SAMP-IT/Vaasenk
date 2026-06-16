/**
 * Vaasenk Mobile — Admin blocked screen.
 *
 * Mobile is student/teacher first. ADMIN and SUPER_ADMIN users belong on
 * the web dashboard — surfacing a polite gradient card is friendlier than
 * dumping them into a half-built admin tab. Includes a sign-out so they
 * can switch accounts on the device if they're testing.
 */

import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ShieldAlert } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/services/auth-context';
import { gradientProps, vaasenkNative } from '@/theme/tokens';

export function AdminBlockedScreen() {
  const insets = useSafeAreaInsets();
  const { logout, user } = useAuth();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: vaasenkNative.colors.surface.warmCanvas,
        paddingTop: insets.top + vaasenkNative.spacing.xl,
        paddingBottom: insets.bottom + vaasenkNative.spacing.xl,
        paddingHorizontal: vaasenkNative.spacing.xl,
        gap: vaasenkNative.spacing.xl,
      }}
    >
      <LinearGradient
        {...gradientProps('redGlow')}
        style={[
          {
            borderRadius: vaasenkNative.radius['2xl'],
            padding: vaasenkNative.spacing['3xl'],
            gap: vaasenkNative.spacing.lg,
          },
          vaasenkNative.shadows.glowRed,
        ]}
      >
        <ShieldAlert size={36} color={vaasenkNative.colors.brand.gold} />

        <Text
          style={{
            color: vaasenkNative.colors.text.inverse,
            fontSize: vaasenkNative.typography.title.fontSize,
            fontWeight: vaasenkNative.typography.title.fontWeight,
            lineHeight: vaasenkNative.typography.title.lineHeight,
          }}
        >
          Admin tools live on the web
        </Text>
        <Text
          style={{
            color: 'rgba(255,255,255,0.9)',
            fontSize: vaasenkNative.typography.body.fontSize,
            lineHeight: vaasenkNative.typography.body.lineHeight,
          }}
        >
          Sign in to the Vaasenk web dashboard to manage your institution,
          users, syllabus, and billing. The mobile app is built for
          teachers and students in the classroom.
        </Text>
        {user ? (
          <Text
            style={{
              color: 'rgba(255,255,255,0.72)',
              fontSize: 13,
              marginTop: vaasenkNative.spacing.sm,
            }}
          >
            Signed in as {user.email}
          </Text>
        ) : null}
      </LinearGradient>

      <Pressable
        onPress={() => {
          void logout();
        }}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        style={({ pressed }) => [
          {
            alignSelf: 'center',
            paddingHorizontal: vaasenkNative.spacing['2xl'],
            paddingVertical: vaasenkNative.spacing.md,
            borderRadius: vaasenkNative.radius.full,
            backgroundColor: vaasenkNative.colors.surface.glassWhite,
            borderWidth: 1,
            borderColor: 'rgba(160,0,0,0.18)',
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Text
          style={{
            color: vaasenkNative.colors.brand.red,
            fontWeight: '700',
            fontSize: 15,
          }}
        >
          Sign out
        </Text>
      </Pressable>
    </View>
  );
}
