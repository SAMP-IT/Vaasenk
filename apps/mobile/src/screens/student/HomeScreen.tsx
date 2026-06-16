/**
 * Vaasenk Mobile — StudentHomeScreen (Sprint 7.2).
 *
 * Mirrors apps/web/src/app/(dashboard)/student/student-dashboard-client.tsx:
 *   - Time-of-day greeting based on the user's name.
 *   - 3 quick actions: Join classroom (modal), Bookmarks (tab), Downloads (tab).
 *   - Recent notes horizontal scroll (top 6 across all classrooms,
 *     fan-out fetch via Promise.allSettled like the web).
 *   - Classrooms horizontal scroll using the coral ClassroomCard.
 *   - Empty state when the student has zero classrooms (illustration +
 *     "Join your first classroom" CTA that opens the join screen).
 *
 * Pull-to-refresh re-fetches everything in parallel. The classrooms list
 * is also fed by the module-level cache in services/classrooms.ts so
 * tab-switches paint immediately.
 *
 * 5 states (CLAUDE.md §5):
 *   default — content rendered.
 *   loading — shimmer placeholders for both sections.
 *   empty   — friendly empty card pointing to Join.
 *   error   — inline ErrorState with retry.
 *   disabled — N/A.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bookmark,
  Download,
  FileText,
  Image as ImageIcon,
  Sparkles,
  Sunrise,
  UserPlus,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import { useAuth } from '@/services/auth-context';
import {
  listMyClassrooms,
  readClassroomsCache,
  type ClassroomView,
} from '@/services/classrooms';
import { listClassroomNotes, type NoteView } from '@/services/notes';
import { ApiClientError } from '@/services/api';
import { ClassroomCard } from '@/components/ClassroomCard';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingShimmer } from '@/components/LoadingShimmer';
import { gradientProps, vaasenkNative } from '@/theme/tokens';
import type { StudentHomeScreenProps } from '@/navigation/types';

const RECENT_PER_CLASSROOM = 5;
const RECENT_TOTAL = 6;

export function StudentHomeScreen({
  navigation,
}: StudentHomeScreenProps<'HomeRoot'>) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const cached = readClassroomsCache();

  const [classrooms, setClassrooms] = useState<ClassroomView[]>(cached ?? []);
  const [recent, setRecent] = useState<NoteView[]>([]);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seenInitialMount = useRef(false);

  const greeting = useMemo(() => greetingFor(user?.name ?? ''), [user?.name]);

  const fetchAll = useCallback(
    async (silent: boolean) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const classroomsResult = await listMyClassrooms();
        setClassrooms(classroomsResult.data);

        // Fan out per-classroom recent notes in parallel.
        const noteBatches = await Promise.allSettled(
          classroomsResult.data.map((c) =>
            listClassroomNotes(c.id, {
              limit: RECENT_PER_CLASSROOM,
              sort: 'publishedAt:desc',
            }).then((r) => ({ classroom: c, notes: r.data })),
          ),
        );

        const merged: NoteView[] = [];
        noteBatches.forEach((batch, i) => {
          const classroom = classroomsResult.data[i];
          if (!classroom) return;
          if (batch.status !== 'fulfilled') return;
          for (const note of batch.value.notes) {
            merged.push({
              ...note,
              classroom: note.classroom ?? {
                id: classroom.id,
                name: classroom.name,
              },
            });
          }
        });

        // Sort by publishedAt desc, fallback createdAt.
        merged.sort((a, b) => {
          const at = new Date(a.publishedAt ?? a.createdAt).getTime();
          const bt = new Date(b.publishedAt ?? b.createdAt).getTime();
          return bt - at;
        });
        setRecent(merged.slice(0, RECENT_TOTAL));
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
    },
    [],
  );

  useEffect(() => {
    void fetchAll(false);
  }, [fetchAll]);

  // Refresh on tab focus so a successful Join surfaces here immediately.
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

  const openJoin = () => navigation.navigate('JoinClassroom');
  const openBookmarks = () =>
    navigation.navigate('StudentBookmarks', { screen: 'BookmarksList' });
  const openDownloads = () =>
    navigation.navigate('StudentDownloads', { screen: 'DownloadsList' });
  const openClassroom = (id: string) =>
    navigation.navigate('StudentClassrooms', {
      screen: 'ClassroomFeed',
      params: { classroomId: id },
    });
  const openNote = (note: NoteView) =>
    navigation.navigate('StudentClassrooms', {
      screen: 'NoteDetail',
      params: { noteId: note.id, classroomId: note.classroomId },
    });

  const hasClassrooms = classrooms.length > 0;
  const hasRecent = recent.length > 0;

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: vaasenkNative.colors.surface.warmCanvas,
      }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={vaasenkNative.colors.brand.red}
          colors={[vaasenkNative.colors.brand.red]}
        />
      }
    >
      {/* Cream Sunrise hero — the design-doc reserves Cream Sunrise for the
          dashboard greeting; the Student Coral lives on coral classroom cards. */}
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
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
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
              Your home
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
              {greeting}
            </Text>
            <Text
              style={{
                marginTop: vaasenkNative.spacing.sm,
                color: 'rgba(255,255,255,0.92)',
                fontSize: 14,
                lineHeight: 20,
              }}
            >
              {hasClassrooms
                ? `You're in ${classrooms.length} ${classrooms.length === 1 ? 'classroom' : 'classrooms'}.`
                : 'Join your first classroom to start collecting notes.'}
            </Text>
          </View>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: 'rgba(255,255,255,0.2)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sunrise size={24} color={vaasenkNative.colors.text.inverse} />
          </View>
        </View>
      </LinearGradient>

      {/* Quick actions */}
      <View
        style={{
          flexDirection: 'row',
          paddingHorizontal: vaasenkNative.spacing.xl,
          paddingTop: vaasenkNative.spacing.lg,
          gap: vaasenkNative.spacing.md,
        }}
      >
        <QuickActionTile
          icon={<UserPlus size={20} color={vaasenkNative.colors.text.inverse} />}
          label="Join class"
          tone="primary"
          onPress={openJoin}
        />
        <QuickActionTile
          icon={<Bookmark size={20} color={vaasenkNative.colors.text.deepMaroon} />}
          label="Saved"
          tone="muted"
          onPress={openBookmarks}
        />
        <QuickActionTile
          icon={<Download size={20} color={vaasenkNative.colors.brand.red} />}
          label="Offline"
          tone="muted"
          onPress={openDownloads}
        />
      </View>

      {/* Error banner */}
      {error ? (
        <View style={{ marginTop: vaasenkNative.spacing.lg }}>
          <ErrorState message={error} onRetry={() => fetchAll(false)} />
        </View>
      ) : null}

      {/* Loading skeleton on first load (cache absent) */}
      {loading && !hasClassrooms && !error ? (
        <View style={{ marginTop: vaasenkNative.spacing.xl }}>
          <SectionHeader title="Recent notes" subtitle="Latest from your classes" />
          <View
            style={{
              paddingHorizontal: vaasenkNative.spacing.xl,
              flexDirection: 'row',
              gap: vaasenkNative.spacing.md,
            }}
          >
            <LoadingShimmer width={240} height={120} borderRadius={20} />
            <LoadingShimmer width={240} height={120} borderRadius={20} />
          </View>

          <View style={{ marginTop: vaasenkNative.spacing['2xl'] }}>
            <SectionHeader title="My classes" subtitle="Tap to open" />
            <View
              style={{
                paddingHorizontal: vaasenkNative.spacing.xl,
                flexDirection: 'row',
                gap: vaasenkNative.spacing.md,
              }}
            >
              <LoadingShimmer width={260} height={170} borderRadius={28} />
              <LoadingShimmer width={260} height={170} borderRadius={28} />
            </View>
          </View>
        </View>
      ) : null}

      {/* Empty state (zero classrooms) */}
      {!loading && !hasClassrooms && !error ? (
        <View style={{ marginTop: vaasenkNative.spacing.xl }}>
          <EmptyState
            icon={<Sparkles size={24} color={vaasenkNative.colors.text.deepMaroon} />}
            title="Join your first classroom"
            description="Ask your teacher for the 6-character invite code. Once you're in, every note shows up here."
            cta={{ label: 'Join a classroom', onPress: openJoin }}
          />
        </View>
      ) : null}

      {/* Recent notes section */}
      {!loading && hasClassrooms ? (
        <View style={{ marginTop: vaasenkNative.spacing['2xl'] }}>
          <SectionHeader
            title="Recent notes"
            subtitle="Latest published in your classes"
          />
          {hasRecent ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: vaasenkNative.spacing.xl,
                gap: vaasenkNative.spacing.md,
              }}
            >
              {recent.map((note) => (
                <RecentNoteCard
                  key={note.id}
                  note={note}
                  onPress={() => openNote(note)}
                />
              ))}
            </ScrollView>
          ) : (
            <View
              style={{
                marginHorizontal: vaasenkNative.spacing.xl,
                padding: vaasenkNative.spacing.xl,
                borderRadius: vaasenkNative.radius.lg,
                borderWidth: 1,
                borderColor: 'rgba(160,0,0,0.08)',
                backgroundColor: vaasenkNative.colors.surface.glassWhite,
              }}
            >
              <Text style={{ color: vaasenkNative.colors.text.muted, fontSize: 14 }}>
                Your teachers haven't published any notes yet. Check back soon!
              </Text>
            </View>
          )}
        </View>
      ) : null}

      {/* Classrooms section */}
      {!loading && hasClassrooms ? (
        <View style={{ marginTop: vaasenkNative.spacing['2xl'] }}>
          <SectionHeader title="My classes" subtitle="Tap to open the feed" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: vaasenkNative.spacing.xl,
              gap: vaasenkNative.spacing.md,
            }}
          >
            {classrooms.map((c) => (
              <ClassroomCard
                key={c.id}
                classroom={c}
                compact
                onPress={() => openClassroom(c.id)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <View
      style={{
        paddingHorizontal: vaasenkNative.spacing.xl,
        marginBottom: vaasenkNative.spacing.md,
      }}
    >
      <Text
        style={{
          color: vaasenkNative.colors.text.ink,
          fontWeight: '800',
          fontSize: 20,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          marginTop: 2,
          color: vaasenkNative.colors.text.muted,
          fontSize: 13,
        }}
      >
        {subtitle}
      </Text>
    </View>
  );
}

function QuickActionTile({
  icon,
  label,
  tone,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  tone: 'primary' | 'muted';
  onPress: () => void;
}) {
  if (tone === 'primary') {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.9 : 1 })}
      >
        <LinearGradient
          {...gradientProps('heroSunrise')}
          style={[
            {
              padding: vaasenkNative.spacing.lg,
              borderRadius: vaasenkNative.radius.lg,
              alignItems: 'flex-start',
              gap: vaasenkNative.spacing.sm,
              minHeight: 86,
            },
            vaasenkNative.shadows.glowRed,
          ]}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'rgba(255,255,255,0.22)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {icon}
          </View>
          <Text
            style={{
              color: vaasenkNative.colors.text.inverse,
              fontWeight: '800',
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
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flex: 1,
        padding: vaasenkNative.spacing.lg,
        borderRadius: vaasenkNative.radius.lg,
        backgroundColor: vaasenkNative.colors.surface.glassWhite,
        borderWidth: 1,
        borderColor: 'rgba(160,0,0,0.1)',
        gap: vaasenkNative.spacing.sm,
        minHeight: 86,
        alignItems: 'flex-start',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: 'rgba(254,202,2,0.22)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </View>
      <Text
        style={{
          color: vaasenkNative.colors.text.ink,
          fontWeight: '800',
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function RecentNoteCard({
  note,
  onPress,
}: {
  note: NoteView;
  onPress: () => void;
}) {
  const mime = note.mimeType ?? note.fileType ?? null;
  const isImage = mime?.startsWith('image/') ?? false;
  const thumb = note.thumbnailSignedUrl ?? (isImage ? note.fileSignedUrl : null);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${note.title}`}
      style={({ pressed }) => ({
        width: 240,
        borderRadius: vaasenkNative.radius.lg,
        backgroundColor: vaasenkNative.colors.surface.glassWhite,
        borderWidth: 1,
        borderColor: 'rgba(160,0,0,0.08)',
        overflow: 'hidden',
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <View
        style={{
          height: 100,
          width: '100%',
          backgroundColor: vaasenkNative.colors.surface.peachWash,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {thumb ? (
          <Image
            source={{ uri: thumb }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
          />
        ) : isImage ? (
          <ImageIcon size={28} color={vaasenkNative.colors.brand.red} />
        ) : (
          <FileText size={28} color={vaasenkNative.colors.brand.red} />
        )}
      </View>
      <View
        style={{
          padding: vaasenkNative.spacing.md,
          gap: 4,
        }}
      >
        <Text
          numberOfLines={2}
          style={{
            color: vaasenkNative.colors.text.ink,
            fontWeight: '700',
            fontSize: 14,
            lineHeight: 18,
          }}
        >
          {note.title}
        </Text>
        {note.classroom?.name ? (
          <Text
            numberOfLines={1}
            style={{
              color: vaasenkNative.colors.text.deepMaroon,
              fontSize: 11,
              fontWeight: '600',
            }}
          >
            {note.classroom.name}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function greetingFor(name: string): string {
  const display = name?.trim().split(/\s+/)[0] || 'there';
  try {
    const hour = new Date().getHours();
    if (Number.isNaN(hour)) return `Welcome, ${display}`;
    if (hour < 12) return `Good morning, ${display}`;
    if (hour < 18) return `Good afternoon, ${display}`;
    return `Good evening, ${display}`;
  } catch {
    return `Welcome, ${display}`;
  }
}
