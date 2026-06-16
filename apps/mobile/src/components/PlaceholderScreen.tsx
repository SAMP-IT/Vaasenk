/**
 * Vaasenk Mobile — Tab placeholder screen.
 *
 * Sprint 7.1 only ships the scaffold; the actual student/teacher tab
 * content lands in 7.2 and 7.3. Each tab mounts this component with a
 * role-themed gradient hero plus a "Coming in Sprint 7.X" empty state so
 * QA can verify navigation works end-to-end before the screens fill in.
 *
 * Implements all 5 component states (CLAUDE.md §5) in the trivial sense:
 *   - default:  the placeholder
 *   - loading:  N/A (no async work)
 *   - empty:    THIS IS the empty state — the friendly card + CTA
 *   - error:    N/A (no async work)
 *   - disabled: N/A (no interactive controls in 7.1)
 */

import { ScrollView, Text, View } from 'react-native';
import { GradientHero } from './GradientHero';
import { vaasenkNative, type VaasenkNativeRole } from '@/theme/tokens';

type Props = {
  title: string;
  subtitle: string;
  /** "Coming in Sprint 7.2" badge text. */
  comingIn: string;
  role: VaasenkNativeRole;
};

export function PlaceholderScreen({ title, subtitle, comingIn, role }: Props) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: vaasenkNative.colors.surface.warmCanvas }}
      contentContainerStyle={{ paddingBottom: vaasenkNative.spacing['6xl'] }}
    >
      <GradientHero title={title} subtitle={subtitle} role={role} />

      <View style={{ padding: vaasenkNative.spacing.xl }}>
        <View
          style={[
            vaasenkNative.components.card,
            vaasenkNative.shadows.cardSoft,
            {
              borderWidth: 1,
              borderColor: 'rgba(160,0,0,0.08)',
            },
          ]}
        >
          <View
            style={{
              alignSelf: 'flex-start',
              paddingHorizontal: vaasenkNative.spacing.md,
              paddingVertical: vaasenkNative.spacing.xs,
              borderRadius: vaasenkNative.radius.full,
              backgroundColor: 'rgba(254,202,2,0.18)',
              marginBottom: vaasenkNative.spacing.lg,
            }}
          >
            <Text
              style={{
                color: vaasenkNative.colors.text.deepMaroon,
                fontSize: vaasenkNative.typography.label.fontSize,
                fontWeight: vaasenkNative.typography.label.fontWeight,
                letterSpacing: 0.5,
              }}
            >
              {comingIn.toUpperCase()}
            </Text>
          </View>

          <Text
            style={{
              color: vaasenkNative.colors.text.ink,
              fontSize: vaasenkNative.typography.section.fontSize,
              lineHeight: vaasenkNative.typography.section.lineHeight,
              fontWeight: vaasenkNative.typography.section.fontWeight,
              marginBottom: vaasenkNative.spacing.sm,
            }}
          >
            Screen scaffolded
          </Text>

          <Text
            style={{
              color: vaasenkNative.colors.text.muted,
              fontSize: vaasenkNative.typography.body.fontSize,
              lineHeight: vaasenkNative.typography.body.lineHeight,
            }}
          >
            Sprint 7.1 wired the navigation, auth, and theming. The real
            content for this tab arrives in the next session. Confirm tab
            switching, gradients, and safe-area insets here.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
