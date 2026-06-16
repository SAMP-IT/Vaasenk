/**
 * Vaasenk Mobile — Teacher-specific status chip row (Sprint 7.3).
 *
 * Separate component from the student `FilterChipRow` so the teacher can
 * filter notes by NoteStatus (DRAFT / PUBLISHED / ARCHIVED) instead of by
 * NoteTag. The visual language matches FilterChipRow — Brand Flame pill
 * when active, glassy white when inactive — so the two screens feel
 * unified despite tracking different domains.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, Text } from 'react-native';
import { gradientProps, vaasenkNative } from '@/theme/tokens';
import type { NoteStatus } from '@/services/notes';

export type StatusFilter = NoteStatus | 'ALL';

type Props = {
  active: StatusFilter;
  onChange: (next: StatusFilter) => void;
  disabled?: boolean;
};

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'ARCHIVED', label: 'Archived' },
];

export function TeacherStatusChipRow({ active, onChange, disabled }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: vaasenkNative.spacing.xl,
        paddingVertical: vaasenkNative.spacing.sm,
        gap: vaasenkNative.spacing.sm,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {FILTERS.map((f) => (
        <Chip
          key={f.value}
          label={f.label}
          active={active === f.value}
          disabled={disabled}
          onPress={() => onChange(f.value)}
        />
      ))}
    </ScrollView>
  );
}

function Chip({
  label,
  active,
  disabled,
  onPress,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  if (active) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="tab"
        accessibilityState={{ selected: true, disabled }}
        accessibilityLabel={label}
      >
        <LinearGradient
          {...gradientProps('heroSunrise')}
          style={{
            minHeight: 36,
            paddingHorizontal: vaasenkNative.spacing.lg,
            paddingVertical: vaasenkNative.spacing.xs,
            borderRadius: vaasenkNative.radius.full,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <Text
            style={{
              color: vaasenkNative.colors.text.inverse,
              fontWeight: '700',
              fontSize: 13,
            }}
          >
            {label}
          </Text>
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="tab"
      accessibilityState={{ selected: false, disabled }}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        minHeight: 36,
        paddingHorizontal: vaasenkNative.spacing.lg,
        paddingVertical: vaasenkNative.spacing.xs,
        borderRadius: vaasenkNative.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: vaasenkNative.colors.surface.glassWhite,
        borderWidth: 1,
        borderColor: 'rgba(160,0,0,0.12)',
        opacity: disabled ? 0.6 : pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{
          color: vaasenkNative.colors.text.deepMaroon,
          fontWeight: '600',
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
