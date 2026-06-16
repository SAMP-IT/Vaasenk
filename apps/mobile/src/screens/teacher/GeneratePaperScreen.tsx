/**
 * Vaasenk Mobile — GeneratePaperScreen (Sprint 7.3).
 *
 * Simplified mobile equivalent of the web's 6-step paper wizard. On a
 * phone we condense the form to a single scrollable surface (with a
 * "preset" shortcut to skip configuration), then transition to a polling
 * progress card once generation starts.
 *
 * Flow:
 *   1. Configure  — single screen scroll: presets (3 cards), portions
 *                   (free text), totalMarks, durationMinutes,
 *                   includeAnswerKey toggle.
 *   2. Generating — `PublishProgressCard` (Deep AI Glow tone) with a
 *                   5-milestone ticker. Polls /jobs/:id every 2s.
 *   3. On COMPLETED → navigate to PaperPreview with paper + jobId.
 *
 * Out-of-scope on mobile (kept on web wizard): difficulty mix sliders,
 * question-type builder, sample paper picker. The mobile presets carry
 * sensible defaults; teachers can edit on the web for fine-grained
 * control.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, FileText, Sparkles, Wand2, X } from 'lucide-react-native';
import { getClassroom, type ClassroomDetailView } from '@/services/classrooms';
import {
  GENERATION_MILESTONES,
  generatePaper,
  getPaperJob,
  PAPER_PRESETS,
  sumQuestionTypeMarks,
  type ExamType,
  type GeneratePaperInput,
  type PaperPreset,
  type QuestionPaperJob,
  type QuestionTypeConfig,
} from '@/services/papers';
import { ApiClientError } from '@/services/api';
import { ErrorState } from '@/components/ErrorState';
import { LoadingShimmer } from '@/components/LoadingShimmer';
import { PublishProgressCard } from '@/components/teacher/PublishProgressCard';
import { gradientProps, vaasenkNative } from '@/theme/tokens';
import type { TeacherClassroomsScreenProps } from '@/navigation/types';

type Stage = 'configure' | 'generating' | 'failed';

export function GeneratePaperScreen({
  navigation,
  route,
}: TeacherClassroomsScreenProps<'GeneratePaper'>) {
  const insets = useSafeAreaInsets();
  const { classroomId } = route.params;

  const [classroom, setClassroom] = useState<ClassroomDetailView | null>(null);
  const [classroomLoading, setClassroomLoading] = useState(true);
  const [classroomError, setClassroomError] = useState<string | null>(null);

  const [stage, setStage] = useState<Stage>('configure');
  const [preset, setPreset] = useState<PaperPreset>(PAPER_PRESETS[0]!);
  const [portions, setPortions] = useState('');
  const [wholeSyllabus, setWholeSyllabus] = useState(true);
  const [includeAnswerKey, setIncludeAnswerKey] = useState(true);
  const [examType, setExamType] = useState<ExamType>(preset.examType);
  const [totalMarks, setTotalMarks] = useState(preset.totalMarks);
  const [duration, setDuration] = useState(preset.durationMinutes);
  const [questionTypes, setQuestionTypes] = useState<QuestionTypeConfig[]>(
    preset.questionTypes,
  );

  const [job, setJob] = useState<QuestionPaperJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedulePollRef = useRef<(jobId: string) => void>(() => undefined);

  // ---------- Load classroom ------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setClassroomLoading(true);
      setClassroomError(null);
      try {
        const c = await getClassroom(classroomId);
        if (!cancelled) setClassroom(c);
      } catch (err) {
        if (!cancelled) {
          setClassroomError(
            err instanceof Error ? err.message : 'Could not load classroom.',
          );
        }
      } finally {
        if (!cancelled) setClassroomLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classroomId]);

  useEffect(
    () => () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    },
    [],
  );

  // ---------- Preset apply --------------------------------------------------
  const applyPreset = useCallback((p: PaperPreset) => {
    setPreset(p);
    setExamType(p.examType);
    setTotalMarks(p.totalMarks);
    setDuration(p.durationMinutes);
    setQuestionTypes(p.questionTypes);
  }, []);

  // ---------- Submit --------------------------------------------------------
  const computedMarks = sumQuestionTypeMarks(questionTypes);
  const marksMatch = computedMarks === totalMarks;

  const portionsList = useMemo(() => {
    if (wholeSyllabus) return ['Whole syllabus'];
    return portions
      .split(/[\n,]/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }, [portions, wholeSyllabus]);

  const canSubmit =
    !submitting &&
    !classroomLoading &&
    Boolean(classroom?.syllabus?.id) &&
    portionsList.length > 0 &&
    questionTypes.length > 0 &&
    totalMarks >= 10 &&
    totalMarks <= 500 &&
    marksMatch;

  const submit = useCallback(async () => {
    if (!classroom?.syllabus?.id) {
      setError(
        'Add a syllabus to this classroom before generating a paper. Your admin can do this from the web dashboard.',
      );
      return;
    }
    setSubmitting(true);
    setError(null);

    const payload: GeneratePaperInput = {
      syllabusId: classroom.syllabus.id,
      portions: portionsList,
      examType,
      totalMarks,
      durationMinutes: duration,
      questionTypes,
      includeAnswerKey,
    };

    try {
      const result = await generatePaper(classroomId, payload);
      setJob(result.job);
      setStage('generating');
      // Begin polling via the ref so this closure doesn't capture an
      // older `schedulePoll` definition (avoids exhaustive-deps churn).
      schedulePollRef.current(result.job.id);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not start generation.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }, [
    classroom?.syllabus?.id,
    classroomId,
    portionsList,
    examType,
    totalMarks,
    duration,
    questionTypes,
    includeAnswerKey,
  ]);

  // ---------- Poll ----------------------------------------------------------
  // The poller calls itself recursively until the job terminates. We stash
  // the function in a ref so callers (submit + nested setTimeouts) can hit
  // the latest closure without re-creating a useCallback every render.
  useEffect(() => {
    const schedulePoll = (jobId: string) => {
      pollTimer.current = setTimeout(async () => {
        try {
          const result = await getPaperJob(jobId);
          setJob(result.job);
          if (result.job.status === 'COMPLETED' && result.job.paperId) {
            pollTimer.current = setTimeout(() => {
              navigation.replace('PaperPreview', {
                paperId: result.job.paperId!,
                jobId: result.job.id,
              });
            }, 500);
            return;
          }
          if (result.job.status === 'FAILED') {
            setStage('failed');
            setError(result.job.errorMessage ?? 'Generation failed.');
            return;
          }
          schedulePoll(jobId);
        } catch {
          // Network blip — retry in 3s.
          pollTimer.current = setTimeout(() => schedulePoll(jobId), 3000);
        }
      }, 2000);
    };
    schedulePollRef.current = schedulePoll;
  }, [navigation]);

  // ---------- Render: failed -----------------------------------------------
  if (stage === 'failed') {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: vaasenkNative.colors.surface.warmCanvas,
          paddingTop: insets.top + vaasenkNative.spacing.lg,
          paddingHorizontal: vaasenkNative.spacing.xl,
        }}
      >
        <Header onClose={() => navigation.goBack()} title="Generation failed" />
        <View style={{ marginTop: vaasenkNative.spacing.lg }}>
          <ErrorState
            message={error ?? 'Unknown error.'}
            onRetry={() => {
              setError(null);
              setStage('configure');
            }}
          />
        </View>
      </View>
    );
  }

  // ---------- Render: generating -------------------------------------------
  if (stage === 'generating') {
    const pct = job?.progress?.percentage ?? 5;
    const milestone =
      job?.progress?.step ??
      GENERATION_MILESTONES.find((m) => pct >= m.threshold)?.step ??
      GENERATION_MILESTONES[0].step;
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: vaasenkNative.colors.surface.warmCanvas,
          paddingTop: insets.top + vaasenkNative.spacing.lg,
          paddingHorizontal: vaasenkNative.spacing.xl,
        }}
      >
        <Header onClose={() => navigation.goBack()} title="Generating paper" />
        <View style={{ marginTop: vaasenkNative.spacing.xl }}>
          <PublishProgressCard
            tone="glow"
            title="Vaasenk AI is drafting your paper"
            percent={pct}
            milestone={milestone}
          />
        </View>

        <View
          style={{
            marginTop: vaasenkNative.spacing.xl,
            padding: vaasenkNative.spacing.lg,
            borderRadius: vaasenkNative.radius.lg,
            backgroundColor: vaasenkNative.colors.surface.glassWhite,
            borderWidth: 1,
            borderColor: 'rgba(160,0,0,0.08)',
          }}
        >
          <Text
            style={{
              color: vaasenkNative.colors.text.ink,
              fontWeight: '700',
              fontSize: 14,
              marginBottom: vaasenkNative.spacing.sm,
            }}
          >
            What's happening
          </Text>
          {GENERATION_MILESTONES.map((m) => {
            const done = pct >= m.threshold;
            return (
              <View
                key={m.step}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: vaasenkNative.spacing.sm,
                  paddingVertical: 4,
                }}
              >
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: done
                      ? vaasenkNative.colors.semantic.success
                      : 'rgba(160,0,0,0.18)',
                  }}
                />
                <Text
                  style={{
                    color: done
                      ? vaasenkNative.colors.text.ink
                      : vaasenkNative.colors.text.muted,
                    fontSize: 13,
                  }}
                >
                  {m.step}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  // ---------- Render: configure --------------------------------------------
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
            accessibilityLabel="Close"
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
            <X size={18} color={vaasenkNative.colors.text.inverse} />
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
            Generate paper
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <Text
          style={{
            marginTop: vaasenkNative.spacing.md,
            color: vaasenkNative.colors.text.inverse,
            fontSize: 22,
            fontWeight: '800',
          }}
        >
          {classroom
            ? classroom.subject?.name ?? classroom.name
            : 'Loading…'}
        </Text>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{
          padding: vaasenkNative.spacing.xl,
          paddingBottom: insets.bottom + 140,
          gap: vaasenkNative.spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {classroomError ? (
          <ErrorState
            message={classroomError}
            onRetry={() => navigation.goBack()}
          />
        ) : null}

        {classroomLoading ? (
          <LoadingShimmer height={120} borderRadius={20} />
        ) : null}

        {!classroomLoading && !classroom?.syllabus ? (
          <View
            style={{
              padding: vaasenkNative.spacing.lg,
              borderRadius: vaasenkNative.radius.lg,
              backgroundColor: 'rgba(245,158,11,0.12)',
              borderWidth: 1,
              borderColor: 'rgba(245,158,11,0.32)',
              flexDirection: 'row',
              gap: vaasenkNative.spacing.md,
            }}
          >
            <Sparkles size={20} color={vaasenkNative.colors.semantic.warning} />
            <Text
              style={{
                flex: 1,
                color: vaasenkNative.colors.text.deepMaroon,
                fontSize: 13,
                lineHeight: 18,
              }}
            >
              This classroom has no syllabus assigned. Ask your administrator
              to upload a syllabus before generating a paper.
            </Text>
          </View>
        ) : null}

        {/* Presets */}
        <SectionLabel
          label="Start with a preset"
          hint="Tap to apply, then tweak below."
        />
        <View style={{ gap: vaasenkNative.spacing.sm }}>
          {PAPER_PRESETS.map((p) => (
            <PresetCard
              key={p.id}
              preset={p}
              active={preset.id === p.id}
              onPress={() => applyPreset(p)}
            />
          ))}
        </View>

        {/* Portions */}
        <SectionLabel
          label="Portions"
          hint="Use 'Whole syllabus' or list chapter/topic names, one per line."
        />
        <View
          style={{
            padding: vaasenkNative.spacing.md,
            borderRadius: vaasenkNative.radius.lg,
            backgroundColor: vaasenkNative.colors.surface.glassWhite,
            borderWidth: 1,
            borderColor: 'rgba(160,0,0,0.1)',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                color: vaasenkNative.colors.text.ink,
                fontWeight: '700',
                fontSize: 14,
              }}
            >
              Whole syllabus
            </Text>
            <Switch
              value={wholeSyllabus}
              onValueChange={setWholeSyllabus}
              trackColor={{
                false: 'rgba(160,0,0,0.18)',
                true: vaasenkNative.colors.brand.red,
              }}
              thumbColor={vaasenkNative.colors.text.inverse}
            />
          </View>
          {!wholeSyllabus ? (
            <TextInput
              value={portions}
              onChangeText={setPortions}
              placeholder={`e.g.\nQuadratic Equations\nTrigonometry\nCircles`}
              placeholderTextColor={vaasenkNative.colors.text.subtle}
              multiline
              style={{
                marginTop: vaasenkNative.spacing.sm,
                minHeight: 100,
                color: vaasenkNative.colors.text.ink,
                fontSize: 14,
                lineHeight: 20,
                textAlignVertical: 'top',
                ...(Platform.OS === 'web'
                  ? ({ outlineStyle: 'none' } as object)
                  : {}),
              }}
            />
          ) : null}
        </View>

        {/* Marks + Duration */}
        <SectionLabel label="Marks and duration" />
        <View
          style={{
            flexDirection: 'row',
            gap: vaasenkNative.spacing.md,
          }}
        >
          <NumberField
            label="Total marks"
            value={totalMarks}
            onChange={(n) => setTotalMarks(clampNumber(n, 10, 500))}
          />
          <NumberField
            label="Minutes"
            value={duration}
            onChange={(n) => setDuration(clampNumber(n, 15, 360))}
          />
        </View>
        {!marksMatch ? (
          <Text
            style={{
              color: vaasenkNative.colors.semantic.danger,
              fontSize: 12,
              fontWeight: '600',
            }}
          >
            Question marks total {computedMarks}, but the paper is {totalMarks}{' '}
            marks. Pick a different preset or edit on the web for fine-grained
            control.
          </Text>
        ) : null}

        {/* Answer key */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: vaasenkNative.spacing.md,
            borderRadius: vaasenkNative.radius.lg,
            backgroundColor: vaasenkNative.colors.surface.glassWhite,
            borderWidth: 1,
            borderColor: 'rgba(160,0,0,0.1)',
          }}
        >
          <View style={{ flex: 1, paddingRight: vaasenkNative.spacing.md }}>
            <Text
              style={{
                color: vaasenkNative.colors.text.ink,
                fontWeight: '700',
                fontSize: 14,
              }}
            >
              Include answer key
            </Text>
            <Text
              style={{
                marginTop: 2,
                color: vaasenkNative.colors.text.muted,
                fontSize: 12,
              }}
            >
              Vaasenk AI generates a separate answer-key PDF.
            </Text>
          </View>
          <Switch
            value={includeAnswerKey}
            onValueChange={setIncludeAnswerKey}
            trackColor={{
              false: 'rgba(160,0,0,0.18)',
              true: vaasenkNative.colors.brand.red,
            }}
            thumbColor={vaasenkNative.colors.text.inverse}
          />
        </View>

        {error ? (
          <View>
            <ErrorState message={error} onRetry={() => setError(null)} />
          </View>
        ) : null}
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingTop: vaasenkNative.spacing.md,
          paddingBottom: insets.bottom + vaasenkNative.spacing.md,
          paddingHorizontal: vaasenkNative.spacing.xl,
          borderTopWidth: 1,
          borderTopColor: 'rgba(160,0,0,0.12)',
          backgroundColor: vaasenkNative.colors.surface.glassWhite,
        }}
      >
        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel="Generate paper"
          accessibilityState={{ disabled: !canSubmit }}
          style={({ pressed }) => ({
            opacity: canSubmit ? (pressed ? 0.9 : 1) : 0.5,
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
                gap: vaasenkNative.spacing.sm,
              },
              vaasenkNative.shadows.glowRed,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={vaasenkNative.colors.text.inverse} />
            ) : (
              <Wand2 size={18} color={vaasenkNative.colors.text.inverse} />
            )}
            <Text
              style={{
                color: vaasenkNative.colors.text.inverse,
                fontWeight: '800',
                fontSize: 15,
              }}
            >
              {submitting ? 'Starting…' : 'Generate paper'}
            </Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Header({
  onClose,
  title,
}: {
  onClose: () => void;
  title: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        style={({ pressed }) => ({
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: vaasenkNative.colors.surface.glassWhite,
          borderWidth: 1,
          borderColor: 'rgba(160,0,0,0.12)',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <ArrowLeft size={18} color={vaasenkNative.colors.text.deepMaroon} />
      </Pressable>
      <Text
        style={{
          color: vaasenkNative.colors.text.ink,
          fontWeight: '800',
          fontSize: 16,
        }}
      >
        {title}
      </Text>
      <View style={{ width: 40 }} />
    </View>
  );
}

function SectionLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <View>
      <Text
        style={{
          color: vaasenkNative.colors.text.deepMaroon,
          fontWeight: '800',
          fontSize: 14,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
      {hint ? (
        <Text
          style={{
            marginTop: 2,
            color: vaasenkNative.colors.text.muted,
            fontSize: 12,
          }}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function PresetCard({
  preset,
  active,
  onPress,
}: {
  preset: PaperPreset;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      accessibilityLabel={preset.label}
      style={({ pressed }) => ({
        padding: vaasenkNative.spacing.md,
        borderRadius: vaasenkNative.radius.lg,
        borderWidth: 2,
        borderColor: active
          ? vaasenkNative.colors.brand.red
          : 'rgba(160,0,0,0.1)',
        backgroundColor: active
          ? 'rgba(160,0,0,0.06)'
          : vaasenkNative.colors.surface.glassWhite,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: vaasenkNative.spacing.sm,
        }}
      >
        <FileText
          size={18}
          color={
            active
              ? vaasenkNative.colors.brand.red
              : vaasenkNative.colors.text.muted
          }
        />
        <Text
          style={{
            color: vaasenkNative.colors.text.ink,
            fontWeight: '800',
            fontSize: 15,
          }}
        >
          {preset.label}
        </Text>
      </View>
      <Text
        style={{
          marginTop: 4,
          color: vaasenkNative.colors.text.muted,
          fontSize: 12,
        }}
      >
        {preset.description}
      </Text>
    </Pressable>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);
  return (
    <View style={{ flex: 1, gap: vaasenkNative.spacing.xs }}>
      <Text
        style={{
          color: vaasenkNative.colors.text.deepMaroon,
          fontSize: 12,
          fontWeight: '700',
        }}
      >
        {label}
      </Text>
      <View
        style={{
          minHeight: vaasenkNative.components.input.minHeight,
          paddingHorizontal: vaasenkNative.components.input.paddingHorizontal,
          borderRadius: vaasenkNative.components.input.borderRadius,
          borderWidth: vaasenkNative.components.input.borderWidth,
          borderColor: vaasenkNative.components.input.borderColor,
          backgroundColor: vaasenkNative.components.input.backgroundColor,
          justifyContent: 'center',
        }}
      >
        <TextInput
          value={text}
          onChangeText={(t) => {
            setText(t);
            const n = parseInt(t, 10);
            if (Number.isFinite(n)) onChange(n);
          }}
          keyboardType="number-pad"
          style={{
            color: vaasenkNative.colors.text.ink,
            fontSize: 16,
            fontWeight: '700',
            ...(Platform.OS === 'web'
              ? ({ outlineStyle: 'none' } as object)
              : {}),
          }}
        />
      </View>
    </View>
  );
}

function clampNumber(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}
