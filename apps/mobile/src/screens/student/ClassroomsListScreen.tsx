/**
 * Vaasenk Mobile — ClassroomsListScreen (Sprint 7.2).
 *
 * The Classrooms tab's root screen. Lists all classrooms the student is
 * enrolled in, with a "Join with code" button in the header. Mirrors the
 * web's classrooms section on the student dashboard but as a dedicated
 * full-screen list (since the mobile bottom tab promotes it from a
 * dashboard scroll-row to a top-level surface).
 *
 * 5 states (CLAUDE.md §5):
 *   default — list rendered, pull-to-refresh.
 *   loading — three shimmer cards.
 *   empty   — EmptyState with "Join a classroom" CTA.
 *   error   — ErrorState with retry.
 *   disabled — N/A (no interactive controls beyond press).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Layers, Plus } from 'lucide-react-native';
import { ApiClientError } from '@/services/api';
import {
  listMyClassrooms,
  readClassroomsCache,
  type ClassroomView,
} from '@/services/classrooms';
import { ClassroomCard } from '@/components/ClassroomCard';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingShimmer } from '@/components/LoadingShimmer';
import { gradientProps, vaasenkNative } from '@/theme/tokens';
import type { StudentClassroomsScreenProps } from '@/navigation/types';

export function ClassroomsListScreen({
  navigation,
}: StudentClassroomsScreenProps<'ClassroomsList'>) {
  const insets = useSafeAreaInsets();
  const cached = readClassroomsCache();

  const [classrooms, setClassrooms] = useState<ClassroomView[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seenInitialMount = useRef(false);

  const fetchAll = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await listMyClassrooms();
      setClassrooms(result.data);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Something went wrong.';
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
      seenInitialMount.current = true;
    }
  }, []);

  useEffect(() => {
    void fetchAll(false);
  }, [fetchAll]);

  // Refresh on focus so newly-joined classes appear here.
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      if (!seenInitialMount.current) return;
      void fetchAll(true);
    });
    return unsub;
  }, [navigation, fetchAll]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchAll(true);
  }, [fetchAll]);

  const openJoin = () =>
    navigation.navigate('StudentHome', { screen: 'JoinClassroom' });
  const openFeed = (id: string) =>
    navigation.navigate('ClassroomFeed', { classroomId: id });

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: vaasenkNative.colors.surface.warmCanvas,
      }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={vaasenkNative.colors.brand.red}
          colors={[vaasenkNative.colors.brand.red]}
        />
      }
    >
      {/* Hero — coral student tone */}
      <LinearGradient
        {...gradientProps('studentCandy')}
        style={{
          paddingTop: insets.top + vaasenkNative.spacing.lg,
          paddingBottom: vaasenkNative.spacing['3xl'],
          paddingHorizontal: vaasenkNative.spacing.xl,
          borderBottomLeftRadius: vaasenkNative.radius['2xl'],
          borderBottomRightRadius: vaasenkNative.radius['2xl'],
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: 'rgba(255,255,255,0.85)',
                fontSize: 12,
                fontWeight: '700',
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              Classes
            </Text>
            <Text
              style={{
                marginTop: vaasenkNative.spacing.sm,
                color: vaasenkNative.colors.text.inverse,
                fontSize: vaasenkNative.typography.title.fontSize,
                lineHeight: vaasenkNative.typography.title.lineHeight,
                fontWeight: vaasenkNative.typography.title.fontWeight,
              }}
            >
              My classrooms
            </Text>
            <Text
              style={{
                marginTop: vaasenkNative.spacing.sm,
                color: 'rgba(255,255,255,0.92)',
                fontSize: 14,
              }}
            >
              {classrooms.length === 0
                ? 'Tap join to enrol in your first class.'
                : `${classrooms.length} ${classrooms.length === 1 ? 'class' : 'classes'} enrolled`}
            </Text>
          </View>
          <Pressable
            onPress={openJoin}
            accessibilityRole="button"
            accessibilityLabel="Join with code"
            hitSlop={8}
            style={({ pressed }) => ({
              minHeight: 44,
              minWidth: 44,
              paddingHorizontal: vaasenkNative.spacing.md,
              paddingVertical: vaasenkNative.spacing.sm,
              borderRadius: vaasenkNative.radius.full,
              backgroundColor: 'rgba(255,255,255,0.22)',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Plus size={16} color={vaasenkNative.colors.text.inverse} />
            <Text
              style={{
                color: vaasenkNative.colors.text.inverse,
                fontWeight: '800',
                fontSize: 13,
              }}
            >
              Join
            </Text>
          </Pressable>
        </View>
      </LinearGradient>

      {/* Body */}
      {error ? (
        <View style={{ marginTop: vaasenkNative.spacing.xl }}>
          <ErrorState message={error} onRetry={() => fetchAll(false)} />
        </View>
      ) : null}

      {loading && classrooms.length === 0 && !error ? (
        <View
          style={{
            paddingTop: vaasenkNative.spacing.xl,
          }}
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <View
              key={i}
              style={{
                marginHorizontal: vaasenkNative.spacing.xl,
                marginBottom: vaasenkNative.spacing.md,
              }}
            >
              <LoadingShimmer height={120} borderRadius={28} />
            </View>
          ))}
        </View>
      ) : null}

      {!loading && !error && classrooms.length === 0 ? (
        <View style={{ marginTop: vaasenkNative.spacing.xl }}>
          <EmptyState
            icon={<Layers size={24} color={vaasenkNative.colors.text.deepMaroon} />}
            title="No classrooms yet"
            description="Get a 6-character invite code from your teacher and tap Join to enrol."
            cta={{ label: 'Join a classroom', onPress: openJoin }}
          />
        </View>
      ) : null}

      {!loading && !error && classrooms.length > 0 ? (
        <View style={{ marginTop: vaasenkNative.spacing.xl }}>
          {classrooms.map((c) => (
            <ClassroomCard
              key={c.id}
              classroom={c}
              onPress={() => openFeed(c.id)}
            />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}
