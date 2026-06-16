/**
 * Vaasenk Mobile — ErrorState.
 *
 * Inline error card with optional retry. Used wherever a fetch failure
 * needs to be surfaced inline (lists, detail screens). Color uses the
 * Vaasenk danger token, never hardcoded.
 */

import { AlertCircle } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { vaasenkNative } from '@/theme/tokens';

type Props = {
  title?: string;
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
};

export function ErrorState({
  title = 'Something went wrong',
  message,
  retryLabel = 'Try again',
  onRetry,
}: Props) {
  return (
    <View
      accessibilityRole="alert"
      style={{
        marginHorizontal: vaasenkNative.spacing.xl,
        padding: vaasenkNative.spacing.xl,
        borderRadius: vaasenkNative.radius.lg,
        backgroundColor: 'rgba(220,38,38,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(220,38,38,0.28)',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: vaasenkNative.spacing.md,
        }}
      >
        <AlertCircle
          size={20}
          color={vaasenkNative.colors.semantic.danger}
        />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: vaasenkNative.colors.semantic.danger,
              fontWeight: '700',
              fontSize: 15,
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              marginTop: 4,
              color: 'rgba(220,38,38,0.92)',
              fontSize: 13,
              lineHeight: 18,
            }}
          >
            {message}
          </Text>
        </View>
      </View>

      {onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
          style={({ pressed }) => ({
            marginTop: vaasenkNative.spacing.md,
            alignSelf: 'flex-start',
            paddingHorizontal: vaasenkNative.spacing.lg,
            paddingVertical: vaasenkNative.spacing.sm,
            borderRadius: vaasenkNative.radius.full,
            borderWidth: 1,
            borderColor: 'rgba(220,38,38,0.5)',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text
            style={{
              color: vaasenkNative.colors.semantic.danger,
              fontWeight: '700',
              fontSize: 13,
            }}
          >
            {retryLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
