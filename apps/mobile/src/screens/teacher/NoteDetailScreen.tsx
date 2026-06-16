/**
 * Vaasenk Mobile — Teacher NoteDetailScreen (Sprint 7.3).
 *
 * Lightweight teacher-side note inspector. The student version supports
 * pinch-zoom, bookmarking, offline downloads, and a full chrome-less
 * viewer route group; the teacher only needs to verify what students see
 * AND archive on demand. So we render a simpler viewer:
 *
 *   - Image:           expo-image at contentFit="contain" (no pinch-zoom).
 *   - PDF:             react-native-pdf with the same lazy-require fallback.
 *   - Bottom bar:      Share | Archive.
 *
 * Re-using the rich student viewer was tempting but its route props are
 * student-only; this stays small and focused.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import {
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  Share2,
  Trash2,
} from 'lucide-react-native';
import { ApiClientError } from '@/services/api';
import {
  deleteNoteForTeacher,
  getNote,
  TAG_LABELS,
  type NoteView,
} from '@/services/notes';
import { ErrorState } from '@/components/ErrorState';
import { LoadingShimmer } from '@/components/LoadingShimmer';
import { gradientProps, vaasenkNative } from '@/theme/tokens';
import type { TeacherClassroomsScreenProps } from '@/navigation/types';

let PdfModule:
  | typeof import('react-native-pdf')['default']
  | null = null;
try {
  PdfModule = require('react-native-pdf').default;
} catch {
  PdfModule = null;
}

export function TeacherNoteDetailScreen({
  navigation,
  route,
}: TeacherClassroomsScreenProps<'NoteDetail'>) {
  const insets = useSafeAreaInsets();
  const { noteId } = route.params;

  const [note, setNote] = useState<NoteView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  // ---------- Load ---------------------------------------------------------
  const fetchNote = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getNote(noteId);
      setNote(data);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not load note.',
      );
    } finally {
      setLoading(false);
    }
  }, [noteId]);

  useEffect(() => {
    void fetchNote();
  }, [fetchNote]);

  // ---------- Actions ------------------------------------------------------
  const onShare = useCallback(async () => {
    if (!note?.fileSignedUrl) return;
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(note.fileSignedUrl, {
          dialogTitle: note.title,
        });
      } else {
        await Share.share({ url: note.fileSignedUrl, message: note.title });
      }
    } catch {
      // Cancelled.
    }
  }, [note]);

  const onArchive = useCallback(() => {
    if (!note) return;
    Alert.alert('Archive this note?', `"${note.title}" will be hidden from students.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          setArchiving(true);
          try {
            await deleteNoteForTeacher(note.id);
            navigation.goBack();
          } catch (err) {
            Alert.alert(
              'Could not archive',
              err instanceof Error ? err.message : 'Try again.',
            );
          } finally {
            setArchiving(false);
          }
        },
      },
    ]);
  }, [note, navigation]);

  // ---------- Render -------------------------------------------------------
  const mime = note?.mimeType ?? note?.fileType ?? null;
  const isImage = mime?.startsWith('image/') ?? false;
  const isPdf = mime === 'application/pdf';
  const url = note?.fileSignedUrl ?? null;

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
          paddingBottom: vaasenkNative.spacing.lg,
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
              fontWeight: '800',
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
            numberOfLines={1}
          >
            Note preview
          </Text>
          <Pressable
            onPress={onShare}
            disabled={!url}
            accessibilityRole="button"
            accessibilityLabel="Share"
            hitSlop={8}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(255,255,255,0.22)',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: !url ? 0.4 : pressed ? 0.7 : 1,
            })}
          >
            <Share2 size={18} color={vaasenkNative.colors.text.inverse} />
          </Pressable>
        </View>

        <View style={{ marginTop: vaasenkNative.spacing.md }}>
          {note ? (
            <>
              <Text
                style={{
                  color: vaasenkNative.colors.text.inverse,
                  fontSize: 20,
                  fontWeight: '800',
                }}
                numberOfLines={2}
              >
                {note.title}
              </Text>
              {note.tags.length > 0 ? (
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 4,
                    marginTop: vaasenkNative.spacing.sm,
                  }}
                >
                  {note.tags.map((t) => (
                    <View
                      key={t}
                      style={{
                        paddingHorizontal: vaasenkNative.spacing.sm,
                        paddingVertical: 2,
                        borderRadius: vaasenkNative.radius.full,
                        backgroundColor: 'rgba(255,255,255,0.22)',
                      }}
                    >
                      <Text
                        style={{
                          color: vaasenkNative.colors.text.inverse,
                          fontSize: 10,
                          fontWeight: '700',
                          letterSpacing: 0.4,
                          textTransform: 'uppercase',
                        }}
                      >
                        {TAG_LABELS[t]}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              <View
                style={{
                  marginTop: vaasenkNative.spacing.sm,
                  paddingHorizontal: vaasenkNative.spacing.sm,
                  paddingVertical: 2,
                  borderRadius: vaasenkNative.radius.full,
                  backgroundColor:
                    note.status === 'PUBLISHED'
                      ? 'rgba(23,167,91,0.32)'
                      : note.status === 'DRAFT'
                        ? 'rgba(245,158,11,0.32)'
                        : 'rgba(255,255,255,0.22)',
                  alignSelf: 'flex-start',
                }}
              >
                <Text
                  style={{
                    color: vaasenkNative.colors.text.inverse,
                    fontSize: 10,
                    fontWeight: '700',
                    letterSpacing: 0.4,
                    textTransform: 'uppercase',
                  }}
                >
                  {note.status}
                </Text>
              </View>
            </>
          ) : (
            <LoadingShimmer height={28} borderRadius={8} />
          )}
        </View>
      </LinearGradient>

      {/* Viewer */}
      <View style={{ flex: 1, padding: vaasenkNative.spacing.xl }}>
        {loading && !note ? (
          <LoadingShimmer height={400} borderRadius={20} />
        ) : null}

        {error && !note ? (
          <ErrorState message={error} onRetry={fetchNote} />
        ) : null}

        {note && url ? (
          <View
            style={{
              flex: 1,
              borderRadius: vaasenkNative.radius.lg,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: 'rgba(160,0,0,0.12)',
              backgroundColor: vaasenkNative.colors.surface.peachWash,
            }}
          >
            {isImage ? (
              <Image
                source={{ uri: url }}
                style={StyleSheet.absoluteFillObject}
                contentFit="contain"
                transition={150}
              />
            ) : isPdf ? (
              PdfModule ? (
                <PdfModule
                  source={{ uri: url, cache: true }}
                  style={{ flex: 1, width: '100%' }}
                  onError={(err: unknown) => {
                    const msg =
                      err instanceof Error
                        ? err.message
                        : 'PDF failed to load.';
                    setError(msg);
                  }}
                />
              ) : (
                <FallbackOpenExternal url={url} />
              )
            ) : (
              <FallbackOpenExternal url={url} />
            )}
          </View>
        ) : null}

        {note && !url ? (
          <View
            style={{
              padding: vaasenkNative.spacing.xl,
              alignItems: 'center',
              gap: vaasenkNative.spacing.sm,
            }}
          >
            <AlertCircle size={24} color={vaasenkNative.colors.text.muted} />
            <Text
              style={{
                color: vaasenkNative.colors.text.muted,
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              This note has no file attached.
            </Text>
          </View>
        ) : null}
      </View>

      {/* Bottom action bar */}
      {note ? (
        <View
          style={{
            paddingTop: vaasenkNative.spacing.md,
            paddingBottom: insets.bottom + vaasenkNative.spacing.md,
            paddingHorizontal: vaasenkNative.spacing.xl,
            borderTopWidth: 1,
            borderTopColor: 'rgba(160,0,0,0.12)',
            backgroundColor: vaasenkNative.colors.surface.glassWhite,
            flexDirection: 'row',
            gap: vaasenkNative.spacing.sm,
          }}
        >
          <Pressable
            onPress={onShare}
            disabled={!url}
            accessibilityRole="button"
            accessibilityLabel="Share"
            style={({ pressed }) => ({
              flex: 1,
              minHeight: vaasenkNative.components.button.minHeight,
              borderRadius: vaasenkNative.components.button.borderRadius,
              borderWidth: 1,
              borderColor: 'rgba(160,0,0,0.24)',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
              opacity: !url ? 0.4 : pressed ? 0.7 : 1,
            })}
          >
            <Share2 size={16} color={vaasenkNative.colors.brand.red} />
            <Text
              style={{
                color: vaasenkNative.colors.brand.red,
                fontWeight: '800',
                fontSize: 14,
              }}
            >
              Share
            </Text>
          </Pressable>
          <Pressable
            onPress={onArchive}
            disabled={archiving}
            accessibilityRole="button"
            accessibilityLabel="Archive note"
            style={({ pressed }) => ({
              flex: 1,
              minHeight: vaasenkNative.components.button.minHeight,
              borderRadius: vaasenkNative.components.button.borderRadius,
              borderWidth: 1,
              borderColor: 'rgba(220,38,38,0.32)',
              backgroundColor: 'rgba(220,38,38,0.08)',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
              opacity: archiving ? 0.5 : pressed ? 0.7 : 1,
            })}
          >
            {archiving ? (
              <ActivityIndicator color={vaasenkNative.colors.semantic.danger} />
            ) : (
              <Trash2 size={16} color={vaasenkNative.colors.semantic.danger} />
            )}
            <Text
              style={{
                color: vaasenkNative.colors.semantic.danger,
                fontWeight: '800',
                fontSize: 14,
              }}
            >
              {archiving ? 'Archiving…' : 'Archive'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function FallbackOpenExternal({ url }: { url: string }) {
  const openExternal = async () => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(url, { dialogTitle: 'Open file' });
      } else {
        await Share.share({ url });
      }
    } catch {
      // ignore
    }
  };
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: vaasenkNative.spacing.xl,
        gap: vaasenkNative.spacing.md,
      }}
    >
      <ExternalLink size={28} color={vaasenkNative.colors.text.deepMaroon} />
      <Text
        style={{
          color: vaasenkNative.colors.text.ink,
          fontWeight: '800',
          fontSize: 16,
          textAlign: 'center',
        }}
      >
        Preview unavailable
      </Text>
      <Text
        style={{
          color: vaasenkNative.colors.text.muted,
          fontSize: 13,
          textAlign: 'center',
          maxWidth: 280,
        }}
      >
        This file type can't be previewed in-app yet. Open externally to
        view it.
      </Text>
      <Pressable
        onPress={openExternal}
        accessibilityRole="button"
        accessibilityLabel="Open externally"
        style={({ pressed }) => ({
          minHeight: 44,
          paddingHorizontal: vaasenkNative.spacing.xl,
          borderRadius: vaasenkNative.radius.full,
          backgroundColor: vaasenkNative.colors.brand.red,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text
          style={{
            color: vaasenkNative.colors.text.inverse,
            fontWeight: '800',
            fontSize: 14,
          }}
        >
          Open externally
        </Text>
      </Pressable>
    </View>
  );
}
