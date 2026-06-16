/**
 * Vaasenk Mobile — Teacher ClassroomsListScreen (Sprint 7.3).
 *
 * Lists every classroom assigned to (or where the teacher is a member of)
 * the current user. Teacher-themed (Teacher Orange) variant of the
 * student ClassroomsListScreen — same data shape but uses the
 * TeacherClassroomCard so the visual personality switches.
 *
 * No "Create" CTA because the backend's `POST /classrooms` is
 * `@Roles(ADMIN, SUPER_ADMIN)` — only admins create classrooms. Documented
 * as a gap in services/classrooms.ts. A subtle "Need a new class? Ask
 * your admin" footer keeps the contract explicit.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { GraduationCap, Layers } from 'lucide-react-native';
import { ApiClientError } from '@/services/api';
import {
  listTeacherClassrooms,
  readClassroomsCache,
  type ClassroomView,
} from '@/services/classrooms';
import { TeacherClassroomCard } from '@/components/teacher/TeacherClassroomCard';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingShimmer } from '@/components/LoadingShimmer';
import { gradientProps, vaasenkNative } from '@/theme/tokens';
import type { TeacherClassroomsScreenProps } from '@/navigation/types';

export function TeacherClassroomsListScreen({
  navigation,
}: TeacherClassroomsScreenProps<'ClassroomsList'>) {
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
      const result = await listTeacherClassrooms();
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

  const openDetail = (id: string) =>
    navigation.navigate('ClassroomDetail', { classroomId: id, initialTab: 'notes' });

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
      <LinearGradient
        {...gradientProps('goldCard')}
        style={{
          paddingTop: insets.top + vaasenkNative.spacing.lg,
          paddingBottom: vaasenkNative.spacing['3xl'],
          paddingHorizontal: vaasenkNative.spacing.xl,
          borderBottomLeftRadius: vaasenkNative.radius['2xl'],
          borderBottomRightRadius: vaasenkNative.radius['2xl'],
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: 'rgba(255,255,255,0.9)',
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
              My classes
            </Text>
            <Text
              style={{
                marginTop: vaasenkNative.spacing.sm,
                color: 'rgba(255,255,255,0.95)',
                fontSize: 14,
              }}
            >
              {classrooms.length === 0
                ? 'Once an administrator assigns you a class, it appears here.'
                : `${classrooms.length} ${classrooms.length === 1 ? 'class' : 'classes'} assigned`}
            </Text>
          </View>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: 'rgba(255,255,255,0.22)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <GraduationCap size={24} color={vaasenkNative.colors.text.inverse} />
          </View>
        </View>
      </LinearGradient>

      {error ? (
        <View style={{ marginTop: vaasenkNative.spacing.xl }}>
          <ErrorState message={error} onRetry={() => fetchAll(false)} />
        </View>
      ) : null}

      {loading && classrooms.length === 0 && !error ? (
        <View style={{ paddingTop: vaasenkNative.spacing.xl }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <View
              key={i}
              style={{
                marginHorizontal: vaasenkNative.spacing.xl,
                marginBottom: vaasenkNative.spacing.md,
              }}
            >
              <LoadingShimmer height={130} borderRadius={28} />
            </View>
          ))}
        </View>
      ) : null}

      {!loading && !error && classrooms.length === 0 ? (
        <View style={{ marginTop: vaasenkNative.spacing.xl }}>
          <EmptyState
            icon={<Layers size={24} color={vaasenkNative.colors.text.deepMaroon} />}
            title="No classes yet"
            description="Your administrator hasn't assigned a class to you. Once they do, your classrooms will appear here."
          />
        </View>
      ) : null}

      {!loading && !error && classrooms.length > 0 ? (
        <View style={{ marginTop: vaasenkNative.spacing.xl }}>
          {classrooms.map((c) => (
            <TeacherClassroomCard
              key={c.id}
              classroom={c}
              onPress={() => openDetail(c.id)}
            />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}
