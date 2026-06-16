/**
 * Vaasenk Mobile — Teacher ClassroomDetailScreen (Sprint 7.3).
 *
 * Single-screen container hosting four sub-tabs:
 *   - Notes:   list teacher's published + draft notes, tap to open detail.
 *   - Doubts:  placeholder card; backend doesn't expose this yet.
 *   - Papers:  list placeholder + "Generate paper" CTA (backend has no
 *              GET /classrooms/:id/question-papers list endpoint yet —
 *              documented gap; the CTA itself works).
 *   - AI:      hand-off to the AI tab pre-selected with this classroom.
 *
 * The tab strip is a custom horizontal-scroll pill row to keep this
 * dependency-free (no @react-navigation/material-top-tabs). The strip
 * uses Brand Flame for the active pill (consistent with FilterChipRow).
 *
 * Per CLAUDE.md §4 — Teacher Orange hero, glass surfaces below.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Copy,
  FileQuestion,
  FileText,
  Inbox,
  MessageCircle,
  RefreshCw,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react-native';
import { ApiClientError } from '@/services/api';
import {
  getClassroom,
  refreshInviteCode,
  type ClassroomDetailView,
} from '@/services/classrooms';
import {
  deleteNoteForTeacher,
  listClassroomNotes,
  type NoteStatus,
  type NoteView,
} from '@/services/notes';
import { NoteListItem } from '@/components/NoteListItem';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingShimmer } from '@/components/LoadingShimmer';
import {
  TeacherStatusChipRow,
  type StatusFilter,
} from '@/components/teacher/TeacherStatusChipRow';
import { gradientProps, vaasenkNative } from '@/theme/tokens';
import type {
  TeacherClassroomTab,
  TeacherClassroomsScreenProps,
} from '@/navigation/types';

type TabKey = TeacherClassroomTab;

const TABS: { key: TabKey; label: string }[] = [
  { key: 'notes', label: 'Notes' },
  { key: 'doubts', label: 'Doubts' },
  { key: 'papers', label: 'Papers' },
  { key: 'ai', label: 'AI' },
];

export function ClassroomDetailScreen({
  navigation,
  route,
}: TeacherClassroomsScreenProps<'ClassroomDetail'>) {
  const insets = useSafeAreaInsets();
  const { classroomId } = route.params;
  const initialTab: TabKey = route.params.initialTab ?? 'notes';

  const [classroom, setClassroom] = useState<ClassroomDetailView | null>(null);
  const [classroomLoading, setClassroomLoading] = useState(true);
  const [classroomError, setClassroomError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [refreshingCode, setRefreshingCode] = useState(false);
  const [copyHint, setCopyHint] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------- Load classroom ------------------------------------------------
  const fetchClassroom = useCallback(async () => {
    setClassroomLoading(true);
    setClassroomError(null);
    try {
      const data = await getClassroom(classroomId);
      setClassroom(data);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Something went wrong.';
      setClassroomError(msg);
    } finally {
      setClassroomLoading(false);
    }
  }, [classroomId]);

  useEffect(() => {
    void fetchClassroom();
  }, [fetchClassroom]);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  // ---------- Invite code actions ------------------------------------------
  const copyCode = useCallback(async () => {
    if (!classroom?.inviteCode) return;
    try {
      await Clipboard.setStringAsync(classroom.inviteCode);
    } catch {
      // Clipboard might fail on web in insecure contexts — fail silently.
    }
    setCopyHint(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyHint(false), 1800);
  }, [classroom?.inviteCode]);

  const onRefreshCode = useCallback(() => {
    Alert.alert(
      'Generate a new invite code?',
      'Students with the current code will need the new one to join.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          style: 'destructive',
          onPress: async () => {
            setRefreshingCode(true);
            try {
              const updated = await refreshInviteCode(classroomId);
              setClassroom((prev) =>
                prev ? { ...prev, ...updated } : (updated as ClassroomDetailView),
              );
            } catch (err) {
              Alert.alert(
                'Could not refresh code',
                err instanceof Error ? err.message : 'Try again.',
              );
            } finally {
              setRefreshingCode(false);
            }
          },
        },
      ],
    );
  }, [classroomId]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: vaasenkNative.colors.surface.warmCanvas,
      }}
    >
      <LinearGradient
        {...gradientProps('goldCard')}
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
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
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
              color: 'rgba(255,255,255,0.95)',
              fontSize: 12,
              fontWeight: '700',
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            Classroom
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={{ marginTop: vaasenkNative.spacing.md }}>
          {classroom ? (
            <>
              <Text
                style={{
                  color: vaasenkNative.colors.text.inverse,
                  fontSize: 22,
                  fontWeight: '800',
                }}
                numberOfLines={2}
              >
                {classroom.subject?.name ?? classroom.name}
              </Text>
              <Text
                style={{
                  marginTop: 2,
                  color: 'rgba(255,255,255,0.92)',
                  fontSize: 13,
                }}
                numberOfLines={1}
              >
                {[classroom.class?.name, classroom.section?.name]
                  .filter(Boolean)
                  .join(' · ') || 'Class details'}
              </Text>

              {/* Invite code chip */}
              <View
                style={{
                  marginTop: vaasenkNative.spacing.md,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: vaasenkNative.spacing.sm,
                  flexWrap: 'wrap',
                }}
              >
                <Pressable
                  onPress={copyCode}
                  accessibilityRole="button"
                  accessibilityLabel={`Copy invite code ${classroom.inviteCode ?? ''}`}
                  hitSlop={6}
                  style={({ pressed }) => ({
                    minHeight: 36,
                    paddingHorizontal: vaasenkNative.spacing.md,
                    borderRadius: vaasenkNative.radius.full,
                    backgroundColor: 'rgba(255,255,255,0.24)',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text
                    style={{
                      color: vaasenkNative.colors.text.inverse,
                      fontWeight: '800',
                      fontSize: 13,
                      letterSpacing: 2,
                    }}
                  >
                    {classroom.inviteCode ?? '—'}
                  </Text>
                  <Copy size={14} color={vaasenkNative.colors.text.inverse} />
                </Pressable>

                <Pressable
                  onPress={onRefreshCode}
                  disabled={refreshingCode}
                  accessibilityRole="button"
                  accessibilityLabel="Refresh invite code"
                  hitSlop={6}
                  style={({ pressed }) => ({
                    minHeight: 36,
                    paddingHorizontal: vaasenkNative.spacing.md,
                    borderRadius: vaasenkNative.radius.full,
                    backgroundColor: 'rgba(255,255,255,0.12)',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    opacity: refreshingCode ? 0.6 : pressed ? 0.7 : 1,
                  })}
                >
                  {refreshingCode ? (
                    <ActivityIndicator
                      size="small"
                      color={vaasenkNative.colors.text.inverse}
                    />
                  ) : (
                    <RefreshCw
                      size={12}
                      color={vaasenkNative.colors.text.inverse}
                    />
                  )}
                  <Text
                    style={{
                      color: vaasenkNative.colors.text.inverse,
                      fontWeight: '700',
                      fontSize: 12,
                    }}
                  >
                    New code
                  </Text>
                </Pressable>

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: vaasenkNative.spacing.sm,
                  }}
                >
                  <Users size={14} color="rgba(255,255,255,0.9)" />
                  <Text
                    style={{
                      color: 'rgba(255,255,255,0.92)',
                      fontSize: 12,
                      fontWeight: '600',
                    }}
                  >
                    {classroom._count?.members ?? 0} students
                  </Text>
                </View>
              </View>

              {copyHint ? (
                <Text
                  style={{
                    marginTop: vaasenkNative.spacing.xs,
                    color: vaasenkNative.colors.brand.gold,
                    fontSize: 12,
                    fontWeight: '700',
                  }}
                >
                  Copied to clipboard
                </Text>
              ) : null}
            </>
          ) : (
            <LoadingShimmer height={28} borderRadius={8} />
          )}
        </View>
      </LinearGradient>

      {/* Tab strip */}
      <View
        style={{
          paddingHorizontal: vaasenkNative.spacing.xl,
          paddingVertical: vaasenkNative.spacing.sm,
          backgroundColor: vaasenkNative.colors.surface.warmCanvas,
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: vaasenkNative.spacing.sm }}
        >
          {TABS.map((tab) => (
            <TabPill
              key={tab.key}
              label={tab.label}
              active={activeTab === tab.key}
              onPress={() => setActiveTab(tab.key)}
            />
          ))}
        </ScrollView>
      </View>

      {classroomError && !classroom ? (
        <View style={{ marginTop: vaasenkNative.spacing.lg }}>
          <ErrorState message={classroomError} onRetry={fetchClassroom} />
        </View>
      ) : null}

      {classroomLoading && !classroom ? (
        <View
          style={{
            paddingHorizontal: vaasenkNative.spacing.xl,
            marginTop: vaasenkNative.spacing.lg,
            gap: vaasenkNative.spacing.md,
          }}
        >
          <LoadingShimmer height={90} borderRadius={20} />
          <LoadingShimmer height={90} borderRadius={20} />
        </View>
      ) : null}

      {/* Tab body */}
      {classroom ? (
        <View style={{ flex: 1 }}>
          {activeTab === 'notes' ? (
            <NotesPanel
              classroomId={classroomId}
              onOpenNote={(id) =>
                navigation.navigate('NoteDetail', {
                  noteId: id,
                  classroomId,
                })
              }
              onJumpToUpload={() =>
                navigation.navigate('TeacherUpload', {
                  screen: 'QuickUpload',
                  params: { classroomId },
                })
              }
            />
          ) : null}

          {activeTab === 'doubts' ? <DoubtsPanel /> : null}

          {activeTab === 'papers' ? (
            <PapersPanel
              onGenerate={() =>
                navigation.navigate('GeneratePaper', { classroomId })
              }
            />
          ) : null}

          {activeTab === 'ai' ? (
            <AIPanel
              syllabusReady={classroom.syllabus?.status === 'AI_READY'}
              onOpen={() =>
                navigation.navigate('TeacherAI', {
                  screen: 'AISessions',
                  params: { classroomId },
                })
              }
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tab pill
// ---------------------------------------------------------------------------

function TabPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  if (active) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityState={{ selected: true }}
        accessibilityLabel={label}
      >
        <LinearGradient
          {...gradientProps('heroSunrise')}
          style={[
            {
              minHeight: 36,
              paddingHorizontal: vaasenkNative.spacing.xl,
              paddingVertical: vaasenkNative.spacing.xs,
              borderRadius: vaasenkNative.radius.full,
              alignItems: 'center',
              justifyContent: 'center',
            },
            vaasenkNative.shadows.glowRed,
          ]}
        >
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
      accessibilityRole="tab"
      accessibilityState={{ selected: false }}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        minHeight: 36,
        paddingHorizontal: vaasenkNative.spacing.xl,
        paddingVertical: vaasenkNative.spacing.xs,
        borderRadius: vaasenkNative.radius.full,
        backgroundColor: vaasenkNative.colors.surface.glassWhite,
        borderWidth: 1,
        borderColor: 'rgba(160,0,0,0.12)',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{
          color: vaasenkNative.colors.text.deepMaroon,
          fontWeight: '700',
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Notes panel
// ---------------------------------------------------------------------------

function NotesPanel({
  classroomId,
  onOpenNote,
  onJumpToUpload,
}: {
  classroomId: string;
  onOpenNote: (id: string) => void;
  onJumpToUpload: () => void;
}) {
  const [notes, setNotes] = useState<NoteView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('ALL');

  const load = useCallback(
    async (silent: boolean, currentFilter: StatusFilter) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        // Backend's status filter — request the specific status or no
        // filter (which returns DRAFT + PUBLISHED for teachers).
        const tag = undefined;
        const result = await listClassroomNotes(classroomId, {
          tag,
          sort: 'publishedAt:desc',
          limit: 50,
        });
        const filtered =
          currentFilter === 'ALL'
            ? result.data
            : result.data.filter(
                (n) => (n.status as NoteStatus) === currentFilter,
              );
        setNotes(filtered);
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
      }
    },
    [classroomId],
  );

  useEffect(() => {
    void load(false, filter);
  }, [load, filter]);

  const onDelete = useCallback(
    (note: NoteView) => {
      Alert.alert('Archive this note?', `"${note.title}" will be hidden from students.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNoteForTeacher(note.id);
              setNotes((prev) => prev.filter((n) => n.id !== note.id));
            } catch (err) {
              Alert.alert(
                'Could not archive',
                err instanceof Error ? err.message : 'Try again.',
              );
            }
          },
        },
      ]);
    },
    [],
  );

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: vaasenkNative.spacing['6xl'] }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load(true, filter);
          }}
          tintColor={vaasenkNative.colors.brand.red}
          colors={[vaasenkNative.colors.brand.red]}
        />
      }
    >
      <TeacherStatusChipRow active={filter} onChange={setFilter} />

      {error ? (
        <View style={{ marginTop: vaasenkNative.spacing.md }}>
          <ErrorState message={error} onRetry={() => load(false, filter)} />
        </View>
      ) : null}

      {loading && notes.length === 0 && !error ? (
        <View
          style={{
            paddingHorizontal: vaasenkNative.spacing.xl,
            gap: vaasenkNative.spacing.sm,
            marginTop: vaasenkNative.spacing.md,
          }}
        >
          <LoadingShimmer height={90} borderRadius={20} />
          <LoadingShimmer height={90} borderRadius={20} />
          <LoadingShimmer height={90} borderRadius={20} />
        </View>
      ) : null}

      {!loading && !error && notes.length === 0 ? (
        <View style={{ marginTop: vaasenkNative.spacing.lg }}>
          <EmptyState
            icon={<FileText size={24} color={vaasenkNative.colors.text.deepMaroon} />}
            title="No notes here yet"
            description="Photograph the board or attach a PDF, and it lands in your students' feed in seconds."
            cta={{ label: 'Upload first note', onPress: onJumpToUpload }}
          />
        </View>
      ) : null}

      {notes.map((n) => (
        <View key={n.id}>
          <NoteListItem
            note={n}
            onPress={() => onOpenNote(n.id)}
            bookmarked={Boolean(n.bookmarkedByMe)}
          />
          <View
            style={{
              flexDirection: 'row',
              gap: vaasenkNative.spacing.sm,
              marginHorizontal: vaasenkNative.spacing.xl,
              marginTop: -vaasenkNative.spacing.sm,
              marginBottom: vaasenkNative.spacing.md,
              justifyContent: 'flex-end',
            }}
          >
            <Pressable
              onPress={() => onDelete(n)}
              accessibilityRole="button"
              accessibilityLabel={`Archive ${n.title}`}
              hitSlop={6}
              style={({ pressed }) => ({
                minHeight: 36,
                paddingHorizontal: vaasenkNative.spacing.md,
                borderRadius: vaasenkNative.radius.full,
                borderWidth: 1,
                borderColor: 'rgba(220,38,38,0.32)',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Trash2 size={14} color={vaasenkNative.colors.semantic.danger} />
              <Text
                style={{
                  color: vaasenkNative.colors.semantic.danger,
                  fontSize: 12,
                  fontWeight: '700',
                }}
              >
                Archive
              </Text>
            </Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Doubts panel
// ---------------------------------------------------------------------------

function DoubtsPanel() {
  return (
    <View style={{ paddingTop: vaasenkNative.spacing.xl }}>
      <EmptyState
        icon={<Inbox size={24} color={vaasenkNative.colors.text.deepMaroon} />}
        title="Doubts inbox coming soon"
        description="Students will be able to ask you questions directly from the note viewer. Your inbox will appear here."
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Papers panel
// ---------------------------------------------------------------------------

function PapersPanel({ onGenerate }: { onGenerate: () => void }) {
  return (
    <ScrollView
      contentContainerStyle={{
        padding: vaasenkNative.spacing.xl,
        gap: vaasenkNative.spacing.lg,
      }}
    >
      <Pressable
        onPress={onGenerate}
        accessibilityRole="button"
        accessibilityLabel="Generate a new question paper"
        style={({ pressed }) => ({ opacity: pressed ? 0.95 : 1 })}
      >
        <LinearGradient
          {...gradientProps('heroSunrise')}
          style={[
            {
              padding: vaasenkNative.spacing.xl,
              borderRadius: vaasenkNative.radius.xl,
              gap: vaasenkNative.spacing.sm,
            },
            vaasenkNative.shadows.glowRed,
          ]}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: 'rgba(255,255,255,0.24)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FileText size={20} color={vaasenkNative.colors.text.inverse} />
          </View>
          <Text
            style={{
              color: vaasenkNative.colors.text.inverse,
              fontWeight: '800',
              fontSize: 18,
            }}
          >
            Generate a question paper
          </Text>
          <Text
            style={{
              color: 'rgba(255,255,255,0.92)',
              fontSize: 13,
              lineHeight: 18,
            }}
          >
            Pick portions, marks, and question types. Vaasenk AI drafts a
            paper grounded in your syllabus — exports to PDF.
          </Text>
        </LinearGradient>
      </Pressable>

      <EmptyState
        icon={<FileQuestion size={24} color={vaasenkNative.colors.text.deepMaroon} />}
        title="Recent papers"
        description="Generated papers will appear here once the backend exposes a list endpoint. For now, generated papers stay accessible via their preview link after creation."
      />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// AI panel
// ---------------------------------------------------------------------------

function AIPanel({
  syllabusReady,
  onOpen,
}: {
  syllabusReady: boolean;
  onOpen: () => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={{
        padding: vaasenkNative.spacing.xl,
        gap: vaasenkNative.spacing.lg,
      }}
    >
      <View
        style={{
          padding: vaasenkNative.spacing.xl,
          borderRadius: vaasenkNative.radius.xl,
          backgroundColor: vaasenkNative.colors.surface.glassWhite,
          borderWidth: 1,
          borderColor: 'rgba(160,0,0,0.12)',
          gap: vaasenkNative.spacing.md,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: vaasenkNative.spacing.sm,
          }}
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
            <Sparkles size={18} color={vaasenkNative.colors.text.deepMaroon} />
          </View>
          <Text
            style={{
              color: vaasenkNative.colors.text.ink,
              fontWeight: '800',
              fontSize: 16,
            }}
          >
            Vaasenk AI assistant
          </Text>
        </View>
        <Text
          style={{
            color: vaasenkNative.colors.text.muted,
            fontSize: 13,
            lineHeight: 18,
          }}
        >
          Ask anything from this classroom's syllabus. Answers come with
          chapter and topic citations.
        </Text>
        {!syllabusReady ? (
          <Text
            style={{
              color: vaasenkNative.colors.text.deepMaroon,
              fontSize: 12,
              fontWeight: '700',
            }}
          >
            Syllabus is still being prepared for AI. Chat opens automatically
            once it's ready.
          </Text>
        ) : null}

        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel="Open AI chat"
          style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
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
            <MessageCircle size={16} color={vaasenkNative.colors.text.inverse} />
            <Text
              style={{
                color: vaasenkNative.colors.text.inverse,
                fontWeight: '800',
                fontSize: 14,
              }}
            >
              Open AI chat
            </Text>
          </LinearGradient>
        </Pressable>
      </View>
    </ScrollView>
  );
}
