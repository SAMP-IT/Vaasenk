/**
 * Vaasenk Mobile — ClassroomFeedScreen (Sprint 7.2).
 *
 * Mirrors apps/web's classroom-feed-client.tsx but as a FlatList for
 * mobile-native scroll performance. The header is a coral hero with
 * back arrow, classroom name, teacher, and a sticky filter chip row
 * directly underneath. Each note row uses the shared NoteListItem with
 * a per-row bookmark + download toggle.
 *
 * Bookmark toggle is optimistic (mirrors web). Download progress is
 * surfaced inline on the row's download button.
 *
 * 5 states: list / shimmer / EmptyState / ErrorState / disabled chips
 * while loading.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Sparkles } from 'lucide-react-native';
import { ApiClientError } from '@/services/api';
import { getClassroom, type ClassroomDetailView } from '@/services/classrooms';
import {
  getNote,
  listClassroomNotes,
  setBookmark,
  type NoteView,
} from '@/services/notes';
import {
  downloadNote,
  getLocalDownloadUri,
} from '@/services/downloads';
import { FilterChipRow, type TagFilter } from '@/components/FilterChipRow';
import { NoteListItem } from '@/components/NoteListItem';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingShimmer } from '@/components/LoadingShimmer';
import { gradientProps, vaasenkNative } from '@/theme/tokens';
import type { StudentClassroomsScreenProps } from '@/navigation/types';

export function ClassroomFeedScreen({
  navigation,
  route,
}: StudentClassroomsScreenProps<'ClassroomFeed'>) {
  const insets = useSafeAreaInsets();
  const { classroomId } = route.params;

  const [classroom, setClassroom] = useState<ClassroomDetailView | null>(null);
  const [notes, setNotes] = useState<NoteView[]>([]);
  const [tag, setTag] = useState<TagFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<{ status?: number; message: string } | null>(null);

  // Bookmark state — keyed by note id. Optimistic toggles roll back on failure.
  const [bookmarked, setBookmarked] = useState<Set<string>>(new Set());
  const [bookmarkPending, setBookmarkPending] = useState<string | null>(null);

  // Download state — keyed by note id.
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const [downloadPending, setDownloadPending] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);

  const seenInitialMount = useRef(false);

  const fetchAll = useCallback(
    async (silent: boolean) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const [classroomResult, notesResult] = await Promise.all([
          getClassroom(classroomId),
          listClassroomNotes(classroomId, {
            tag: tag === 'ALL' ? undefined : tag,
            limit: 30,
          }),
        ]);
        setClassroom(classroomResult);
        setNotes(notesResult.data);

        // Seed bookmark state from the inline `bookmarkedByMe` flag.
        const bm = new Set<string>();
        for (const n of notesResult.data) {
          if (n.bookmarkedByMe) bm.add(n.id);
        }
        setBookmarked(bm);

        // Seed download state from the local index.
        const dl = new Set<string>();
        for (const n of notesResult.data) {
          const entry = await getLocalDownloadUri(n.id);
          if (entry) dl.add(n.id);
        }
        setDownloadedIds(dl);
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError({ status: err.status, message: err.message });
        } else if (err instanceof Error) {
          setError({ message: err.message });
        } else {
          setError({ message: 'Something went wrong.' });
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
        seenInitialMount.current = true;
      }
    },
    [classroomId, tag],
  );

  useEffect(() => {
    void fetchAll(false);
  }, [fetchAll]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchAll(true);
  }, [fetchAll]);

  const handleToggleBookmark = useCallback(
    async (noteId: string) => {
      if (bookmarkPending) return;
      setBookmarkPending(noteId);
      const wasBookmarked = bookmarked.has(noteId);
      const next = new Set(bookmarked);
      if (wasBookmarked) next.delete(noteId);
      else next.add(noteId);
      setBookmarked(next);
      try {
        const result = await setBookmark(noteId, !wasBookmarked);
        setBookmarked((prev) => {
          const r = new Set(prev);
          if (result.bookmarked) r.add(noteId);
          else r.delete(noteId);
          return r;
        });
      } catch {
        // Rollback.
        setBookmarked((prev) => {
          const r = new Set(prev);
          if (wasBookmarked) r.add(noteId);
          else r.delete(noteId);
          return r;
        });
      } finally {
        setBookmarkPending(null);
      }
    },
    [bookmarked, bookmarkPending],
  );

  const handleDownload = useCallback(
    async (note: NoteView) => {
      if (downloadPending || downloadedIds.has(note.id)) return;
      setDownloadPending(note.id);
      setDownloadProgress(0);
      try {
        // Refresh the signed URL before downloading — the one on the list
        // row could be stale if the user lingered for a while.
        const fresh = await getNote(note.id);
        if (!fresh.fileSignedUrl) {
          throw new Error('No file available for offline download.');
        }
        await downloadNote(fresh, fresh.fileSignedUrl, (p) =>
          setDownloadProgress(p),
        );
        setDownloadedIds((prev) => {
          const next = new Set(prev);
          next.add(note.id);
          return next;
        });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Could not save for offline.';
        Alert.alert('Download failed', msg);
      } finally {
        setDownloadPending(null);
        setDownloadProgress(0);
      }
    },
    [downloadPending, downloadedIds],
  );

  const subject = classroom?.subject?.name ?? classroom?.name ?? '';
  const classSection = useMemo(
    () =>
      [classroom?.class?.name, classroom?.section?.name]
        .filter(Boolean)
        .join(' · '),
    [classroom?.class?.name, classroom?.section?.name],
  );
  const teacherName = classroom?.teacher?.name ?? '';

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: vaasenkNative.colors.surface.warmCanvas,
      }}
    >
      {/* Header */}
      <LinearGradient
        {...gradientProps('studentCandy')}
        style={{
          paddingTop: insets.top + vaasenkNative.spacing.md,
          paddingBottom: vaasenkNative.spacing.xl,
          paddingHorizontal: vaasenkNative.spacing.xl,
          borderBottomLeftRadius: vaasenkNative.radius['2xl'],
          borderBottomRightRadius: vaasenkNative.radius['2xl'],
        }}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            padding: 6,
            marginBottom: vaasenkNative.spacing.sm,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <ChevronLeft size={26} color={vaasenkNative.colors.text.inverse} />
        </Pressable>

        <Text
          style={{
            color: 'rgba(255,255,255,0.85)',
            fontSize: 12,
            fontWeight: '700',
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          Classroom
        </Text>
        <Text
          numberOfLines={2}
          style={{
            marginTop: vaasenkNative.spacing.xs,
            color: vaasenkNative.colors.text.inverse,
            fontSize: 28,
            lineHeight: 32,
            fontWeight: '800',
          }}
        >
          {subject || 'Loading…'}
        </Text>
        {(classSection || teacherName) && (
          <Text
            style={{
              marginTop: vaasenkNative.spacing.xs,
              color: 'rgba(255,255,255,0.92)',
              fontSize: 13,
            }}
          >
            {[classSection, teacherName].filter(Boolean).join(' · ')}
          </Text>
        )}
      </LinearGradient>

      {/* Filter chips */}
      <View
        style={{
          backgroundColor: vaasenkNative.colors.surface.warmCanvas,
          paddingTop: vaasenkNative.spacing.sm,
        }}
      >
        <FilterChipRow
          active={tag}
          onChange={setTag}
          disabled={loading && notes.length === 0}
        />
      </View>

      {/* List body */}
      {error ? (
        <View style={{ marginTop: vaasenkNative.spacing.lg }}>
          <ErrorState
            message={error.message}
            onRetry={() => fetchAll(false)}
          />
        </View>
      ) : null}

      {loading && notes.length === 0 && !error ? (
        <View style={{ paddingTop: vaasenkNative.spacing.md }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <View
              key={i}
              style={{
                marginHorizontal: vaasenkNative.spacing.xl,
                marginBottom: vaasenkNative.spacing.md,
              }}
            >
              <LoadingShimmer height={140} borderRadius={22} />
            </View>
          ))}
        </View>
      ) : null}

      {!loading && !error && notes.length === 0 ? (
        <View style={{ marginTop: vaasenkNative.spacing.xl }}>
          <EmptyState
            icon={<Sparkles size={24} color={vaasenkNative.colors.text.deepMaroon} />}
            title={tag === 'ALL' ? 'No notes yet' : 'No matching notes'}
            description={
              tag === 'ALL'
                ? "Your teacher hasn't shared anything in this classroom yet. Check back soon!"
                : "Try a different filter or clear it to see everything."
            }
            cta={
              tag !== 'ALL'
                ? { label: 'Clear filter', onPress: () => setTag('ALL') }
                : undefined
            }
          />
        </View>
      ) : null}

      {!loading && !error && notes.length > 0 ? (
        <FlatList
          data={notes}
          keyExtractor={(n) => n.id}
          renderItem={({ item }) => (
            <NoteListItem
              note={item}
              bookmarked={bookmarked.has(item.id)}
              bookmarkPending={bookmarkPending === item.id}
              onToggleBookmark={() => handleToggleBookmark(item.id)}
              downloaded={downloadedIds.has(item.id)}
              downloadPending={downloadPending === item.id}
              downloadProgress={
                downloadPending === item.id ? downloadProgress : undefined
              }
              onDownload={() => handleDownload(item)}
              onPress={() =>
                navigation.navigate('NoteDetail', {
                  noteId: item.id,
                  classroomId,
                })
              }
            />
          )}
          contentContainerStyle={{
            paddingTop: vaasenkNative.spacing.md,
            paddingBottom: insets.bottom + 120,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={vaasenkNative.colors.brand.red}
              colors={[vaasenkNative.colors.brand.red]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      ) : null}
    </View>
  );
}
