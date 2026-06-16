/**
 * Vaasenk Mobile — EmptyState card.
 *
 * Used across student screens whenever a list comes back empty. Glassy
 * card on the cream canvas, optional icon + CTA. Mirrors the web's
 * EmptyState component (apps/web/src/components/ui/empty-state.tsx) in
 * spirit — see CLAUDE.md §5 "5 component states" rule.
 */

import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { vaasenkNative } from '@/theme/tokens';

type Props = {
  title: string;
  description?: string;
  /** Optional icon node (e.g. a lucide icon). 24–32px recommended. */
  icon?: ReactNode;
  cta?: {
    label: string;
    onPress: () => void;
  };
};

export function EmptyState({ title, description, icon, cta }: Props) {
  return (
    <View
      style={{
        marginHorizontal: vaasenkNative.spacing.xl,
        padding: vaasenkNative.spacing['2xl'],
        borderRadius: vaasenkNative.radius.xl,
        backgroundColor: vaasenkNative.colors.surface.glassWhite,
        borderWidth: 1,
        borderColor: 'rgba(160,0,0,0.08)',
        alignItems: 'center',
      }}
    >
      {icon ? (
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: vaasenkNative.radius.lg,
            backgroundColor: 'rgba(254,202,2,0.22)',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: vaasenkNative.spacing.md,
          }}
        >
          {icon}
        </View>
      ) : null}

      <Text
        style={{
          color: vaasenkNative.colors.text.ink,
          fontSize: vaasenkNative.typography.section.fontSize,
          lineHeight: vaasenkNative.typography.section.lineHeight,
          fontWeight: vaasenkNative.typography.section.fontWeight,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>

      {description ? (
        <Text
          style={{
            marginTop: vaasenkNative.spacing.sm,
            color: vaasenkNative.colors.text.muted,
            fontSize: vaasenkNative.typography.body.fontSize,
            lineHeight: vaasenkNative.typography.body.lineHeight,
            textAlign: 'center',
          }}
        >
          {description}
        </Text>
      ) : null}

      {cta ? (
        <Pressable
          onPress={cta.onPress}
          accessibilityRole="button"
          accessibilityLabel={cta.label}
          style={({ pressed }) => ({
            marginTop: vaasenkNative.spacing.lg,
            minHeight: vaasenkNative.components.button.minHeight,
            paddingHorizontal: vaasenkNative.spacing['2xl'],
            borderRadius: vaasenkNative.components.button.borderRadius,
            backgroundColor: vaasenkNative.colors.brand.red,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text
            style={{
              color: vaasenkNative.colors.text.inverse,
              fontWeight: '700',
              fontSize: 15,
            }}
          >
            {cta.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
