/**
 * Vaasenk Mobile — AISessionsScreen (Sprint 7.3).
 *
 * Backend reality (CLAUDE.md §6 / ai-chat.service.ts): AI chat sessions are
 * scoped per-classroom — there is no `GET /ai/sessions` aggregate. This
 * screen therefore requires a classroom selection FIRST. The flow is:
 *
 *   1. No classroom param → render a classroom picker view (list of
 *      teacher's classrooms with syllabus-ready hints).
 *   2. classroom param set → render the sessions list for that classroom
 *      with "+ New session" CTA.
 *
 * Tapping a session navigates to AIChat with the session loaded. Tapping
 * "+ New session" creates a session via POST and routes to AIChat.
 *
 * Mandatory disclaimer (CLAUDE.md §6 #5) is visible on the empty state
 * and at the top of the sessions list.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  ChevronRight,
  MessageCircle,
  Plus,
  ShieldAlert,
  Sparkles,
} from 'lucide-react-native';
import { ApiClientError } from '@/services/api';
import {
  listTeacherClassrooms,
  readClassroomsCache,
  type ClassroomView,
} from '@/services/classrooms';
import {
  AI_DISCLAIMER,
  createSession,
  listSessions,
  type ServerChatSession,
} from '@/services/ai-chat';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingShimmer } from '@/components/LoadingShimmer';
import { gradientProps, vaasenkNative } from '@/theme/tokens';
import type { TeacherAIScreenProps } from '@/navigation/types';

// Deep AI Glow gradient stops are inline because they're not exposed on
// the native theme yet. TODO(polish): add `deepAIGlow` to native-theme.ts
// gradients in a future polish sprint.
const DEEP_AI_GLOW = {
  colors: ['#3B0010', '#780018', '#A00000', '#FF8A00'] as const,
  locations: [0, 0.45, 0.7, 1] as const,
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
};

export function AISessionsScreen({
  navigation,
  route,
}: TeacherAIScreenProps<'AISessions'>) {
  const insets = useSafeAreaInsets();
  const classroomId = route.params?.classroomId ?? null;

  const [classrooms, setClassrooms] = useState<ClassroomView[]>(
    readClassroomsCache() ?? [],
  );
  const [classroomsLoading, setClassroomsLoading] = useState(
    !readClassroomsCache(),
  );
  const [classroomsError, setClassroomsError] = useState<string | null>(null);

  const [sessions, setSessions] = useState<ServerChatSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const selectedClassroom = useMemo(
    () => classrooms.find((c) => c.id === classroomId) ?? null,
    [classrooms, classroomId],
  );

  // ---------- Load classrooms ----------------------------------------------
  useEffect(() => {
    let cancelled = false;
    if (classrooms.length > 0) {
      setClassroomsLoading(false);
      return;
    }
    (async () => {
      try {
        const result = await listTeacherClassrooms();
        if (!cancelled) setClassrooms(result.data);
      } catch (err) {
        if (!cancelled) {
          const msg =
            err instanceof ApiClientError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Could not load classrooms.';
          setClassroomsError(msg);
        }
      } finally {
        if (!cancelled) setClassroomsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classrooms.length]);

  // ---------- Load sessions ------------------------------------------------
  const fetchSessions = useCallback(
    async (silent: boolean) => {
      if (!classroomId) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const result = await listSessions(classroomId);
        setSessions(result.data);
      } catch (err) {
        const msg =
          err instanceof ApiClientError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Could not load AI sessions.';
        setError(msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [classroomId],
  );

  useEffect(() => {
    if (classroomId) void fetchSessions(false);
  }, [classroomId, fetchSessions]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      if (!classroomId) return;
      void fetchSessions(true);
    });
    return unsub;
  }, [navigation, fetchSessions, classroomId]);

  // ---------- Actions ------------------------------------------------------
  const onPickClassroom = (id: string) => {
    navigation.setParams({ classroomId: id });
  };

  const onCreate = useCallback(async () => {
    if (!classroomId) return;
    setCreating(true);
    try {
      const result = await createSession(classroomId);
      navigation.navigate('AIChat', {
        classroomId,
        sessionId: result.session.id,
      });
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not create a new session.';
      setError(msg);
    } finally {
      setCreating(false);
    }
  }, [classroomId, navigation]);

  // ---------- Render: no classroom selected → picker ----------------------
  if (!classroomId) {
    return (
      <ScrollView
        style={{
          flex: 1,
          backgroundColor: vaasenkNative.colors.surface.warmCanvas,
        }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        <LinearGradient
          colors={
            DEEP_AI_GLOW.colors as unknown as readonly [
              string,
              string,
              ...string[],
            ]
          }
          locations={
            DEEP_AI_GLOW.locations as unknown as readonly [
              number,
              number,
              ...number[],
            ]
          }
          start={DEEP_AI_GLOW.start}
          end={DEEP_AI_GLOW.end}
          style={{
            paddingTop: insets.top + vaasenkNative.spacing.lg,
            paddingBottom: vaasenkNative.spacing['3xl'],
            paddingHorizontal: vaasenkNative.spacing.xl,
            borderBottomLeftRadius: vaasenkNative.radius['2xl'],
            borderBottomRightRadius: vaasenkNative.radius['2xl'],
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: vaasenkNative.colors.brand.gold,
                  fontSize: 12,
                  fontWeight: '800',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}
              >
                Vaasenk AI
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
                Ask your syllabus
              </Text>
              <Text
                style={{
                  marginTop: vaasenkNative.spacing.sm,
                  color: 'rgba(255,255,255,0.92)',
                  fontSize: 14,
                  lineHeight: 20,
                }}
              >
                Pick a classroom to start a syllabus-grounded chat. Every
                answer includes chapter and topic citations.
              </Text>
            </View>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: 'rgba(254,202,2,0.22)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={24} color={vaasenkNative.colors.brand.gold} />
            </View>
          </View>
        </LinearGradient>

        <DisclaimerChip />

        {classroomsError ? (
          <View style={{ marginTop: vaasenkNative.spacing.lg }}>
            <ErrorState
              message={classroomsError}
              onRetry={() => {
                setClassroomsError(null);
                setClassroomsLoading(true);
                void (async () => {
                  try {
                    const result = await listTeacherClassrooms();
                    setClassrooms(result.data);
                  } catch (err) {
                    const msg =
                      err instanceof ApiClientError
                        ? err.message
                        : err instanceof Error
                          ? err.message
                          : 'Could not load classrooms.';
                    setClassroomsError(msg);
                  } finally {
                    setClassroomsLoading(false);
                  }
                })();
              }}
            />
          </View>
        ) : null}

        {classroomsLoading ? (
          <View
            style={{
              paddingHorizontal: vaasenkNative.spacing.xl,
              marginTop: vaasenkNative.spacing.lg,
              gap: vaasenkNative.spacing.md,
            }}
          >
            <LoadingShimmer height={70} borderRadius={20} />
            <LoadingShimmer height={70} borderRadius={20} />
          </View>
        ) : null}

        {!classroomsLoading && !classroomsError && classrooms.length === 0 ? (
          <View style={{ marginTop: vaasenkNative.spacing.lg }}>
            <EmptyState
              icon={<ShieldAlert size={24} color={vaasenkNative.colors.text.deepMaroon} />}
              title="No classes assigned"
              description="Once your administrator assigns a class to you, the AI assistant becomes available here."
            />
          </View>
        ) : null}

        {!classroomsLoading && classrooms.length > 0 ? (
          <View
            style={{
              paddingHorizontal: vaasenkNative.spacing.xl,
              marginTop: vaasenkNative.spacing.lg,
              gap: vaasenkNative.spacing.md,
            }}
          >
            {classrooms.map((c) => (
              <ClassroomRow
                key={c.id}
                classroom={c}
                onPress={() => onPickClassroom(c.id)}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
    );
  }

  // ---------- Render: classroom selected → sessions list -------------------
  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: vaasenkNative.colors.surface.warmCanvas,
      }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void fetchSessions(true);
          }}
          tintColor={vaasenkNative.colors.brand.red}
          colors={[vaasenkNative.colors.brand.red]}
        />
      }
    >
      <LinearGradient
        colors={
          DEEP_AI_GLOW.colors as unknown as readonly [string, string, ...string[]]
        }
        locations={
          DEEP_AI_GLOW.locations as unknown as readonly [
            number,
            number,
            ...number[],
          ]
        }
        start={DEEP_AI_GLOW.start}
        end={DEEP_AI_GLOW.end}
        style={{
          paddingTop: insets.top + vaasenkNative.spacing.sm,
          paddingBottom: vaasenkNative.spacing.xl,
          paddingHorizontal: vaasenkNative.spacing.xl,
          borderBottomLeftRadius: vaasenkNative.radius['2xl'],
          borderBottomRightRadius: vaasenkNative.radius['2xl'],
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Pressable
            onPress={() => navigation.setParams({ classroomId: undefined })}
            accessibilityRole="button"
            accessibilityLabel="Pick another classroom"
            hitSlop={8}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(255,255,255,0.22)',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <ArrowLeft size={18} color={vaasenkNative.colors.text.inverse} />
          </Pressable>
          <Text
            style={{
              color: vaasenkNative.colors.brand.gold,
              fontSize: 12,
              fontWeight: '800',
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            Vaasenk AI
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={{ marginTop: vaasenkNative.spacing.md }}>
          <Text
            style={{
              color: vaasenkNative.colors.text.inverse,
              fontSize: 22,
              fontWeight: '800',
            }}
            numberOfLines={2}
          >
            {selectedClassroom?.subject?.name ??
              selectedClassroom?.name ??
              'Classroom'}
          </Text>
          <Text
            style={{
              marginTop: 2,
              color: 'rgba(255,255,255,0.92)',
              fontSize: 13,
            }}
          >
            {sessions.length === 0
              ? 'No chats yet — tap below to start one.'
              : `${sessions.length} ${sessions.length === 1 ? 'chat' : 'chats'}`}
          </Text>
        </View>
      </LinearGradient>

      <DisclaimerChip />

      {/* New session CTA */}
      <View
        style={{
          paddingHorizontal: vaasenkNative.spacing.xl,
          marginTop: vaasenkNative.spacing.md,
        }}
      >
        <Pressable
          onPress={onCreate}
          disabled={creating}
          accessibilityRole="button"
          accessibilityLabel="Start a new chat"
          style={({ pressed }) => ({ opacity: creating ? 0.6 : pressed ? 0.9 : 1 })}
        >
          <LinearGradient
            {...gradientProps('heroSunrise')}
            style={[
              {
                minHeight: vaasenkNative.components.button.minHeight,
                borderRadius: vaasenkNative.components.button.borderRadius,
                paddingHorizontal: vaasenkNative.spacing.xl,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: vaasenkNative.spacing.sm,
              },
              vaasenkNative.shadows.glowRed,
            ]}
          >
            {creating ? (
              <ActivityIndicator color={vaasenkNative.colors.text.inverse} />
            ) : (
              <Plus size={18} color={vaasenkNative.colors.text.inverse} />
            )}
            <Text
              style={{
                color: vaasenkNative.colors.text.inverse,
                fontWeight: '800',
                fontSize: 15,
              }}
            >
              {creating ? 'Creating session…' : 'Start a new chat'}
            </Text>
          </LinearGradient>
        </Pressable>
      </View>

      {error ? (
        <View style={{ marginTop: vaasenkNative.spacing.md }}>
          <ErrorState message={error} onRetry={() => fetchSessions(false)} />
        </View>
      ) : null}

      {loading && sessions.length === 0 && !error ? (
        <View
          style={{
            paddingHorizontal: vaasenkNative.spacing.xl,
            marginTop: vaasenkNative.spacing.md,
            gap: vaasenkNative.spacing.sm,
          }}
        >
          <LoadingShimmer height={70} borderRadius={20} />
          <LoadingShimmer height={70} borderRadius={20} />
        </View>
      ) : null}

      {!loading && !error && sessions.length === 0 ? (
        <View style={{ marginTop: vaasenkNative.spacing.md }}>
          <EmptyState
            icon={<MessageCircle size={24} color={vaasenkNative.colors.text.deepMaroon} />}
            title="No chats yet"
            description="Tap the button above to start your first syllabus-grounded chat. Try asking for a chapter summary or a 5-question quiz."
          />
        </View>
      ) : null}

      {!loading && sessions.length > 0 ? (
        <View
          style={{
            paddingHorizontal: vaasenkNative.spacing.xl,
            marginTop: vaasenkNative.spacing.md,
            gap: vaasenkNative.spacing.sm,
          }}
        >
          {sessions.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              onPress={() =>
                navigation.navigate('AIChat', {
                  classroomId,
                  sessionId: s.id,
                })
              }
            />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function DisclaimerChip() {
  return (
    <View
      style={{
        marginTop: vaasenkNative.spacing.md,
        marginHorizontal: vaasenkNative.spacing.xl,
        paddingVertical: vaasenkNative.spacing.sm,
        paddingHorizontal: vaasenkNative.spacing.md,
        borderRadius: vaasenkNative.radius.md,
        backgroundColor: 'rgba(254,202,2,0.18)',
        borderWidth: 1,
        borderColor: 'rgba(160,0,0,0.12)',
        flexDirection: 'row',
        gap: 6,
        alignItems: 'center',
      }}
    >
      <Sparkles size={14} color={vaasenkNative.colors.text.deepMaroon} />
      <Text
        style={{
          flex: 1,
          color: vaasenkNative.colors.text.deepMaroon,
          fontSize: 12,
          fontWeight: '600',
          lineHeight: 16,
        }}
      >
        {AI_DISCLAIMER}
      </Text>
    </View>
  );
}

function ClassroomRow({
  classroom,
  onPress,
}: {
  classroom: ClassroomView;
  onPress: () => void;
}) {
  const ready = classroom.syllabus?.status === 'AI_READY';
  const subject = classroom.subject?.name ?? classroom.name;
  const sub = [classroom.class?.name, classroom.section?.name]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${subject}, syllabus ${ready ? 'ready' : 'preparing'}`}
      style={({ pressed }) => ({
        padding: vaasenkNative.spacing.lg,
        borderRadius: vaasenkNative.radius.lg,
        backgroundColor: vaasenkNative.colors.surface.glassWhite,
        borderWidth: 1,
        borderColor: 'rgba(160,0,0,0.1)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: vaasenkNative.spacing.md,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{
            color: vaasenkNative.colors.text.ink,
            fontWeight: '700',
            fontSize: 15,
          }}
        >
          {subject}
        </Text>
        {sub ? (
          <Text
            numberOfLines={1}
            style={{
              marginTop: 2,
              color: vaasenkNative.colors.text.muted,
              fontSize: 12,
            }}
          >
            {sub}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: vaasenkNative.spacing.xs }}>
          <View
            style={{
              paddingHorizontal: vaasenkNative.spacing.sm,
              paddingVertical: 2,
              borderRadius: vaasenkNative.radius.full,
              backgroundColor: ready
                ? 'rgba(23,167,91,0.14)'
                : 'rgba(245,158,11,0.18)',
            }}
          >
            <Text
              style={{
                color: ready
                  ? vaasenkNative.colors.semantic.success
                  : vaasenkNative.colors.semantic.warning,
                fontSize: 11,
                fontWeight: '700',
                letterSpacing: 0.4,
                textTransform: 'uppercase',
              }}
            >
              {ready ? 'AI ready' : 'Syllabus preparing'}
            </Text>
          </View>
        </View>
      </View>
      <ChevronRight size={18} color={vaasenkNative.colors.text.subtle} />
    </Pressable>
  );
}

function SessionRow({
  session,
  onPress,
}: {
  session: ServerChatSession;
  onPress: () => void;
}) {
  const relative = formatRelative(session.lastMessageAt ?? session.createdAt);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open chat: ${session.title ?? 'Untitled chat'}`}
      style={({ pressed }) => ({
        padding: vaasenkNative.spacing.lg,
        borderRadius: vaasenkNative.radius.lg,
        backgroundColor: vaasenkNative.colors.surface.glassWhite,
        borderWidth: 1,
        borderColor: 'rgba(160,0,0,0.1)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: vaasenkNative.spacing.md,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: 'rgba(254,202,2,0.22)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MessageCircle size={18} color={vaasenkNative.colors.text.deepMaroon} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{
            color: vaasenkNative.colors.text.ink,
            fontWeight: '700',
            fontSize: 15,
          }}
        >
          {session.title ?? 'Untitled chat'}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            marginTop: 2,
            color: vaasenkNative.colors.text.muted,
            fontSize: 12,
          }}
        >
          {session.messageCount} {session.messageCount === 1 ? 'message' : 'messages'}
          {relative ? ` · ${relative}` : ''}
        </Text>
      </View>
      <ChevronRight size={18} color={vaasenkNative.colors.text.subtle} />
    </Pressable>
  );
}

function formatRelative(iso: string | null): string {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  const diff = Date.now() - t.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'Just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  const days = Math.floor(diff / day);
  if (days < 2) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return t.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}
