/**
 * Vaasenk Mobile — Publish Progress Card (Sprint 7.3).
 *
 * Surfaces the inline progress + milestone ticker for two long-running
 * teacher actions:
 *   1. Note upload (QuickUploadScreen) — driven by an XHR progress %.
 *   2. Paper generation (GeneratePaperScreen) — driven by a job poll.
 *
 * Both pass an int 0–100 plus an optional milestone label.
 *
 * Visual lineage: design-docs §4 "Deep AI Glow" hero card with a glassy
 * white inset progress bar. Used over the gradient so we use white text
 * inside a glass surface.
 */

import { ActivityIndicator, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradientProps, vaasenkNative } from '@/theme/tokens';

type Props = {
  title: string;
  percent: number;
  milestone?: string;
  /** Tone of the gradient — orange for upload, deep glow for AI. */
  tone?: 'orange' | 'glow';
};

export function PublishProgressCard({
  title,
  percent,
  milestone,
  tone = 'orange',
}: Props) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));

  // Deep AI Glow gradient isn't in the native token table; inline the hex
  // stops per CLAUDE.md §4 with a TODO so the polish sprint can add it.
  // TODO(polish): expose `deepAIGlow` in packages/ui/tokens/native-theme.ts
  //   colors: ['#3B0010', '#780018', '#A00000', '#FF8A00']
  //   locations: [0, 0.45, 0.7, 1]
  const gradientColors =
    tone === 'glow'
      ? (['#3B0010', '#780018', '#A00000', '#FF8A00'] as const)
      : null;

  const gradient =
    tone === 'glow' ? null : gradientProps('heroSunrise');

  return (
    <View
      style={[
        {
          borderRadius: vaasenkNative.radius.xl,
          overflow: 'hidden',
        },
        vaasenkNative.shadows.glowRed,
      ]}
    >
      {tone === 'glow' && gradientColors ? (
        <LinearGradient
          colors={gradientColors as unknown as readonly [string, string, ...string[]]}
          locations={[0, 0.45, 0.7, 1] as unknown as readonly [number, number, ...number[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ padding: vaasenkNative.spacing.xl }}
        >
          <ProgressBody
            title={title}
            percent={clamped}
            milestone={milestone}
          />
        </LinearGradient>
      ) : gradient ? (
        <LinearGradient
          {...gradient}
          style={{ padding: vaasenkNative.spacing.xl }}
        >
          <ProgressBody
            title={title}
            percent={clamped}
            milestone={milestone}
          />
        </LinearGradient>
      ) : null}
    </View>
  );
}

function ProgressBody({
  title,
  percent,
  milestone,
}: {
  title: string;
  percent: number;
  milestone?: string;
}) {
  return (
    <View style={{ gap: vaasenkNative.spacing.md }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: vaasenkNative.spacing.sm,
        }}
      >
        <ActivityIndicator color={vaasenkNative.colors.text.inverse} />
        <Text
          numberOfLines={1}
          style={{
            color: vaasenkNative.colors.text.inverse,
            fontWeight: '800',
            fontSize: 16,
            flex: 1,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            color: vaasenkNative.colors.text.inverse,
            fontWeight: '800',
            fontSize: 16,
            fontVariant: ['tabular-nums'],
          }}
        >
          {percent}%
        </Text>
      </View>
      <View
        style={{
          height: 8,
          borderRadius: 4,
          overflow: 'hidden',
          backgroundColor: 'rgba(255,255,255,0.22)',
        }}
      >
        <View
          style={{
            width: `${percent}%`,
            height: '100%',
            backgroundColor: vaasenkNative.colors.text.inverse,
            borderRadius: 4,
          }}
        />
      </View>
      {milestone ? (
        <Text
          numberOfLines={1}
          style={{
            color: 'rgba(255,255,255,0.92)',
            fontSize: 13,
            fontWeight: '600',
          }}
        >
          {milestone}
        </Text>
      ) : null}
    </View>
  );
}
