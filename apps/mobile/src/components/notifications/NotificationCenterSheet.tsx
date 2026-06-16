/**
 * Vaasenk Mobile — NotificationCenterSheet (Sprint 7.4).
 *
 * Slide-up Modal containing the notification feed. Mirrors the web's bell
 * dropdown UX from Sprint 6.2:
 *
 *   - Title + close button + "Mark all read" at the top.
 *   - Groups: Today / Yesterday / This week / Older.
 *   - Tap a row: optimistic mark-as-read + dispatch to deep-link router.
 *   - Empty state: "You're all caught up."
 *   - Error state: red inline card + "Try again".
 *   - Loading state: three shimmer rows.
 *   - Disabled state: rendered when the user is mid-logout; sheet is
 *     unmountable but tap is no-op (defensive — Provider should have torn
 *     down before this hits).
 *
 * Per CLAUDE.md §4:
 *   - Glassmorphic card surfaces, brand colors only, no hardcoded hex.
 *   - Touch targets >= 44px on every interactive row.
 *   - Lucide icons consistent with the rest of the app.
 */

import {
  Bell,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  FileText,
  GraduationCap,
  Megaphone,
  Sparkles,
  Users,
  X,
} from 'lucide-react-native';
import { useMemo } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/services/auth-context';
import { useNotificationsContext } from '@/services/notifications-context';
import { getDeepLinkForNotification } from '@/services/push-links';
import { navigationRef } from '@/navigation/navigation-ref';
import { vaasenkNative } from '@/theme/tokens';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingShimmer } from '@/components/LoadingShimmer';
import type {
  NotificationGroup,
  NotificationGroupKey,
  NotificationType,
  NotificationView,
} from '@/services/notifications-types';

type Props = {
  visible: boolean;
  onClose: () => void;
};

// ---------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function diffInDays(a: Date, b: Date): number {
  const ms = startOfDay(a).getTime() - startOfDay(b).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function groupNotifications(
  notifications: NotificationView[],
): NotificationGroup[] {
  const now = new Date();
  const buckets: Record<NotificationGroupKey, NotificationView[]> = {
    today: [],
    yesterday: [],
    'this-week': [],
    older: [],
  };

  for (const n of notifications) {
    const d = new Date(n.createdAt);
    const days = diffInDays(now, d);
    if (days <= 0) {
      buckets.today.push(n);
    } else if (days === 1) {
      buckets.yesterday.push(n);
    } else if (days <= 7) {
      buckets['this-week'].push(n);
    } else {
      buckets.older.push(n);
    }
  }

  const labels: Record<NotificationGroupKey, string> = {
    today: 'Today',
    yesterday: 'Yesterday',
    'this-week': 'This week',
    older: 'Older',
  };

  return (
    Object.keys(buckets) as NotificationGroupKey[]
  )
    .map((k) => ({ key: k, label: labels[k], items: buckets[k] }))
    .filter((g) => g.items.length > 0);
}

// ---------------------------------------------------------------------
// Per-type icon
// ---------------------------------------------------------------------

function iconForType(type: NotificationType | string) {
  switch (type) {
    case 'NOTE_PUBLISHED':
      return FileText;
    case 'PAPER_GENERATED':
    case 'PAPER_READY':
    case 'PAPER_FAILED':
      return GraduationCap;
    case 'SYLLABUS_READY':
    case 'SYLLABUS_FAILED':
    case 'SYLLABUS_PROCESSED':
    case 'AI_READY':
      return Sparkles;
    case 'CLASSROOM_JOINED':
    case 'CLASSROOM_INVITE':
      return Users;
    case 'AI_CREDITS_LOW':
      return CircleAlert;
    case 'SYSTEM_ANNOUNCEMENT':
    case 'SYSTEM':
    default:
      return Megaphone;
  }
}

function tintForType(type: NotificationType | string): string {
  switch (type) {
    case 'NOTE_PUBLISHED':
      return vaasenkNative.colors.brand.red;
    case 'PAPER_GENERATED':
    case 'PAPER_READY':
      return vaasenkNative.colors.brand.sunriseOrange;
    case 'PAPER_FAILED':
    case 'SYLLABUS_FAILED':
      return vaasenkNative.colors.semantic.danger;
    case 'SYLLABUS_READY':
    case 'SYLLABUS_PROCESSED':
    case 'AI_READY':
      return vaasenkNative.colors.brand.gold;
    case 'CLASSROOM_JOINED':
    case 'CLASSROOM_INVITE':
      return vaasenkNative.colors.brand.coralPink;
    case 'AI_CREDITS_LOW':
      return vaasenkNative.colors.semantic.warning;
    default:
      return vaasenkNative.colors.text.muted;
  }
}

// ---------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// ---------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------

function NotificationRow({
  item,
  onPress,
}: {
  item: NotificationView;
  onPress: (item: NotificationView) => void;
}) {
  const Icon = iconForType(item.type);
  const tint = tintForType(item.type);
  const isUnread = item.readAt === null;

  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={item.title}
      accessibilityHint={
        isUnread ? 'Unread notification. Tap to open.' : 'Tap to open.'
      }
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: vaasenkNative.spacing.md,
        paddingHorizontal: vaasenkNative.spacing.xl,
        paddingVertical: vaasenkNative.spacing.md,
        minHeight: 64,
        backgroundColor: isUnread
          ? 'rgba(254,202,2,0.07)'
          : 'transparent',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: `${tint}1F`, // ~12% opacity tint
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon color={tint} size={18} strokeWidth={2} />
      </View>

      <View style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: vaasenkNative.spacing.sm,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              color: vaasenkNative.colors.text.ink,
              fontSize: 14,
              fontWeight: isUnread ? '700' : '600',
            }}
          >
            {item.title}
          </Text>
          <Text
            style={{
              color: vaasenkNative.colors.text.muted,
              fontSize: 11,
              fontWeight: '500',
            }}
          >
            {formatRelative(item.createdAt)}
          </Text>
        </View>
        {item.body ? (
          <Text
            numberOfLines={2}
            style={{
              marginTop: 2,
              color: vaasenkNative.colors.text.muted,
              fontSize: 13,
              lineHeight: 18,
            }}
          >
            {item.body}
          </Text>
        ) : null}
      </View>

      <ChevronRight
        size={16}
        color={vaasenkNative.colors.text.subtle}
        style={{ marginTop: 10 }}
      />
    </Pressable>
  );
}

// ---------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------

function LoadingRows() {
  return (
    <View>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: vaasenkNative.spacing.md,
            paddingHorizontal: vaasenkNative.spacing.xl,
            paddingVertical: vaasenkNative.spacing.md,
          }}
        >
          <LoadingShimmer width={36} height={36} borderRadius={18} />
          <View style={{ flex: 1, gap: vaasenkNative.spacing.xs }}>
            <LoadingShimmer width={'70%'} height={14} />
            <LoadingShimmer width={'90%'} height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------

export function NotificationCenterSheet({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const {
    notifications,
    unreadTotal,
    isLoading,
    error,
    markRead,
    markAllRead,
    refetch,
  } = useNotificationsContext();

  const groups = useMemo(
    () => groupNotifications(notifications),
    [notifications],
  );

  const handleRowPress = async (item: NotificationView) => {
    // Optimistic mark-read — the hook handles the rollback on failure.
    if (item.readAt === null) {
      try {
        await markRead(item.id);
      } catch {
        // Swallow — UI keeps the optimistic state.
      }
    }

    if (!user) {
      onClose();
      return;
    }

    const target = getDeepLinkForNotification(item, user.role);
    onClose();

    if (target && navigationRef.isReady()) {
      // Allow the modal to dismiss before navigating; the OS animation
      // looks better when navigation kicks in on the next tick. Same
      // cast trick as RootNavigator — the discriminated target shape
      // doesn't line up with React Navigation's overload union.
      const navigate = navigationRef.navigate as unknown as (
        name: string,
        params: object,
      ) => void;
      setTimeout(() => {
        navigate(target.stack, target.params);
      }, 50);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllRead();
    } catch {
      // Hook handles rollback; nothing to surface here.
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      // statusBarTranslucent ensures the dimmed backdrop covers the status
      // bar on Android — matches iOS' modal behaviour.
      statusBarTranslucent
    >
      {/* Dimmed backdrop — tap to close. */}
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close notifications"
        style={{
          flex: 1,
          backgroundColor: 'rgba(35,21,22,0.42)',
          justifyContent: 'flex-end',
        }}
      >
        {/* Inner pressable absorbs taps so taps inside the sheet don't
            propagate to the backdrop and close it accidentally. */}
        <Pressable
          onPress={(event) => event.stopPropagation()}
          accessibilityRole="none"
          style={{
            maxHeight: '85%',
            backgroundColor: vaasenkNative.colors.surface.creamCard,
            borderTopLeftRadius: vaasenkNative.radius['2xl'],
            borderTopRightRadius: vaasenkNative.radius['2xl'],
            paddingBottom: insets.bottom + vaasenkNative.spacing.md,
          }}
        >
          {/* Drag handle — purely visual. */}
          <View
            accessibilityElementsHidden
            style={{
              alignSelf: 'center',
              width: 44,
              height: 5,
              borderRadius: 3,
              backgroundColor: vaasenkNative.colors.text.subtle,
              marginTop: vaasenkNative.spacing.md,
              opacity: 0.4,
            }}
          />

          {/* Header row */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: vaasenkNative.spacing.md,
              paddingHorizontal: vaasenkNative.spacing.xl,
              paddingTop: vaasenkNative.spacing.lg,
              paddingBottom: vaasenkNative.spacing.md,
            }}
          >
            <Bell
              color={vaasenkNative.colors.brand.red}
              size={22}
              strokeWidth={2}
            />
            <Text
              style={{
                flex: 1,
                color: vaasenkNative.colors.text.ink,
                fontSize: 18,
                fontWeight: '700',
              }}
            >
              Notifications
            </Text>

            {unreadTotal > 0 ? (
              <Pressable
                onPress={handleMarkAllRead}
                accessibilityRole="button"
                accessibilityLabel="Mark all read"
                hitSlop={8}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: vaasenkNative.spacing.md,
                  paddingVertical: 6,
                  borderRadius: vaasenkNative.radius.full,
                  backgroundColor: 'rgba(160,0,0,0.08)',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <CheckCheck
                  size={14}
                  color={vaasenkNative.colors.brand.red}
                  strokeWidth={2.5}
                />
                <Text
                  style={{
                    color: vaasenkNative.colors.brand.red,
                    fontSize: 12,
                    fontWeight: '700',
                  }}
                >
                  Mark all read
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={12}
              style={({ pressed }) => ({
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(35,21,22,0.05)',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <X color={vaasenkNative.colors.text.muted} size={18} />
            </Pressable>
          </View>

          {/* Body — five-state machine. */}
          {renderBody({
            isLoading,
            error,
            groups,
            handleRowPress,
            onRetry: () => {
              void refetch();
            },
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Body state machine
// ---------------------------------------------------------------------

type BodyArgs = {
  isLoading: boolean;
  error: { message: string } | null;
  groups: NotificationGroup[];
  handleRowPress: (item: NotificationView) => void;
  onRetry: () => void;
};

function renderBody({
  isLoading,
  error,
  groups,
  handleRowPress,
  onRetry,
}: BodyArgs) {
  // Loading — only the first paint. Subsequent refetches don't unmount
  // the list because we keep `notifications` populated across fetches.
  if (isLoading && groups.length === 0) {
    return <LoadingRows />;
  }

  // Error — only when there's nothing cached to show.
  if (error && groups.length === 0) {
    return (
      <View style={{ paddingVertical: vaasenkNative.spacing.lg }}>
        <ErrorState
          title="Couldn't load notifications"
          message={error.message}
          onRetry={onRetry}
          retryLabel="Try again"
        />
      </View>
    );
  }

  // Empty
  if (groups.length === 0) {
    return (
      <View
        style={{
          paddingVertical: vaasenkNative.spacing['3xl'],
        }}
      >
        <EmptyState
          icon={
            <Bell
              color={vaasenkNative.colors.brand.red}
              size={22}
              strokeWidth={2}
            />
          }
          title="You're all caught up"
          description="New notes, AI updates, and classroom activity will appear here."
        />
      </View>
    );
  }

  // Default — grouped list. Use FlatList for the largest group, ScrollView
  // for the rest (mobile keyboards can squeeze tall sheets; this keeps
  // scrolling smooth without nesting two virtualized lists).
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: vaasenkNative.spacing.lg }}
    >
      {error ? (
        // Soft error banner shown above cached items — user can still
        // read what's there but knows the live channel is degraded.
        <View
          style={{
            marginHorizontal: vaasenkNative.spacing.xl,
            marginTop: vaasenkNative.spacing.xs,
            marginBottom: vaasenkNative.spacing.sm,
            paddingHorizontal: vaasenkNative.spacing.md,
            paddingVertical: vaasenkNative.spacing.sm,
            borderRadius: vaasenkNative.radius.md,
            backgroundColor: 'rgba(220,38,38,0.06)',
          }}
        >
          <Text
            style={{
              color: vaasenkNative.colors.semantic.danger,
              fontSize: 12,
              fontWeight: '600',
            }}
          >
            Showing cached notifications. {error.message}
          </Text>
        </View>
      ) : null}

      {groups.map((group) => (
        <View key={group.key}>
          <Text
            style={{
              color: vaasenkNative.colors.text.muted,
              fontSize: 11,
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: 0.6,
              paddingHorizontal: vaasenkNative.spacing.xl,
              paddingTop: vaasenkNative.spacing.md,
              paddingBottom: vaasenkNative.spacing.xs,
            }}
          >
            {group.label}
          </Text>
          <FlatList
            data={group.items}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <NotificationRow item={item} onPress={handleRowPress} />
            )}
            scrollEnabled={false}
          />
        </View>
      ))}
    </ScrollView>
  );
}
