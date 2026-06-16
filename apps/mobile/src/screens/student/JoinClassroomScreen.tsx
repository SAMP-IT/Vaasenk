/**
 * Vaasenk Mobile — JoinClassroomScreen (Sprint 7.2).
 *
 * Mirrors the web join dialog (apps/web/src/app/(dashboard)/student/join-classroom-card.tsx).
 * Six segmented input boxes for the invite code — paste-friendly (paste
 * fills all six in one go) and visually delightful per the design-doc's
 * "tactile, code-stamp" feel.
 *
 * Backend rejects with:
 *   404 — invite code not recognised
 *   410 — invite expired
 * (per ClassroomsService.joinByInviteCode). Surface dedicated messages
 * for each so the student understands what to ask their teacher for.
 *
 * 5 states (CLAUDE.md §5):
 *   default  — six boxes editable, primary CTA disabled until 6 chars.
 *   loading  — fields disabled + button shows spinner.
 *   empty    — N/A.
 *   error    — inline ErrorState above the field.
 *   disabled — CTA stays disabled until 6 chars typed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, UserPlus } from 'lucide-react-native';
import { ApiClientError } from '@/services/api';
import { joinClassroom } from '@/services/classrooms';
import { ErrorState } from '@/components/ErrorState';
import { gradientProps, vaasenkNative } from '@/theme/tokens';
import type { StudentHomeScreenProps } from '@/navigation/types';

const CODE_LENGTH = 6;
const CODE_PATTERN = /[^A-Z0-9]/g;

export function JoinClassroomScreen({
  navigation,
}: StudentHomeScreenProps<'JoinClassroom'>) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput | null>(null);

  // Single underlying string; six segmented "display boxes" overlay it.
  // This pattern means paste fills all six in one motion and the system
  // keyboard's auto-suggest still works.
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Focus the hidden input on mount so the keyboard pops immediately.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);

  const cleaned = useMemo(() => code.replace(CODE_PATTERN, '').slice(0, CODE_LENGTH), [code]);
  const ready = cleaned.length === CODE_LENGTH && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!ready) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await joinClassroom(cleaned);
      // Drop the user straight into the joined classroom's feed.
      navigation.navigate('StudentClassrooms', {
        screen: 'ClassroomFeed',
        params: { classroomId: result.classroom.id },
      });
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 404) {
          setError(
            "That code didn't match an active classroom. Double-check it with your teacher.",
          );
        } else if (err.status === 410) {
          setError("That invite code has expired. Ask your teacher for a fresh one.");
        } else {
          setError(err.message);
        }
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Could not join right now. Please try again.');
      }
      setSubmitting(false);
    }
  }, [ready, cleaned, navigation]);

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
        {/* Back */}
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            padding: vaasenkNative.spacing.sm,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <ChevronLeft size={28} color={vaasenkNative.colors.text.deepMaroon} />
        </Pressable>

        {/* Heading */}
        <View style={{ marginTop: vaasenkNative.spacing.lg }}>
          <Text
            style={{
              color: vaasenkNative.colors.text.deepMaroon,
              fontSize: 12,
              fontWeight: '700',
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            Join a class
          </Text>
          <Text
            style={{
              marginTop: vaasenkNative.spacing.sm,
              color: vaasenkNative.colors.text.ink,
              fontSize: vaasenkNative.typography.title.fontSize,
              lineHeight: vaasenkNative.typography.title.lineHeight,
              fontWeight: vaasenkNative.typography.title.fontWeight,
            }}
          >
            Enter your invite code
          </Text>
          <Text
            style={{
              marginTop: vaasenkNative.spacing.sm,
              color: vaasenkNative.colors.text.muted,
              fontSize: 14,
              lineHeight: 20,
            }}
          >
            Ask your teacher for the 6-character code. Letters and numbers only.
          </Text>
        </View>

        {/* Segmented code boxes */}
        <Pressable
          onPress={() => inputRef.current?.focus()}
          accessibilityRole="none"
          style={{
            marginTop: vaasenkNative.spacing['2xl'],
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: vaasenkNative.spacing.sm,
          }}
        >
          {Array.from({ length: CODE_LENGTH }).map((_, i) => {
            const char = cleaned[i] ?? '';
            const isActive = cleaned.length === i;
            return (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: 64,
                  borderRadius: vaasenkNative.radius.lg,
                  borderWidth: 2,
                  borderColor: error
                    ? vaasenkNative.colors.semantic.danger
                    : isActive
                      ? vaasenkNative.colors.brand.red
                      : 'rgba(160,0,0,0.18)',
                  backgroundColor: vaasenkNative.colors.surface.creamCard,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    color: vaasenkNative.colors.text.ink,
                    fontSize: 28,
                    fontWeight: '800',
                    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                  }}
                >
                  {char}
                </Text>
              </View>
            );
          })}
        </Pressable>

        {/* Hidden text input that drives the segmented display */}
        <TextInput
          ref={inputRef}
          value={cleaned}
          onChangeText={(next) => {
            const sanitized = next.toUpperCase().replace(CODE_PATTERN, '').slice(0, CODE_LENGTH);
            setCode(sanitized);
            if (error) setError(null);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          maxLength={CODE_LENGTH}
          keyboardType={Platform.OS === 'ios' ? 'ascii-capable' : 'visible-password'}
          // Off-screen so it doesn't render, but still receives keyboard input.
          style={{
            position: 'absolute',
            opacity: 0,
            height: 1,
            width: 1,
          }}
          editable={!submitting}
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />

        {/* Error */}
        {error ? (
          <View style={{ marginTop: vaasenkNative.spacing.lg }}>
            <ErrorState message={error} />
          </View>
        ) : null}

        {/* CTA */}
        <View style={{ marginTop: vaasenkNative.spacing['2xl'] }}>
          <Pressable
            onPress={handleSubmit}
            disabled={!ready}
            accessibilityRole="button"
            accessibilityLabel="Join classroom"
            accessibilityState={{ disabled: !ready }}
            style={({ pressed }) => ({
              opacity: !ready ? 0.5 : pressed ? 0.85 : 1,
            })}
          >
            <LinearGradient
              {...gradientProps('heroSunrise')}
              style={[
                {
                  minHeight: vaasenkNative.components.button.minHeight,
                  borderRadius: vaasenkNative.components.button.borderRadius,
                  paddingHorizontal: vaasenkNative.components.button.paddingHorizontal,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: vaasenkNative.spacing.sm,
                },
                vaasenkNative.shadows.glowRed,
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={vaasenkNative.colors.text.inverse} />
              ) : (
                <UserPlus size={18} color={vaasenkNative.colors.text.inverse} />
              )}
              <Text
                style={{
                  color: vaasenkNative.colors.text.inverse,
                  fontWeight: '800',
                  fontSize: 15,
                }}
              >
                {submitting ? 'Joining…' : 'Join classroom'}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>

        <View
          style={{
            marginTop: vaasenkNative.spacing.xl,
            padding: vaasenkNative.spacing.lg,
            borderRadius: vaasenkNative.radius.lg,
            backgroundColor: vaasenkNative.colors.surface.glassWhite,
            borderWidth: 1,
            borderColor: 'rgba(160,0,0,0.08)',
          }}
        >
          <Text
            style={{
              color: vaasenkNative.colors.text.deepMaroon,
              fontWeight: '700',
              fontSize: 13,
            }}
          >
            Tip
          </Text>
          <Text
            style={{
              marginTop: 4,
              color: vaasenkNative.colors.text.muted,
              fontSize: 13,
              lineHeight: 18,
            }}
          >
            Codes look like ABC123. They're case-insensitive — we'll uppercase
            it for you.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
