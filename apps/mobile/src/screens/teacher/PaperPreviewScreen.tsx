/**
 * Vaasenk Mobile — PaperPreviewScreen (Sprint 7.3).
 *
 * Mounted after a successful paper generation. Shows:
 *   - Teacher Orange hero with paper title + AI confidence badge.
 *   - Segmented control: Paper PDF | Answer Key PDF.
 *   - PDF viewer via react-native-pdf (same lazy-require pattern as
 *     student NoteDetailScreen — Expo Go crashes without a dev build,
 *     so we guard the import).
 *   - Bottom action bar: Export | Publish.
 *
 * Editing on mobile is intentionally out-of-scope (the structured JSON
 * editor doesn't translate well to a phone). The "Edit" CTA links to the
 * web wizard instead — a deliberate trade-off to ship 7.3 on time.
 *
 * GAP: backend has no `GET /question-papers/:id` detail endpoint. We
 * therefore read the paper data from the job snapshot loaded by the
 * route param `jobId`. Re-loading the screen will re-poll the job to
 * surface the freshest signed URL after export.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  ShieldAlert,
  Share2,
  Sparkles,
} from 'lucide-react-native';
import {
  exportPaper,
  getPaperJob,
  publishPaper,
  type QuestionPaperDetail,
} from '@/services/papers';
import { ApiClientError } from '@/services/api';
import { ConfidenceBadge } from '@/components/teacher/ConfidenceBadge';
import { ErrorState } from '@/components/ErrorState';
import { LoadingShimmer } from '@/components/LoadingShimmer';
import { gradientProps, vaasenkNative } from '@/theme/tokens';
import type { TeacherClassroomsScreenProps } from '@/navigation/types';

// Lazy require of react-native-pdf — see student NoteDetailScreen for
// the rationale (Expo Go can't host this native module).
let PdfModule:
  | typeof import('react-native-pdf')['default']
  | null = null;
try {
  PdfModule = require('react-native-pdf').default;
} catch {
  PdfModule = null;
}

type ViewerTab = 'paper' | 'answer';

export function PaperPreviewScreen({
  navigation,
  route,
}: TeacherClassroomsScreenProps<'PaperPreview'>) {
  const insets = useSafeAreaInsets();
  const { jobId } = route.params;

  const [paper, setPaper] = useState<QuestionPaperDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ViewerTab>('paper');
  const [exporting, setExporting] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // ---------- Load ---------------------------------------------------------
  const fetchJob = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getPaperJob(jobId);
      if (!result.job.paper) {
        setError('Paper data is not available yet. Try again in a moment.');
        return;
      }
      setPaper(result.job.paper);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not load paper.',
      );
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void fetchJob();
  }, [fetchJob]);

  // ---------- Export -------------------------------------------------------
  const onExport = useCallback(async () => {
    if (!paper) return;
    setExporting(true);
    try {
      const result = await exportPaper(paper.id);
      setPaper(result.paper);
    } catch (err) {
      Alert.alert(
        'Export failed',
        err instanceof Error ? err.message : 'Try again.',
      );
    } finally {
      setExporting(false);
    }
  }, [paper]);

  // ---------- Publish ------------------------------------------------------
  const onPublish = useCallback(() => {
    if (!paper) return;
    if (!paper.fileUrl || !paper.fileSignedUrl) {
      Alert.alert(
        'Export first',
        'Generate a PDF before publishing. Tap "Export" below.',
      );
      return;
    }
    Alert.alert(
      'Publish this paper?',
      'Students in the classroom will get a notification with a link to the paper.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Publish',
          style: 'default',
          onPress: async () => {
            setPublishing(true);
            try {
              const result = await publishPaper(paper.id);
              setPaper(result.paper);
            } catch (err) {
              Alert.alert(
                'Publish failed',
                err instanceof Error ? err.message : 'Try again.',
              );
            } finally {
              setPublishing(false);
            }
          },
        },
      ],
    );
  }, [paper]);

  const onShare = useCallback(async () => {
    if (!paper?.fileSignedUrl) return;
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(paper.fileSignedUrl, {
          mimeType: 'application/pdf',
          dialogTitle: paper.title,
        });
      } else {
        await Share.share({ url: paper.fileSignedUrl, message: paper.title });
      }
    } catch {
      // User cancelled — ignore.
    }
  }, [paper]);

  // ---------- Render: loading / error --------------------------------------
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: vaasenkNative.colors.surface.warmCanvas,
          paddingTop: insets.top + vaasenkNative.spacing.lg,
          paddingHorizontal: vaasenkNative.spacing.xl,
        }}
      >
        <LoadingShimmer height={120} borderRadius={20} />
        <View style={{ height: vaasenkNative.spacing.lg }} />
        <LoadingShimmer height={300} borderRadius={20} />
      </View>
    );
  }

  if (error || !paper) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: vaasenkNative.colors.surface.warmCanvas,
          paddingTop: insets.top + vaasenkNative.spacing.lg,
        }}
      >
        <View
          style={{
            paddingHorizontal: vaasenkNative.spacing.xl,
            marginBottom: vaasenkNative.spacing.lg,
          }}
        >
          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            style={({ pressed }) => ({
              alignSelf: 'flex-start',
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: vaasenkNative.colors.surface.glassWhite,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: 'rgba(160,0,0,0.12)',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <ArrowLeft size={18} color={vaasenkNative.colors.text.deepMaroon} />
          </Pressable>
        </View>
        <ErrorState
          message={error ?? 'Paper not available.'}
          onRetry={fetchJob}
        />
      </View>
    );
  }

  const hasExport = Boolean(paper.fileSignedUrl);
  const isPublished = paper.status === 'PUBLISHED';
  const currentUrl =
    tab === 'paper' ? paper.fileSignedUrl : paper.answerKeySignedUrl;

  // ---------- Render: success ----------------------------------------------
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
          >
            Paper preview
          </Text>
          <Pressable
            onPress={onShare}
            disabled={!hasExport}
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
              opacity: !hasExport ? 0.4 : pressed ? 0.7 : 1,
            })}
          >
            <Share2 size={18} color={vaasenkNative.colors.text.inverse} />
          </Pressable>
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
            {paper.title}
          </Text>
          <Text
            style={{
              marginTop: 2,
              color: 'rgba(255,255,255,0.92)',
              fontSize: 13,
            }}
          >
            {paper.totalMarks} marks
            {paper.durationMinutes ? ` · ${paper.durationMinutes} min` : ''}
          </Text>
          <View style={{ marginTop: vaasenkNative.spacing.sm }}>
            <ConfidenceBadge confidence={paper.aiConfidence} />
          </View>
        </View>
      </LinearGradient>

      {/* Segmented control */}
      <View
        style={{
          flexDirection: 'row',
          marginTop: vaasenkNative.spacing.md,
          marginHorizontal: vaasenkNative.spacing.xl,
          padding: 4,
          borderRadius: vaasenkNative.radius.full,
          backgroundColor: vaasenkNative.colors.surface.glassWhite,
          borderWidth: 1,
          borderColor: 'rgba(160,0,0,0.12)',
        }}
      >
        <SegmentTab
          label="Paper"
          active={tab === 'paper'}
          onPress={() => setTab('paper')}
        />
        <SegmentTab
          label="Answer key"
          active={tab === 'answer'}
          onPress={() => setTab('answer')}
          disabled={!paper.answerKeyFileUrl}
        />
      </View>

      {/* Viewer */}
      <View
        style={{
          flex: 1,
          marginTop: vaasenkNative.spacing.md,
          marginHorizontal: vaasenkNative.spacing.xl,
          borderRadius: vaasenkNative.radius.lg,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: 'rgba(160,0,0,0.12)',
          backgroundColor: vaasenkNative.colors.surface.peachWash,
        }}
      >
        {!hasExport ? (
          <NotYetExportedState />
        ) : !currentUrl ? (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              padding: vaasenkNative.spacing.xl,
              gap: vaasenkNative.spacing.md,
            }}
          >
            <FileText size={32} color={vaasenkNative.colors.text.muted} />
            <Text
              style={{
                color: vaasenkNative.colors.text.muted,
                fontSize: 14,
                textAlign: 'center',
              }}
            >
              {tab === 'answer'
                ? "This paper doesn't include an answer key."
                : 'Paper PDF is not available.'}
            </Text>
          </View>
        ) : PdfModule ? (
          <PdfModule
            source={{ uri: currentUrl, cache: true }}
            style={{ flex: 1, width: '100%' }}
            trustAllCerts={false}
            onError={(err: unknown) => {
              const message =
                err instanceof Error ? err.message : 'PDF failed to load.';
              setError(message);
            }}
          />
        ) : (
          <PdfFallback url={currentUrl} />
        )}
      </View>

      {/* Action bar */}
      <View
        style={{
          paddingTop: vaasenkNative.spacing.md,
          paddingBottom: insets.bottom + vaasenkNative.spacing.md,
          paddingHorizontal: vaasenkNative.spacing.xl,
          gap: vaasenkNative.spacing.sm,
        }}
      >
        {isPublished ? (
          <View
            style={{
              padding: vaasenkNative.spacing.md,
              borderRadius: vaasenkNative.radius.lg,
              backgroundColor: 'rgba(23,167,91,0.14)',
              borderWidth: 1,
              borderColor: 'rgba(23,167,91,0.32)',
              flexDirection: 'row',
              gap: vaasenkNative.spacing.sm,
              alignItems: 'center',
            }}
          >
            <CheckCircle2
              size={18}
              color={vaasenkNative.colors.semantic.success}
            />
            <Text
              style={{
                flex: 1,
                color: vaasenkNative.colors.semantic.success,
                fontWeight: '700',
                fontSize: 14,
              }}
            >
              Published to classroom
            </Text>
          </View>
        ) : (
          <View
            style={{
              flexDirection: 'row',
              gap: vaasenkNative.spacing.sm,
            }}
          >
            <Pressable
              onPress={onExport}
              disabled={exporting || hasExport}
              accessibilityRole="button"
              accessibilityLabel={hasExport ? 'Already exported' : 'Export PDF'}
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
                opacity: hasExport ? 0.5 : pressed ? 0.7 : 1,
              })}
            >
              {exporting ? (
                <ActivityIndicator color={vaasenkNative.colors.brand.red} />
              ) : (
                <Download size={16} color={vaasenkNative.colors.brand.red} />
              )}
              <Text
                style={{
                  color: vaasenkNative.colors.brand.red,
                  fontWeight: '800',
                  fontSize: 14,
                }}
              >
                {hasExport ? 'Exported' : exporting ? 'Exporting…' : 'Export PDF'}
              </Text>
            </Pressable>
            <Pressable
              onPress={onPublish}
              disabled={publishing || !hasExport}
              accessibilityRole="button"
              accessibilityLabel="Publish to classroom"
              style={({ pressed }) => ({
                flex: 1,
                opacity:
                  publishing || !hasExport ? 0.5 : pressed ? 0.9 : 1,
              })}
            >
              <LinearGradient
                {...gradientProps('heroSunrise')}
                style={[
                  {
                    minHeight: vaasenkNative.components.button.minHeight,
                    borderRadius: vaasenkNative.components.button.borderRadius,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 6,
                  },
                  vaasenkNative.shadows.glowRed,
                ]}
              >
                {publishing ? (
                  <ActivityIndicator color={vaasenkNative.colors.text.inverse} />
                ) : (
                  <Sparkles size={16} color={vaasenkNative.colors.text.inverse} />
                )}
                <Text
                  style={{
                    color: vaasenkNative.colors.text.inverse,
                    fontWeight: '800',
                    fontSize: 14,
                  }}
                >
                  {publishing ? 'Publishing…' : 'Publish'}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SegmentTab({
  label,
  active,
  onPress,
  disabled,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  if (active) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityState={{ selected: true, disabled }}
        accessibilityLabel={label}
        style={{ flex: 1 }}
      >
        <LinearGradient
          {...gradientProps('heroSunrise')}
          style={{
            paddingVertical: vaasenkNative.spacing.sm,
            borderRadius: vaasenkNative.radius.full,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: disabled ? 0.5 : 1,
          }}
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
      disabled={disabled}
      accessibilityRole="tab"
      accessibilityState={{ selected: false, disabled }}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flex: 1,
        paddingVertical: vaasenkNative.spacing.sm,
        borderRadius: vaasenkNative.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
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

function NotYetExportedState() {
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
        <FileText size={24} color={vaasenkNative.colors.text.deepMaroon} />
      </View>
      <Text
        style={{
          color: vaasenkNative.colors.text.ink,
          fontWeight: '800',
          fontSize: 16,
          textAlign: 'center',
        }}
      >
        Ready to export
      </Text>
      <Text
        style={{
          color: vaasenkNative.colors.text.muted,
          fontSize: 13,
          textAlign: 'center',
          maxWidth: 280,
        }}
      >
        Tap "Export PDF" to render the paper and (if enabled) the answer
        key. You can then preview and publish.
      </Text>
    </View>
  );
}

function PdfFallback({ url }: { url: string }) {
  const openExternal = async () => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(url, { dialogTitle: 'Open PDF' });
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
      <ShieldAlert size={28} color={vaasenkNative.colors.text.deepMaroon} />
      <Text
        style={{
          color: vaasenkNative.colors.text.ink,
          fontWeight: '800',
          fontSize: 16,
          textAlign: 'center',
        }}
      >
        PDF preview needs a dev build
      </Text>
      <Text
        style={{
          color: vaasenkNative.colors.text.muted,
          fontSize: 13,
          textAlign: 'center',
          maxWidth: 280,
        }}
      >
        react-native-pdf is a native module — Expo Go can't host it. Open
        the PDF externally to preview, or run a development build.
      </Text>
      <Pressable
        onPress={openExternal}
        accessibilityRole="button"
        accessibilityLabel="Open PDF externally"
        style={({ pressed }) => ({
          minHeight: 44,
          paddingHorizontal: vaasenkNative.spacing.xl,
          borderRadius: vaasenkNative.radius.full,
          backgroundColor: vaasenkNative.colors.brand.red,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <ExternalLink size={16} color={vaasenkNative.colors.text.inverse} />
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
