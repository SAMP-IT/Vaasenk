/**
 * Vaasenk Mobile — AI Confidence Badge (Sprint 7.3).
 *
 * Surfaces the `aiConfidence` score (0–1) returned by the paper generator
 * worker. Bucketed into 3 tiers (high ≥ 0.8, medium ≥ 0.6, low) with
 * matching tone (success / gold / muted). Used on the PaperPreviewScreen
 * sidebar AND the GeneratePaper completion card.
 *
 * Per CLAUDE.md §4 colours come from `vaasenkNative.colors`; never
 * hardcoded.
 */

import { Sparkles } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { vaasenkNative } from '@/theme/tokens';

type Tone = 'success' | 'warning' | 'muted';

type Props = {
  /** 0–1 confidence score (paper.aiConfidence). null/undefined → muted. */
  confidence?: number | null;
};

export function ConfidenceBadge({ confidence }: Props) {
  const tone: Tone =
    confidence == null
      ? 'muted'
      : confidence >= 0.8
        ? 'success'
        : confidence >= 0.6
          ? 'warning'
          : 'muted';

  const palette = TONE[tone];
  const pct = confidence == null ? null : Math.round(confidence * 100);

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={
        pct == null ? 'AI confidence unavailable' : `AI confidence ${pct}%`
      }
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: vaasenkNative.spacing.md,
        paddingVertical: 6,
        borderRadius: vaasenkNative.radius.full,
        backgroundColor: palette.bg,
        borderWidth: 1,
        borderColor: palette.border,
        alignSelf: 'flex-start',
      }}
    >
      <Sparkles size={14} color={palette.fg} />
      <Text
        style={{
          color: palette.fg,
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.4,
          textTransform: 'uppercase',
        }}
      >
        {pct == null ? 'AI confidence' : `AI confidence · ${pct}%`}
      </Text>
    </View>
  );
}

const TONE: Record<Tone, { bg: string; border: string; fg: string }> = {
  success: {
    bg: 'rgba(23,167,91,0.14)',
    border: 'rgba(23,167,91,0.35)',
    fg: vaasenkNative.colors.semantic.success,
  },
  warning: {
    bg: 'rgba(254,202,2,0.18)',
    border: 'rgba(160,0,0,0.18)',
    fg: vaasenkNative.colors.text.deepMaroon,
  },
  muted: {
    bg: vaasenkNative.colors.surface.glassWhite,
    border: 'rgba(160,0,0,0.14)',
    fg: vaasenkNative.colors.text.muted,
  },
};
