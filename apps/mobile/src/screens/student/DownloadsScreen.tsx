/**
 * Vaasenk Mobile — DownloadsScreen (Sprint 7.2).
 *
 * Reads the local downloads index. No network calls. Tapping a row opens
 * NoteDetail with `offline: true` so the viewer reads the local file
 * instead of hitting the API.
 *
 * Long-press opens an in-app confirmation to delete the download.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Download, FileText, Image as ImageIcon, Trash2 } from 'lucide-react-native';
import {
  deleteDownload,
  formatBytes,
  listDownloads,
  totalDownloadedBytes,
  type DownloadEntry,
} from '@/services/downloads';
import { EmptyState } from '@/components/EmptyState';
import { LoadingShimmer } from '@/components/LoadingShimmer';
import { gradientProps, vaasenkNative } from '@/theme/tokens';
import type { StudentDownloadsScreenProps } from '@/navigation/types';

export function DownloadsScreen({
  navigation,
}: StudentDownloadsScreenProps<'DownloadsList'>) {
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<DownloadEntry[]>([]);
  const [bytes, setBytes] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const seenInitialMount = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, total] = await Promise.all([
        listDownloads(),
        totalDownloadedBytes(),
      ]);
      setEntries(list);
      setBytes(total);
    } finally {
      setLoading(false);
      seenInitialMount.current = true;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Re-read on focus so a download or delete from elsewhere is reflected.
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      if (!seenInitialMount.current) return;
      void refresh();
    });
    return unsub;
  }, [navigation, refresh]);

  const confirmDelete = useCallback(
    (entry: DownloadEntry) => {
      Alert.alert(
        'Remove download',
        `Delete the offline copy of "${entry.title}"? You can re-download it any time while online.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              await deleteDownload(entry.noteId);
              await refresh();
            },
          },
        ],
      );
    },
    [refresh],
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
              Offline
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
              Downloaded notes
            </Text>
            <Text
              style={{
                marginTop: vaasenkNative.spacing.sm,
                color: 'rgba(255,255,255,0.92)',
                fontSize: 14,
              }}
            >
              {entries.length === 0
                ? 'Save notes for offline reading.'
                : `${entries.length} ${entries.length === 1 ? 'note' : 'notes'} · ${formatBytes(bytes)}`}
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
            <Download size={22} color={vaasenkNative.colors.text.inverse} />
          </View>
        </View>
      </LinearGradient>

      {loading && entries.length === 0 ? (
        <View style={{ paddingTop: vaasenkNative.spacing.xl }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <View
              key={i}
              style={{
                marginHorizontal: vaasenkNative.spacing.xl,
                marginBottom: vaasenkNative.spacing.md,
              }}
            >
              <LoadingShimmer height={88} borderRadius={20} />
            </View>
          ))}
        </View>
      ) : null}

      {!loading && entries.length === 0 ? (
        <View style={{ marginTop: vaasenkNative.spacing.xl }}>
          <EmptyState
            icon={<Download size={24} color={vaasenkNative.colors.text.deepMaroon} />}
            title="No downloads yet"
            description="Tap the download icon on any note to save it here for offline reading."
          />
        </View>
      ) : null}

      {!loading && entries.length > 0 ? (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.noteId}
          renderItem={({ item }) => (
            <DownloadRow
              entry={item}
              onPress={() =>
                navigation.navigate('NoteDetail', {
                  noteId: item.noteId,
                  classroomId: item.classroomId,
                  offline: true,
                })
              }
              onDelete={() => confirmDelete(item)}
            />
          )}
          contentContainerStyle={{
            paddingTop: vaasenkNative.spacing.lg,
            paddingBottom: insets.bottom + 120,
          }}
          showsVerticalScrollIndicator={false}
        />
      ) : null}
    </View>
  );
}

function DownloadRow({
  entry,
  onPress,
  onDelete,
}: {
  entry: DownloadEntry;
  onPress: () => void;
  onDelete: () => void;
}) {
  const isImage = entry.mimeType?.startsWith('image/') ?? false;
  return (
    <View
      style={{
        marginHorizontal: vaasenkNative.spacing.xl,
        marginBottom: vaasenkNative.spacing.md,
        borderRadius: vaasenkNative.radius.lg,
        backgroundColor: vaasenkNative.colors.surface.glassWhite,
        borderWidth: 1,
        borderColor: 'rgba(160,0,0,0.08)',
        flexDirection: 'row',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      <Pressable
        onPress={onPress}
        onLongPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={`Open ${entry.title} offline`}
        style={({ pressed }) => ({
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          padding: vaasenkNative.spacing.md,
          gap: vaasenkNative.spacing.md,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: vaasenkNative.radius.md,
            backgroundColor: vaasenkNative.colors.surface.peachWash,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isImage ? (
            <ImageIcon size={24} color={vaasenkNative.colors.brand.red} />
          ) : (
            <FileText size={24} color={vaasenkNative.colors.brand.red} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={2}
            style={{
              color: vaasenkNative.colors.text.ink,
              fontWeight: '700',
              fontSize: 15,
            }}
          >
            {entry.title}
          </Text>
          {entry.classroomName ? (
            <Text
              numberOfLines={1}
              style={{
                marginTop: 2,
                color: vaasenkNative.colors.text.deepMaroon,
                fontSize: 12,
                fontWeight: '600',
              }}
            >
              {entry.classroomName}
            </Text>
          ) : null}
          <Text
            style={{
              marginTop: 4,
              color: vaasenkNative.colors.text.muted,
              fontSize: 12,
            }}
          >
            {formatBytes(entry.sizeBytes)}
            {' · '}
            {new Date(entry.downloadedAt).toLocaleDateString('en-IN', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>
        </View>
      </Pressable>
      <Pressable
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${entry.title}`}
        hitSlop={8}
        style={({ pressed }) => ({
          width: 56,
          height: 76,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Trash2 size={20} color={vaasenkNative.colors.semantic.danger} />
      </Pressable>
    </View>
  );
}
