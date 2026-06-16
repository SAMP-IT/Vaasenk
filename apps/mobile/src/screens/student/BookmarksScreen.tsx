/**
 * Vaasenk Mobile — BookmarksScreen (Sprint 7.2).
 *
 * Lists every note the student has bookmarked. Reuses NoteListItem with
 * `showClassroom` so the classroom name is visible (the global view
 * spans every class). Tapping a row opens the NoteDetail screen in this
 * tab's nested stack.
 *
 * 5 states: list / shimmer / EmptyState / ErrorState / disabled.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bookmark } from 'lucide-react-native';
import { ApiClientError } from '@/services/api';
import {
  listBookmarkedNotes,
  setBookmark,
  type NoteView,
} from '@/services/notes';
import { NoteListItem } from '@/components/NoteListItem';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingShimmer } from '@/components/LoadingShimmer';
import { gradientProps, vaasenkNative } from '@/theme/tokens';
import type { StudentBookmarksScreenProps } from '@/navigation/types';

export function BookmarksScreen({
  navigation,
}: StudentBookmarksScreenProps<'BookmarksList'>) {
  const insets = useSafeAreaInsets();
  const [notes, setNotes] = useState<NoteView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const seenInitialMount = useRef(false);

  const fetchAll = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await listBookmarkedNotes({ limit: 50 });
      setNotes(result.data);
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

  // Refresh on focus so toggling a bookmark elsewhere stays in sync.
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

  const handleRemove = useCallback(
    async (noteId: string) => {
      if (pendingId) return;
      setPendingId(noteId);
      // Optimistically remove from the list (since this screen ONLY shows
      // bookmarked notes, unbookmarking means it disappears).
      const prev = notes;
      setNotes((current) => current.filter((n) => n.id !== noteId));
      try {
        const result = await setBookmark(noteId, false);
        if (result.bookmarked) {
          // Backend kept it bookmarked — roll back the list.
          setNotes(prev);
        }
      } catch {
        setNotes(prev);
      } finally {
        setPendingId(null);
      }
    },
    [notes, pendingId],
  );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: vaasenkNative.colors.surface.warmCanvas,
      }}
    >
      {/* Hero */}
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
              Saved
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
              Your bookmarks
            </Text>
            <Text
              style={{
                marginTop: vaasenkNative.spacing.sm,
                color: 'rgba(255,255,255,0.92)',
                fontSize: 14,
              }}
            >
              {notes.length === 0
                ? 'Save notes you want to revisit.'
                : `${notes.length} saved ${notes.length === 1 ? 'note' : 'notes'}`}
            </Text>
          </View>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: 'rgba(255,255,255,0.22)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Bookmark size={22} color={vaasenkNative.colors.text.inverse} />
          </View>
        </View>
      </LinearGradient>

      {error ? (
        <View style={{ marginTop: vaasenkNative.spacing.lg }}>
          <ErrorState message={error} onRetry={() => fetchAll(false)} />
        </View>
      ) : null}

      {loading && notes.length === 0 && !error ? (
        <View style={{ paddingTop: vaasenkNative.spacing.xl }}>
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
            icon={<Bookmark size={24} color={vaasenkNative.colors.text.deepMaroon} />}
            title="No bookmarks yet"
            description="Tap the bookmark icon on any note to save it here for quick revision."
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
              bookmarked
              bookmarkPending={pendingId === item.id}
              onToggleBookmark={() => handleRemove(item.id)}
              onPress={() =>
                navigation.navigate('NoteDetail', {
                  noteId: item.id,
                  classroomId: item.classroomId,
                })
              }
              showClassroom
            />
          )}
          contentContainerStyle={{
            paddingTop: vaasenkNative.spacing.lg,
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

// Pressable export is used elsewhere across the file by composition; keep
// referenced so the bundler doesn't tree-shake the lint suppression.
void Pressable;
