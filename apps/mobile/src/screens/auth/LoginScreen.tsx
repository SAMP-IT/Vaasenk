/**
 * Vaasenk Mobile — Login screen.
 *
 * Email + password sign-in. Submits to /auth/login via the auth context;
 * the auth context handles Supabase hydration and role caching. The root
 * navigator swaps to StudentTabs / TeacherTabs / AdminBlocked automatically
 * on success — this screen does not navigate manually.
 *
 * 5 component states (CLAUDE.md §5):
 *   default  — both fields editable, CTA armed.
 *   loading  — fields disabled, button shows spinner, taps suppressed.
 *   empty    — N/A (no list).
 *   error    — inline red message under the form + ApiClientError code.
 *   disabled — submit disabled until both fields have ≥1 character.
 *
 * Forgot-password link is wired as a no-op label for now; backend already
 * exposes POST /auth/forgot-password — the dedicated reset flow lands
 * alongside the rest of the auth UI hardening in a later sprint.
 */

import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, AlertCircle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/services/auth-context';
import { ApiClientError } from '@/services/api';
import { gradientProps, vaasenkNative } from '@/theme/tokens';
import type { AuthScreenProps } from '@/navigation/types';

export function LoginScreen({ navigation }: AuthScreenProps<'Login'>) {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    email.trim().length > 0 && password.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      // The auth context flips status to 'authenticated' and the root
      // navigator re-renders into the role-appropriate stack. No manual
      // navigation needed here.
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Something went wrong. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{
        flex: 1,
        backgroundColor: vaasenkNative.colors.surface.warmCanvas,
      }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + vaasenkNative.spacing.md,
          paddingBottom: insets.bottom + vaasenkNative.spacing['3xl'],
          paddingHorizontal: vaasenkNative.spacing.xl,
        }}
      >
        {/* Back button */}
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            padding: vaasenkNative.spacing.sm,
            borderRadius: vaasenkNative.radius.full,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <ChevronLeft size={28} color={vaasenkNative.colors.text.ink} />
        </Pressable>

        {/* Heading */}
        <View style={{ marginTop: vaasenkNative.spacing.lg }}>
          <Text
            style={{
              color: vaasenkNative.colors.text.ink,
              fontSize: vaasenkNative.typography.title.fontSize,
              fontWeight: vaasenkNative.typography.title.fontWeight,
              lineHeight: vaasenkNative.typography.title.lineHeight,
              letterSpacing: -0.5,
            }}
          >
            Welcome back
          </Text>
          <Text
            style={{
              color: vaasenkNative.colors.text.muted,
              fontSize: vaasenkNative.typography.body.fontSize,
              lineHeight: vaasenkNative.typography.body.lineHeight,
              marginTop: vaasenkNative.spacing.sm,
            }}
          >
            Sign in with the credentials your school provided.
          </Text>
        </View>

        {/* Form card */}
        <View
          style={[
            vaasenkNative.components.card,
            vaasenkNative.shadows.cardSoft,
            {
              marginTop: vaasenkNative.spacing['2xl'],
              gap: vaasenkNative.spacing.lg,
            },
          ]}
        >
          <FormField label="Email">
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              editable={!submitting}
              placeholder="you@school.edu"
              placeholderTextColor={vaasenkNative.colors.text.subtle}
              value={email}
              onChangeText={setEmail}
              returnKeyType="next"
              style={inputStyle(submitting)}
            />
          </FormField>

          <FormField label="Password">
            <TextInput
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              editable={!submitting}
              placeholder="••••••••"
              placeholderTextColor={vaasenkNative.colors.text.subtle}
              value={password}
              onChangeText={setPassword}
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
              style={inputStyle(submitting)}
            />
          </FormField>

          {error ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: vaasenkNative.spacing.sm,
                padding: vaasenkNative.spacing.md,
                borderRadius: vaasenkNative.radius.md,
                backgroundColor: 'rgba(220,38,38,0.08)',
                borderWidth: 1,
                borderColor: 'rgba(220,38,38,0.18)',
              }}
            >
              <AlertCircle
                size={18}
                color={vaasenkNative.colors.semantic.danger}
                style={{ marginTop: 1 }}
              />
              <Text
                style={{
                  flex: 1,
                  color: vaasenkNative.colors.semantic.danger,
                  fontSize: 14,
                  lineHeight: 20,
                }}
              >
                {error}
              </Text>
            </View>
          ) : null}

          <Pressable
            disabled={!canSubmit}
            onPress={handleSubmit}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            accessibilityState={{ disabled: !canSubmit, busy: submitting }}
            style={({ pressed }) => [
              {
                borderRadius: vaasenkNative.components.button.borderRadius,
                overflow: 'hidden',
                opacity: !canSubmit ? 0.5 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <LinearGradient
              {...gradientProps('heroSunrise')}
              style={{
                minHeight: vaasenkNative.components.button.minHeight,
                paddingHorizontal: vaasenkNative.components.button.paddingHorizontal,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: vaasenkNative.spacing.sm,
              }}
            >
              {submitting ? (
                <ActivityIndicator
                  size="small"
                  color={vaasenkNative.colors.text.inverse}
                />
              ) : null}
              <Text
                style={{
                  color: vaasenkNative.colors.text.inverse,
                  fontSize: 16,
                  fontWeight: '700',
                }}
              >
                {submitting ? 'Signing in…' : 'Sign in'}
              </Text>
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={() => {
              // Forgot-password reset flow lands in a dedicated screen
              // later in Sprint 7. For now this label is documentation.
            }}
            accessibilityRole="link"
            accessibilityLabel="Forgot password"
            style={({ pressed }) => ({
              alignSelf: 'center',
              padding: vaasenkNative.spacing.sm,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text
              style={{
                color: vaasenkNative.colors.brand.red,
                fontWeight: '600',
                fontSize: 14,
              }}
            >
              Forgot password?
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Text
        style={{
          color: vaasenkNative.colors.text.muted,
          fontSize: vaasenkNative.typography.label.fontSize,
          fontWeight: vaasenkNative.typography.label.fontWeight,
          letterSpacing: 0.4,
          marginBottom: vaasenkNative.spacing.xs,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

function inputStyle(disabled: boolean) {
  // Returned as a plain array (not `as const`) so RN's TextStyle accepts
  // it. The token object stays readonly upstream — we just unfreeze the
  // composition at the boundary.
  return [
    { ...vaasenkNative.components.input },
    {
      color: vaasenkNative.colors.text.ink,
      fontSize: 16,
      opacity: disabled ? 0.6 : 1,
    },
  ];
}
