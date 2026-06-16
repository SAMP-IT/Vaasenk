/**
 * Vaasenk Mobile — ProfileScreen (Sprint 7.2).
 *
 * Real user profile card replaces the 7.1 placeholder. Shows avatar /
 * initials, name, email, institution + role, plus stub settings rows
 * (Notifications, Theme) and a real Sign-out CTA. App version pulled
 * from expo-constants so QA can verify which build they're on.
 */

import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell,
  ChevronRight,
  GraduationCap,
  Info,
  LogOut,
  Palette,
  Shield,
} from 'lucide-react-native';
import { useAuth } from '@/services/auth-context';
import { gradientProps, vaasenkNative } from '@/theme/tokens';

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  const initials = (user?.name ?? 'You')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';

  const appVersion =
    Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? '0.1.0';

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: vaasenkNative.colors.surface.warmCanvas,
      }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
    >
      {/* Hero */}
      <LinearGradient
        {...gradientProps('studentCandy')}
        style={{
          paddingTop: insets.top + vaasenkNative.spacing['2xl'],
          paddingBottom: vaasenkNative.spacing['3xl'],
          paddingHorizontal: vaasenkNative.spacing.xl,
          borderBottomLeftRadius: vaasenkNative.radius['2xl'],
          borderBottomRightRadius: vaasenkNative.radius['2xl'],
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            backgroundColor: 'rgba(255,255,255,0.22)',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: vaasenkNative.spacing.md,
          }}
        >
          <Text
            style={{
              color: vaasenkNative.colors.text.inverse,
              fontSize: 32,
              fontWeight: '800',
            }}
          >
            {initials}
          </Text>
        </View>
        <Text
          style={{
            color: vaasenkNative.colors.text.inverse,
            fontSize: 24,
            fontWeight: '800',
            textAlign: 'center',
          }}
        >
          {user?.name ?? 'Student'}
        </Text>
        <Text
          style={{
            marginTop: vaasenkNative.spacing.xs,
            color: 'rgba(255,255,255,0.92)',
            fontSize: 13,
          }}
        >
          {user?.email ?? 'Signed in'}
        </Text>
        {user?.institution?.name ? (
          <View
            style={{
              marginTop: vaasenkNative.spacing.md,
              paddingHorizontal: vaasenkNative.spacing.md,
              paddingVertical: 4,
              borderRadius: vaasenkNative.radius.full,
              backgroundColor: 'rgba(255,255,255,0.22)',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <GraduationCap
              size={14}
              color={vaasenkNative.colors.text.inverse}
            />
            <Text
              style={{
                color: vaasenkNative.colors.text.inverse,
                fontWeight: '700',
                fontSize: 12,
              }}
            >
              {user.institution.name}
            </Text>
          </View>
        ) : null}
      </LinearGradient>

      {/* Settings */}
      <View
        style={{
          marginTop: vaasenkNative.spacing.xl,
          marginHorizontal: vaasenkNative.spacing.xl,
          borderRadius: vaasenkNative.radius.lg,
          backgroundColor: vaasenkNative.colors.surface.glassWhite,
          borderWidth: 1,
          borderColor: 'rgba(160,0,0,0.08)',
          overflow: 'hidden',
        }}
      >
        <SettingRow
          icon={<Bell size={18} color={vaasenkNative.colors.brand.red} />}
          label="Notifications"
          hint="Coming in Sprint 7.4"
          disabled
        />
        <Divider />
        <SettingRow
          icon={<Palette size={18} color={vaasenkNative.colors.brand.red} />}
          label="Appearance"
          hint="Light only · dark mode later"
          disabled
        />
        <Divider />
        <SettingRow
          icon={<Shield size={18} color={vaasenkNative.colors.brand.red} />}
          label="Privacy"
          hint="View our privacy policy"
          disabled
        />
      </View>

      {/* About */}
      <View
        style={{
          marginTop: vaasenkNative.spacing.lg,
          marginHorizontal: vaasenkNative.spacing.xl,
          borderRadius: vaasenkNative.radius.lg,
          backgroundColor: vaasenkNative.colors.surface.glassWhite,
          borderWidth: 1,
          borderColor: 'rgba(160,0,0,0.08)',
          padding: vaasenkNative.spacing.lg,
          flexDirection: 'row',
          gap: vaasenkNative.spacing.md,
        }}
      >
        <Info size={20} color={vaasenkNative.colors.text.deepMaroon} />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: vaasenkNative.colors.text.ink,
              fontSize: 14,
              fontWeight: '700',
            }}
          >
            Vaasenk · v{appVersion}
          </Text>
          <Text
            style={{
              marginTop: 4,
              color: vaasenkNative.colors.text.muted,
              fontSize: 12,
              lineHeight: 18,
            }}
          >
            Teach more. Copy less. Made for Indian classrooms.
          </Text>
        </View>
      </View>

      {/* Sign out */}
      <View
        style={{
          marginTop: vaasenkNative.spacing.xl,
          marginHorizontal: vaasenkNative.spacing.xl,
        }}
      >
        <Pressable
          onPress={() => {
            void logout();
          }}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          style={({ pressed }) => ({
            minHeight: vaasenkNative.components.button.minHeight,
            borderRadius: vaasenkNative.components.button.borderRadius,
            borderWidth: 1,
            borderColor: 'rgba(160,0,0,0.28)',
            backgroundColor: vaasenkNative.colors.surface.glassWhite,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: vaasenkNative.spacing.sm,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <LogOut size={18} color={vaasenkNative.colors.brand.red} />
          <Text
            style={{
              color: vaasenkNative.colors.brand.red,
              fontWeight: '800',
              fontSize: 15,
            }}
          >
            Sign out
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function SettingRow({
  icon,
  label,
  hint,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={({ pressed }) => ({
        padding: vaasenkNative.spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: vaasenkNative.spacing.md,
        opacity: disabled ? 0.7 : pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: 'rgba(254,202,2,0.18)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: vaasenkNative.colors.text.ink,
            fontSize: 15,
            fontWeight: '700',
          }}
        >
          {label}
        </Text>
        {hint ? (
          <Text
            style={{
              marginTop: 2,
              color: vaasenkNative.colors.text.muted,
              fontSize: 12,
            }}
          >
            {hint}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={18} color={vaasenkNative.colors.text.subtle} />
    </Pressable>
  );
}

function Divider() {
  return (
    <View
      style={{
        height: 1,
        marginLeft: vaasenkNative.spacing.lg + 36 + vaasenkNative.spacing.md,
        backgroundColor: 'rgba(160,0,0,0.08)',
      }}
    />
  );
}
