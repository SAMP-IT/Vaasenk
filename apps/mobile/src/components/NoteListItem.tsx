/**
 * Vaasenk Mobile — NoteListItem.
 *
 * Shared note row used by ClassroomFeed, Bookmarks, and (indirectly via
 * its compact form) the Home recent-notes carousel. Tap the row to open
 * NoteDetail; the bookmark + download icons live inside the row but are
 * not nested inside the outer Pressable — see the touch-target setup
 * below for the "two adjacent pressables" pattern that avoids the
 * accessibility nesting warning.
 *
 * Per CLAUDE.md §4 the card uses rounded-[24] glass surface on the cream
 * canvas, never plain white. Touch targets ≥44px (the chevron region
 * plus the icon buttons all satisfy this).
 */

import { Bookmark, BookmarkCheck, Download, FileText, Image as ImageIcon } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { TAG_LABELS, type NoteTag, type NoteView } from '@/services/notes';
import { vaasenkNative } from '@/theme/tokens';

type Props = {
  note: NoteView;
  onPress: () => void;
  bookmarked: boolean;
  bookmarkPending?: boolean;
  onToggleBookmark?: () => void;
  /** Set when this note is already downloaded for offline reading. */
  downloaded?: boolean;
  downloadPending?: boolean;
  downloadProgress?: number;
  onDownload?: () => void;
  /** Set when this row is rendered in a context where the classroom name matters. */
  showClassroom?: boolean;
};

export function NoteListItem({
  note,
  onPress,
  bookmarked,
  bookmarkPending,
  onToggleBookmark,
  downloaded,
  downloadPending,
  downloadProgress,
  onDownload,
  showClassroom,
}: Props) {
  const mime = note.mimeType ?? note.fileType ?? null;
  const isImage = mime?.startsWith('image/') ?? false;
  const thumbnail = note.thumbnailSignedUrl ?? (isImage ? note.fileSignedUrl : null);

  const visibleTags = useMemo(() => note.tags.slice(0, 3), [note.tags]);
  const overflowTagCount = note.tags.length - visibleTags.length;
  const relative = useMemo(
    () => formatRelative(note.publishedAt ?? note.createdAt),
    [note.publishedAt, note.createdAt],
  );

  return (
    <View
      style={[
        {
          borderRadius: vaasenkNative.radius.lg,
          backgroundColor: vaasenkNative.colors.surface.glassWhite,
          borderWidth: 1,
          borderColor: 'rgba(160,0,0,0.08)',
          marginHorizontal: vaasenkNative.spacing.xl,
          marginBottom: vaasenkNative.spacing.md,
          overflow: 'hidden',
        },
        vaasenkNative.shadows.cardSoft,
      ]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Open ${note.title}`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          padding: vaasenkNative.spacing.md,
          gap: vaasenkNative.spacing.md,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        {/* Thumbnail */}
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: vaasenkNative.radius.md,
            backgroundColor: vaasenkNative.colors.surface.peachWash,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {thumbnail ? (
            <Image
              source={{ uri: thumbnail }}
              style={{ width: 80, height: 80 }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={150}
            />
          ) : isImage ? (
            <ImageIcon
              size={28}
              color={vaasenkNative.colors.brand.red}
            />
          ) : (
            <FileText
              size={28}
              color={vaasenkNative.colors.brand.red}
            />
          )}
        </View>

        {/* Body */}
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={2}
            style={{
              color: vaasenkNative.colors.text.ink,
              fontSize: 16,
              fontWeight: '700',
              lineHeight: 22,
            }}
          >
            {note.title}
          </Text>

          {showClassroom && note.classroom?.name ? (
            <Text
              numberOfLines={1}
              style={{
                marginTop: 2,
                color: vaasenkNative.colors.text.deepMaroon,
                fontSize: 12,
                fontWeight: '600',
              }}
            >
              {note.classroom.name}
            </Text>
          ) : null}

          {note.description ? (
            <Text
              numberOfLines={2}
              style={{
                marginTop: 4,
                color: vaasenkNative.colors.text.muted,
                fontSize: 13,
                lineHeight: 18,
              }}
            >
              {note.description}
            </Text>
          ) : null}

          {visibleTags.length > 0 ? (
            <View
              style={{
                marginTop: vaasenkNative.spacing.sm,
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 6,
              }}
            >
              {visibleTags.map((tag) => (
                <TagBadge key={tag} tag={tag} />
              ))}
              {overflowTagCount > 0 ? (
                <Text
                  style={{
                    color: vaasenkNative.colors.text.subtle,
                    fontSize: 11,
                    fontWeight: '600',
                    alignSelf: 'center',
                  }}
                >
                  +{overflowTagCount}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View
            style={{
              marginTop: vaasenkNative.spacing.sm,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                color: vaasenkNative.colors.text.muted,
                fontSize: 12,
              }}
            >
              {note.teacher.name || 'Teacher'}
            </Text>
            <Text
              style={{
                color: vaasenkNative.colors.text.subtle,
                fontSize: 11,
              }}
            >
              {relative}
            </Text>
          </View>
        </View>
      </Pressable>

      {/* Action row — kept separate so the inner buttons don't nest
          inside the outer Pressable. */}
      {(onToggleBookmark || onDownload) ? (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTopWidth: 1,
            borderTopColor: 'rgba(160,0,0,0.08)',
            paddingHorizontal: vaasenkNative.spacing.md,
            paddingVertical: vaasenkNative.spacing.xs,
            backgroundColor: 'rgba(255,255,255,0.5)',
          }}
        >
          {onToggleBookmark ? (
            <Pressable
              onPress={onToggleBookmark}
              disabled={bookmarkPending}
              accessibilityRole="button"
              accessibilityState={{ selected: bookmarked }}
              accessibilityLabel={bookmarked ? 'Remove bookmark' : 'Bookmark'}
              hitSlop={8}
              style={({ pressed }) => ({
                minHeight: 44,
                minWidth: 44,
                paddingHorizontal: vaasenkNative.spacing.md,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                opacity: bookmarkPending ? 0.5 : pressed ? 0.7 : 1,
              })}
            >
              {bookmarked ? (
                <BookmarkCheck
                  size={20}
                  color={vaasenkNative.colors.brand.gold}
                  fill={vaasenkNative.colors.brand.gold}
                />
              ) : (
                <Bookmark
                  size={20}
                  color={vaasenkNative.colors.text.muted}
                />
              )}
              <Text
                style={{
                  color: bookmarked
                    ? vaasenkNative.colors.text.deepMaroon
                    : vaasenkNative.colors.text.muted,
                  fontWeight: '600',
                  fontSize: 13,
                }}
              >
                {bookmarked ? 'Saved' : 'Save'}
              </Text>
            </Pressable>
          ) : (
            <View style={{ width: 44, height: 44 }} />
          )}

          {onDownload ? (
            <Pressable
              onPress={onDownload}
              disabled={downloadPending || downloaded}
              accessibilityRole="button"
              accessibilityLabel={
                downloaded
                  ? 'Downloaded for offline'
                  : downloadPending
                    ? 'Downloading'
                    : 'Download for offline'
              }
              hitSlop={8}
              style={({ pressed }) => ({
                minHeight: 44,
                paddingHorizontal: vaasenkNative.spacing.md,
                borderRadius: vaasenkNative.radius.full,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Download
                size={18}
                color={
                  downloaded
                    ? vaasenkNative.colors.semantic.success
                    : vaasenkNative.colors.brand.red
                }
              />
              <Text
                style={{
                  color: downloaded
                    ? vaasenkNative.colors.semantic.success
                    : vaasenkNative.colors.brand.red,
                  fontWeight: '700',
                  fontSize: 13,
                }}
              >
                {downloaded
                  ? 'Offline'
                  : downloadPending
                    ? typeof downloadProgress === 'number'
                      ? `${Math.round(downloadProgress * 100)}%`
                      : 'Downloading…'
                    : 'Download'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function TagBadge({ tag }: { tag: NoteTag }) {
  const palette = TAG_PALETTE[tag];
  return (
    <View
      style={{
        paddingHorizontal: vaasenkNative.spacing.sm,
        paddingVertical: 2,
        borderRadius: vaasenkNative.radius.full,
        backgroundColor: palette.bg,
      }}
    >
      <Text
        style={{
          color: palette.fg,
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.3,
          textTransform: 'uppercase',
        }}
      >
        {TAG_LABELS[tag]}
      </Text>
    </View>
  );
}

/**
 * Tag → background + foreground tokens. Mirrors web's TAG_CHIP_CLASSES
 * but in RN-friendly color literals. All references use the same
 * vaasenkNative palette so a theme update flows through.
 */
const TAG_PALETTE: Record<NoteTag, { bg: string; fg: string }> = {
  IMPORTANT: { bg: 'rgba(220,38,38,0.15)', fg: '#B91C1C' },
  HOMEWORK: { bg: 'rgba(245,158,11,0.18)', fg: '#B45309' },
  REVISION: { bg: 'rgba(37,99,235,0.15)', fg: '#1D4ED8' },
  FORMULA: { bg: 'rgba(254,202,2,0.22)', fg: '#5A0508' },
  ASSIGNMENT: { bg: 'rgba(255,92,138,0.18)', fg: '#C0387A' },
  EXAM: { bg: 'rgba(74,5,8,0.12)', fg: '#4A0508' },
};

function formatRelative(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  const diff = Date.now() - t.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'Just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m`;
  if (diff < day) return `${Math.floor(diff / hour)}h`;
  const days = Math.floor(diff / day);
  if (days < 2) return 'Yesterday';
  if (days < 7) return `${days}d`;
  return t.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}
