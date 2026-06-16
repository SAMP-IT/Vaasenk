/**
 * Vaasenk Mobile — Teacher HomeScreen (Sprint 7.3 / Playbook Prompt 26).
 *
 * The teacher's landing surface.
 *   - Teacher Orange hero gradient (`goldCard`).
 *   - Time-of-day greeting + classroom count.
 *   - Three quick actions: Upload notes, Generate paper, Ask AI.
 *     Each jumps into the right tab (or surfaces a classroom-picker if
 *     the action requires one).
 *   - Recent uploads horizontal scroll (last 6 across all my classrooms).
 *   - My classrooms horizontal scroll (TeacherClassroomCard).
 *   - Pending doubts strip — placeholder because backend has no doubts
 *     endpoint yet; documented as a gap (Sprint 7.4+ candidate).
 *
 * 5 states (CLAUDE.md §5):
 *   default — content rendered.
 *   loading — shimmer placeholders for both sections.
 *   empty   — friendly empty card pointing to "Ask admin to assign a class".
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
  Camera,
  FileText,
  Image as ImageIcon,
  Inbox,
  Layers,
  MessageCircle,
  Sparkles,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import { useAuth } from '@/services/auth-context';
import {
  listTeacherClassrooms,
  readClassroomsCache,
  type ClassroomView,
} from '@/services/classrooms';
import { listClassroomNotes, type NoteView } from '@/services/notes';
import { ApiClientError } from '@/services/api';
import { TeacherClassroomCard } from '@/components/teacher/TeacherClassroomCard';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingShimmer } from '@/components/LoadingShimmer';
import { ClassroomPickerSheet } from './ClassroomPickerSheet';
import { gradientProps, vaasenkNative } from '@/theme/tokens';
import type { TeacherHomeScreenProps } from '@/navigation/types';

const RECENT_PER_CLASSROOM = 5;
const RECENT_TOTAL = 6;

type PickerIntent = 'upload' | 'paper' | 'ai' | null;

export function TeacherHomeScreen({
  navigation,
}: TeacherHomeScreenProps<'HomeRoot'>) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const cached = readClassroomsCache();

  const [classrooms, setClassrooms] = useState<ClassroomView[]>(cached ?? []);
  const [recent, setRecent] = useState<NoteView[]>([]);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerIntent, setPickerIntent] = useState<PickerIntent>(null);
  const seenInitialMount = useRef(false);

  const greeting = useMemo(() => greetingFor(user?.name ?? ''), [user?.name]);

  const fetchAll = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const classroomsResult = await listTeacherClassrooms();
      setClassrooms(classroomsResult.data);

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

  const onPickerClassroom = (classroomId: string) => {
    const intent = pickerIntent;
    setPickerIntent(null);
    if (intent === 'upload') {
      navigation.navigate('TeacherUpload', {
        screen: 'QuickUpload',
        params: { classroomId },
      });
    } else if (intent === 'paper') {
      navigation.navigate('TeacherClassrooms', {
        screen: 'GeneratePaper',
        params: { classroomId },
      });
    } else if (intent === 'ai') {
      navigation.navigate('TeacherAI', {
        screen: 'AISessions',
        params: { classroomId },
      });
    }
  };

  const openClassroom = (id: string) =>
    navigation.navigate('TeacherClassrooms', {
      screen: 'ClassroomDetail',
      params: { classroomId: id, initialTab: 'notes' },
    });

  const openNote = (note: NoteView) =>
    navigation.navigate('TeacherClassrooms', {
      screen: 'NoteDetail',
      params: { noteId: note.id, classroomId: note.classroomId },
    });

  const startIntent = (intent: PickerIntent) => {
    if (!intent) return;
    if (classrooms.length === 0) {
      // No classrooms — fall back to the "no classrooms" empty state
      // displayed below; do nothing here.
      return;
    }
    if (classrooms.length === 1 && classrooms[0]) {
      // Skip the picker if there's only one option.
      const id = classrooms[0].id;
      if (intent === 'upload') {
        navigation.navigate('TeacherUpload', {
          screen: 'QuickUpload',
          params: { classroomId: id },
        });
        return;
      }
      if (intent === 'paper') {
        navigation.navigate('TeacherClassrooms', {
          screen: 'GeneratePaper',
          params: { classroomId: id },
        });
        return;
      }
      if (intent === 'ai') {
        navigation.navigate('TeacherAI', {
          screen: 'AISessions',
          params: { classroomId: id },
        });
        return;
      }
    }
    setPickerIntent(intent);
  };

  const hasClassrooms = classrooms.length > 0;
  const hasRecent = recent.length > 0;

  return (
    <>
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
        {/* Teacher Orange hero */}
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
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
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
                Your day
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
                  color: 'rgba(255,255,255,0.95)',
                  fontSize: 14,
                  lineHeight: 20,
                }}
              >
                {hasClassrooms
                  ? `You teach ${classrooms.length} ${classrooms.length === 1 ? 'class' : 'classes'}. Tap a card to open it.`
                  : 'Ask your administrator to assign a class so you can start uploading notes.'}
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
              <Sparkles size={24} color={vaasenkNative.colors.text.inverse} />
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
            icon={<Camera size={20} color={vaasenkNative.colors.text.inverse} />}
            label="Upload notes"
            tone="primary"
            onPress={() => startIntent('upload')}
            disabled={!hasClassrooms}
          />
          <QuickActionTile
            icon={<FileText size={20} color={vaasenkNative.colors.text.deepMaroon} />}
            label="Generate paper"
            tone="muted"
            onPress={() => startIntent('paper')}
            disabled={!hasClassrooms}
          />
          <QuickActionTile
            icon={<MessageCircle size={20} color={vaasenkNative.colors.brand.red} />}
            label="Ask AI"
            tone="muted"
            onPress={() => startIntent('ai')}
            disabled={!hasClassrooms}
          />
        </View>

        {/* Pending doubts strip — gap: backend doesn't expose doubts yet. */}
        <View
          style={{
            marginTop: vaasenkNative.spacing.lg,
            marginHorizontal: vaasenkNative.spacing.xl,
            padding: vaasenkNative.spacing.md,
            borderRadius: vaasenkNative.radius.lg,
            backgroundColor: vaasenkNative.colors.surface.glassWhite,
            borderWidth: 1,
            borderColor: 'rgba(160,0,0,0.08)',
            flexDirection: 'row',
            gap: vaasenkNative.spacing.md,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(254,202,2,0.18)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Inbox size={18} color={vaasenkNative.colors.text.deepMaroon} />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: vaasenkNative.colors.text.ink,
                fontWeight: '700',
                fontSize: 14,
              }}
            >
              Student doubts
            </Text>
            <Text
              style={{
                marginTop: 2,
                color: vaasenkNative.colors.text.muted,
                fontSize: 12,
                lineHeight: 16,
              }}
            >
              Inbound questions appear here in a future sprint.
            </Text>
          </View>
          <View
            style={{
              paddingHorizontal: vaasenkNative.spacing.sm,
              paddingVertical: 2,
              borderRadius: vaasenkNative.radius.full,
              backgroundColor: 'rgba(122,98,102,0.18)',
            }}
          >
            <Text
              style={{
                color: vaasenkNative.colors.text.muted,
                fontSize: 11,
                fontWeight: '700',
              }}
            >
              0
            </Text>
          </View>
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
            <SectionHeader title="Recent uploads" subtitle="Your latest published notes" />
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
              icon={<Layers size={24} color={vaasenkNative.colors.text.deepMaroon} />}
              title="No classes assigned yet"
              description="Your administrator hasn't assigned a class to you. Once they do, your classrooms will appear here and you can start uploading notes."
            />
          </View>
        ) : null}

        {/* Recent uploads */}
        {!loading && hasClassrooms ? (
          <View style={{ marginTop: vaasenkNative.spacing['2xl'] }}>
            <SectionHeader
              title="Recent uploads"
              subtitle="Latest published across your classes"
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
                <Text
                  style={{ color: vaasenkNative.colors.text.muted, fontSize: 14 }}
                >
                  No uploads yet. Hit the Upload tab to publish your first
                  note.
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {/* Classrooms */}
        {!loading && hasClassrooms ? (
          <View style={{ marginTop: vaasenkNative.spacing['2xl'] }}>
            <SectionHeader title="My classes" subtitle="Tap to view notes and students" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: vaasenkNative.spacing.xl,
                gap: vaasenkNative.spacing.md,
              }}
            >
              {classrooms.map((c) => (
                <TeacherClassroomCard
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

      <ClassroomPickerSheet
        open={pickerIntent !== null}
        title={
          pickerIntent === 'upload'
            ? 'Upload to which classroom?'
            : pickerIntent === 'paper'
              ? 'Generate paper for which classroom?'
              : 'Ask AI for which classroom?'
        }
        classrooms={classrooms}
        onPick={onPickerClassroom}
        onClose={() => setPickerIntent(null)}
      />
    </>
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
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  tone: 'primary' | 'muted';
  onPress: () => void;
  disabled?: boolean;
}) {
  if (tone === 'primary') {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityLabel={label}
        style={({ pressed }) => ({
          flex: 1,
          opacity: disabled ? 0.5 : pressed ? 0.9 : 1,
        })}
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
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
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
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
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
      <View style={{ padding: vaasenkNative.spacing.md, gap: 4 }}>
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
  const display = name?.trim().split(/\s+/)[0] || 'teacher';
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
