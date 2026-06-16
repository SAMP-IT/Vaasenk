/**
 * Vaasenk Mobile — Tag filter chip row.
 *
 * Horizontal-scrolling row of pill chips used on the classroom feed.
 * Active chip uses the Brand Flame gradient (mirror of the web's
 * student feed). Touch targets ≥36px (the row scrolls, so 36 is
 * acceptable — the row container leaves plenty of vertical padding
 * for thumb-friendly tapping).
 */

import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, Text } from 'react-native';
import { gradientProps, vaasenkNative } from '@/theme/tokens';
import { NOTE_TAGS, TAG_LABELS, type NoteTag } from '@/services/notes';

export type TagFilter = NoteTag | 'ALL';

type Props = {
  active: TagFilter;
  onChange: (next: TagFilter) => void;
  /** When true, every chip renders disabled (e.g. initial loading). */
  disabled?: boolean;
};

export function FilterChipRow({ active, onChange, disabled }: Props) {
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
      <Chip
        label="All"
        active={active === 'ALL'}
        disabled={disabled}
        onPress={() => onChange('ALL')}
      />
      {NOTE_TAGS.map((tag) => (
        <Chip
          key={tag}
          label={TAG_LABELS[tag]}
          active={active === tag}
          disabled={disabled}
          onPress={() => onChange(tag)}
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
