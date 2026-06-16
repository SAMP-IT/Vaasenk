/**
 * Vaasenk Mobile — QuickUploadScreen (Sprint 7.3 — Playbook Prompt 26 headline).
 *
 * Photograph board → publish in <60 seconds. Tap budget:
 *   1. Open Upload tab               (FAB)
 *   2. Tap shutter                   (capture)
 *   3. Tap Continue                  (preview → metadata)
 *   4. Tap Publish                   (publish)
 *   = 4 taps with sensible defaults (title auto-suggested, last-used
 *     classroom + tags cached in SecureStore).
 *
 * Stages:
 *   1. CAMERA       — fullscreen <CameraView> with shutter, library button,
 *                     close, flash toggle.
 *   2. PREVIEW      — captured image preview. Buttons: Retake, Rotate,
 *                     Continue. Auto-compresses on Continue (downscale >1920
 *                     OR >2MB, JPEG q=0.85).
 *   3. METADATA     — Title (auto-suggest), Tags (multi-select chips),
 *                     Classroom (last-used cached), Schedule (optional).
 *   4. PUBLISH      — XHR upload with progress + cancel; on success route
 *                     back to TeacherHome with a snackbar.
 *
 * Async upload happens on the publish stage; image is cached in
 * FileSystem.cacheDirectory so a failed upload doesn't make the teacher
 * re-shoot.
 *
 * 5 states (CLAUDE.md §5) handled per stage.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CameraView,
  useCameraPermissions,
  type CameraType,
  type FlashMode,
} from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import { Image } from 'expo-image';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Image as ImageIconLucide,
  RotateCcw,
  ShieldAlert,
  X,
  Zap,
  ZapOff,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  listTeacherClassrooms,
  readClassroomsCache,
  type ClassroomView,
} from '@/services/classrooms';
import {
  NOTE_TAGS,
  TAG_LABELS,
  type NoteTag,
  type NoteView,
  uploadNote,
} from '@/services/notes';
import { ApiClientError } from '@/services/api';
import { ErrorState } from '@/components/ErrorState';
import { PublishProgressCard } from '@/components/teacher/PublishProgressCard';
import { ClassroomPickerSheet } from './ClassroomPickerSheet';
import { gradientProps, vaasenkNative } from '@/theme/tokens';
import type { TeacherUploadScreenProps } from '@/navigation/types';

const PREFS_KEY = 'vaasenk:teacher:upload:prefs:v1';
const MAX_LONG_EDGE = 1920;
const COMPRESS_QUALITY = 0.85;
const COMPRESS_TRIGGER_BYTES = 2 * 1024 * 1024; // 2MB

type Stage = 'camera' | 'preview' | 'metadata' | 'publishing' | 'success';

type CapturedImage = {
  uri: string;
  width: number;
  height: number;
  sizeBytes: number | null;
};

type UploadPrefs = {
  lastClassroomId?: string;
  lastTags?: NoteTag[];
};

export function QuickUploadScreen({
  navigation,
  route,
}: TeacherUploadScreenProps<'QuickUpload'>) {
  const insets = useSafeAreaInsets();
  const initialClassroomId = route.params?.classroomId ?? null;

  // ---------- State ---------------------------------------------------------
  const [stage, setStage] = useState<Stage>('camera');
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [shutterBusy, setShutterBusy] = useState(false);
  const [captured, setCaptured] = useState<CapturedImage | null>(null);
  const [processing, setProcessing] = useState(false);
  const [title, setTitle] = useState(defaultTitleFor(new Date()));
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<NoteTag[]>([]);
  const [classroomId, setClassroomId] = useState<string | null>(
    initialClassroomId,
  );
  const [classrooms, setClassrooms] = useState<ClassroomView[]>(
    readClassroomsCache() ?? [],
  );
  const [classroomsLoading, setClassroomsLoading] = useState(
    !readClassroomsCache(),
  );
  const [picker, setPicker] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [publishedNote, setPublishedNote] = useState<NoteView | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  // ---------- Load classrooms + saved prefs --------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Prefs
        const raw = await SecureStore.getItemAsync(PREFS_KEY);
        if (!cancelled && raw) {
          try {
            const parsed = JSON.parse(raw) as UploadPrefs;
            if (!initialClassroomId && parsed.lastClassroomId) {
              setClassroomId(parsed.lastClassroomId);
            }
            if (parsed.lastTags && parsed.lastTags.length > 0) {
              setTags(parsed.lastTags);
            }
          } catch {
            // Corrupt prefs — silently ignore.
          }
        }
        // Classrooms
        const result = await listTeacherClassrooms();
        if (!cancelled) {
          setClassrooms(result.data);
          setClassroomsLoading(false);
        }
      } catch {
        if (!cancelled) setClassroomsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialClassroomId]);

  // Reset state when navigating into the screen fresh.
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      // Soft reset only if we've left it in a terminal stage.
      setStage((s) => {
        if (s === 'success') return 'camera';
        return s;
      });
    });
    return unsub;
  }, [navigation]);

  // Cancel any in-flight upload when leaving the screen.
  useEffect(
    () => () => {
      if (xhrRef.current) xhrRef.current.abort();
    },
    [],
  );

  // ---------- Helpers -------------------------------------------------------
  const selectedClassroom = useMemo(
    () => classrooms.find((c) => c.id === classroomId) ?? null,
    [classrooms, classroomId],
  );

  const handleClose = () => {
    if (stage === 'publishing') {
      Alert.alert('Cancel upload?', 'Your photo will be discarded.', [
        { text: 'Keep uploading', style: 'cancel' },
        {
          text: 'Cancel',
          style: 'destructive',
          onPress: () => {
            xhrRef.current?.abort();
            navigation.goBack();
          },
        },
      ]);
      return;
    }
    navigation.goBack();
  };

  const persistPrefs = useCallback(
    async (next: UploadPrefs) => {
      try {
        const current: UploadPrefs = JSON.parse(
          (await SecureStore.getItemAsync(PREFS_KEY)) ?? '{}',
        );
        await SecureStore.setItemAsync(
          PREFS_KEY,
          JSON.stringify({ ...current, ...next }),
        );
      } catch {
        // Best-effort; never block the upload on prefs persistence.
      }
    },
    [],
  );

  // ---------- Stage 1: CAMERA ----------------------------------------------
  const takePhoto = useCallback(async () => {
    if (!cameraRef.current || shutterBusy) return;
    setShutterBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.95,
        skipProcessing: false,
        exif: false,
      });
      if (!photo?.uri) {
        setShutterBusy(false);
        return;
      }
      const info = await safeFileInfo(photo.uri);
      setCaptured({
        uri: photo.uri,
        width: photo.width ?? 0,
        height: photo.height ?? 0,
        sizeBytes: info,
      });
      setStage('preview');
    } catch (err) {
      Alert.alert(
        'Camera error',
        err instanceof Error ? err.message : 'Could not capture photo.',
      );
    } finally {
      setShutterBusy(false);
    }
  }, [shutterBusy]);

  const pickFromGallery = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.95,
      exif: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const info = await safeFileInfo(asset.uri);
    setCaptured({
      uri: asset.uri,
      width: asset.width ?? 0,
      height: asset.height ?? 0,
      sizeBytes: info,
    });
    setStage('preview');
  }, []);

  // ---------- Stage 2: PREVIEW ---------------------------------------------
  const rotate = useCallback(async () => {
    if (!captured) return;
    try {
      const next = await ImageManipulator.manipulateAsync(
        captured.uri,
        [{ rotate: 90 }],
        { compress: COMPRESS_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
      );
      const info = await safeFileInfo(next.uri);
      setCaptured({
        uri: next.uri,
        width: next.width,
        height: next.height,
        sizeBytes: info,
      });
    } catch {
      // Non-fatal: keep current image.
    }
  }, [captured]);

  const goToMetadata = useCallback(async () => {
    if (!captured) return;
    setProcessing(true);
    try {
      const longEdge = Math.max(captured.width, captured.height);
      const oversized =
        longEdge > MAX_LONG_EDGE ||
        (captured.sizeBytes != null && captured.sizeBytes > COMPRESS_TRIGGER_BYTES);
      if (oversized) {
        // Compute the scale factor: keep aspect ratio, resize the longest edge.
        const ratio = MAX_LONG_EDGE / longEdge;
        const targetWidth = Math.round(captured.width * Math.min(1, ratio));
        const next = await ImageManipulator.manipulateAsync(
          captured.uri,
          [{ resize: { width: targetWidth } }],
          { compress: COMPRESS_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
        );
        const info = await safeFileInfo(next.uri);
        setCaptured({
          uri: next.uri,
          width: next.width,
          height: next.height,
          sizeBytes: info,
        });
      }
      // Auto-suggest title from today's date if user hasn't typed.
      if (!title.trim()) setTitle(defaultTitleFor(new Date()));
      setStage('metadata');
    } catch {
      // Compression failed — proceed without it.
      setStage('metadata');
    } finally {
      setProcessing(false);
    }
  }, [captured, title]);

  const retake = () => {
    setCaptured(null);
    setStage('camera');
  };

  // ---------- Stage 3: METADATA --------------------------------------------
  const toggleTag = (tag: NoteTag) => {
    setTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (prev.length >= 6) return prev;
      return [...prev, tag];
    });
  };

  const canPublish = useMemo(() => {
    if (!captured) return false;
    if (!classroomId) return false;
    if (title.trim().length < 2) return false;
    return true;
  }, [captured, classroomId, title]);

  const publish = useCallback(async () => {
    if (!captured || !classroomId) return;
    setStage('publishing');
    setUploadError(null);
    setUploadPct(0);

    const fileName = `note-${Date.now()}.jpg`;
    try {
      const note = await uploadNote(
        {
          classroomId,
          file: { uri: captured.uri, name: fileName, type: 'image/jpeg' },
          title: title.trim(),
          description: description.trim() || undefined,
          tags,
          status: 'PUBLISHED',
        },
        {
          onProgress: setUploadPct,
          xhrRef,
        },
      );
      setPublishedNote(note);
      setStage('success');
      // Persist the choices the teacher just made so the next upload is faster.
      await persistPrefs({ lastClassroomId: classroomId, lastTags: tags });
      // Clean up the cached image file — best effort, ignore errors.
      try {
        await FileSystem.deleteAsync(captured.uri, { idempotent: true });
      } catch {
        // ignore
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Aborted — go back to metadata so the teacher can retry without
        // re-shooting.
        setStage('metadata');
        setUploadPct(0);
        return;
      }
      const message =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Upload failed.';
      setUploadError(message);
      setStage('metadata');
    }
  }, [
    captured,
    classroomId,
    title,
    description,
    tags,
    persistPrefs,
  ]);

  const goHome = () => {
    // Jump back to TeacherHome so the recent uploads section refreshes.
    navigation.navigate('TeacherHome', { screen: 'HomeRoot' });
  };

  // ---------- Permissions screen -------------------------------------------
  if (!permission) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: vaasenkNative.colors.surface.warmCanvas,
        }}
      >
        <Text style={{ color: vaasenkNative.colors.text.muted }}>
          Checking camera permission…
        </Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: vaasenkNative.colors.surface.warmCanvas,
          paddingTop: insets.top + vaasenkNative.spacing['2xl'],
          paddingHorizontal: vaasenkNative.spacing.xl,
          paddingBottom: insets.bottom + vaasenkNative.spacing['2xl'],
        }}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: vaasenkNative.colors.surface.glassWhite,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: 'rgba(160,0,0,0.12)',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <X size={18} color={vaasenkNative.colors.text.muted} />
        </Pressable>

        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            gap: vaasenkNative.spacing.lg,
          }}
        >
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: 'rgba(254,202,2,0.22)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShieldAlert
              size={28}
              color={vaasenkNative.colors.text.deepMaroon}
            />
          </View>
          <Text
            style={{
              color: vaasenkNative.colors.text.ink,
              fontSize: 22,
              fontWeight: '800',
              textAlign: 'center',
            }}
          >
            Camera access needed
          </Text>
          <Text
            style={{
              color: vaasenkNative.colors.text.muted,
              fontSize: 14,
              textAlign: 'center',
              lineHeight: 20,
              maxWidth: 300,
            }}
          >
            Vaasenk uses your camera to photograph board notes. Grant
            access to publish your first note in under a minute.
          </Text>
          <Pressable
            onPress={() => {
              void requestPermission();
            }}
            accessibilityRole="button"
            accessibilityLabel="Grant camera access"
            style={({ pressed }) => ({
              opacity: pressed ? 0.9 : 1,
              marginTop: vaasenkNative.spacing.md,
            })}
          >
            <LinearGradient
              {...gradientProps('heroSunrise')}
              style={[
                {
                  paddingHorizontal: vaasenkNative.spacing['3xl'],
                  minHeight: vaasenkNative.components.button.minHeight,
                  borderRadius: vaasenkNative.components.button.borderRadius,
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
                  fontSize: 15,
                }}
              >
                Grant camera access
              </Text>
            </LinearGradient>
          </Pressable>
          <Pressable
            onPress={pickFromGallery}
            accessibilityRole="button"
            accessibilityLabel="Pick from gallery instead"
            style={({ pressed }) => ({
              minHeight: 44,
              paddingHorizontal: vaasenkNative.spacing.lg,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              style={{
                color: vaasenkNative.colors.text.deepMaroon,
                fontWeight: '700',
                fontSize: 14,
              }}
            >
              Or pick from gallery
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ---------- Stage 1: CAMERA ----------------------------------------------
  if (stage === 'camera') {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#000',
        }}
      >
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFillObject}
          facing={facing}
          flash={flash}
          onCameraReady={() => setCameraReady(true)}
        />

        {/* Top bar */}
        <View
          style={{
            position: 'absolute',
            top: insets.top + vaasenkNative.spacing.sm,
            left: vaasenkNative.spacing.xl,
            right: vaasenkNative.spacing.xl,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 2,
          }}
        >
          <CameraIconButton
            label="Close"
            onPress={handleClose}
            icon={<X size={20} color="#fff" />}
          />
          <CameraIconButton
            label={flash === 'off' ? 'Enable flash' : 'Disable flash'}
            onPress={() => setFlash((f) => (f === 'off' ? 'on' : 'off'))}
            icon={
              flash === 'off' ? (
                <ZapOff size={20} color="#fff" />
              ) : (
                <Zap
                  size={20}
                  color={vaasenkNative.colors.brand.gold}
                  fill={vaasenkNative.colors.brand.gold}
                />
              )
            }
          />
        </View>

        {/* Bottom bar */}
        <View
          style={{
            position: 'absolute',
            bottom: insets.bottom + vaasenkNative.spacing.xl,
            left: 0,
            right: 0,
            flexDirection: 'row',
            justifyContent: 'space-around',
            alignItems: 'center',
            zIndex: 2,
            paddingHorizontal: vaasenkNative.spacing.xl,
          }}
        >
          <CameraIconButton
            label="Pick from gallery"
            onPress={pickFromGallery}
            icon={<ImageIconLucide size={22} color="#fff" />}
          />

          {/* Shutter */}
          <Pressable
            onPress={takePhoto}
            disabled={!cameraReady || shutterBusy}
            accessibilityRole="button"
            accessibilityLabel="Capture photo"
            style={({ pressed }) => ({
              width: 84,
              height: 84,
              borderRadius: 42,
              backgroundColor: 'rgba(255,255,255,0.16)',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: shutterBusy ? 0.6 : pressed ? 0.85 : 1,
              borderWidth: 3,
              borderColor: '#fff',
            })}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: '#fff',
              }}
            />
          </Pressable>

          <CameraIconButton
            label="Flip camera"
            onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
            icon={<RotateCcw size={22} color="#fff" />}
          />
        </View>
      </View>
    );
  }

  // ---------- Stage 2: PREVIEW ---------------------------------------------
  if (stage === 'preview' && captured) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#000',
        }}
      >
        <Image
          source={{ uri: captured.uri }}
          style={StyleSheet.absoluteFillObject}
          contentFit="contain"
          transition={150}
        />

        {/* Top bar */}
        <View
          style={{
            position: 'absolute',
            top: insets.top + vaasenkNative.spacing.sm,
            left: vaasenkNative.spacing.xl,
            right: vaasenkNative.spacing.xl,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 2,
          }}
        >
          <CameraIconButton
            label="Retake"
            onPress={retake}
            icon={<X size={20} color="#fff" />}
          />
          <CameraIconButton
            label="Rotate"
            onPress={rotate}
            icon={<RotateCcw size={20} color="#fff" />}
          />
        </View>

        {/* Bottom action bar */}
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            paddingTop: vaasenkNative.spacing.xl,
            paddingBottom: insets.bottom + vaasenkNative.spacing.xl,
            paddingHorizontal: vaasenkNative.spacing.xl,
            backgroundColor: 'rgba(0,0,0,0.55)',
            flexDirection: 'row',
            gap: vaasenkNative.spacing.md,
          }}
        >
          <Pressable
            onPress={retake}
            accessibilityRole="button"
            accessibilityLabel="Retake photo"
            style={({ pressed }) => ({
              flex: 1,
              minHeight: vaasenkNative.components.button.minHeight,
              borderRadius: vaasenkNative.components.button.borderRadius,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.5)',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
              Retake
            </Text>
          </Pressable>
          <Pressable
            onPress={goToMetadata}
            disabled={processing}
            accessibilityRole="button"
            accessibilityLabel="Continue to details"
            style={({ pressed }) => ({
              flex: 2,
              opacity: processing ? 0.7 : pressed ? 0.9 : 1,
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
                },
                vaasenkNative.shadows.glowRed,
              ]}
            >
              <Text
                style={{
                  color: vaasenkNative.colors.text.inverse,
                  fontWeight: '800',
                  fontSize: 15,
                }}
              >
                {processing ? 'Optimising…' : 'Continue'}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  // ---------- Stage 3: METADATA + Stage 4: PUBLISHING ----------------------
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
          paddingTop: insets.top + vaasenkNative.spacing.lg,
          paddingBottom: vaasenkNative.spacing.xl,
          paddingHorizontal: vaasenkNative.spacing.xl,
          borderBottomLeftRadius: vaasenkNative.radius['2xl'],
          borderBottomRightRadius: vaasenkNative.radius['2xl'],
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Pressable
            onPress={handleClose}
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
              fontSize: 13,
              fontWeight: '700',
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            {stage === 'publishing'
              ? 'Publishing'
              : stage === 'success'
                ? 'Published'
                : 'Almost there'}
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <Text
          style={{
            marginTop: vaasenkNative.spacing.md,
            color: vaasenkNative.colors.text.inverse,
            fontSize: 24,
            fontWeight: '800',
          }}
        >
          {stage === 'success' ? 'Note published' : 'Add a few details'}
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
        {/* Captured image thumbnail */}
        {captured ? (
          <View
            style={[
              {
                borderRadius: vaasenkNative.radius.lg,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: 'rgba(160,0,0,0.08)',
                backgroundColor: vaasenkNative.colors.surface.glassWhite,
              },
              vaasenkNative.shadows.cardSoft,
            ]}
          >
            <Image
              source={{ uri: captured.uri }}
              style={{ width: '100%', height: 200 }}
              contentFit="cover"
              transition={150}
            />
            <View
              style={{
                padding: vaasenkNative.spacing.md,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color: vaasenkNative.colors.text.muted,
                  fontSize: 12,
                  fontWeight: '600',
                }}
              >
                {captured.width} × {captured.height}
                {captured.sizeBytes != null
                  ? ` · ${formatBytes(captured.sizeBytes)}`
                  : ''}
              </Text>
              {stage === 'metadata' ? (
                <Pressable
                  onPress={retake}
                  accessibilityRole="button"
                  accessibilityLabel="Retake photo"
                  hitSlop={6}
                  style={({ pressed }) => ({
                    paddingHorizontal: vaasenkNative.spacing.md,
                    paddingVertical: vaasenkNative.spacing.xs,
                    borderRadius: vaasenkNative.radius.full,
                    borderWidth: 1,
                    borderColor: 'rgba(160,0,0,0.16)',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text
                    style={{
                      color: vaasenkNative.colors.text.deepMaroon,
                      fontSize: 12,
                      fontWeight: '700',
                    }}
                  >
                    Retake
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Success state */}
        {stage === 'success' ? (
          <View
            style={[
              {
                padding: vaasenkNative.spacing.xl,
                borderRadius: vaasenkNative.radius.xl,
                backgroundColor: 'rgba(23,167,91,0.12)',
                borderWidth: 1,
                borderColor: 'rgba(23,167,91,0.32)',
                gap: vaasenkNative.spacing.md,
                alignItems: 'center',
              },
            ]}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: vaasenkNative.colors.semantic.success,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Check size={28} color={vaasenkNative.colors.text.inverse} />
            </View>
            <Text
              style={{
                color: vaasenkNative.colors.text.ink,
                fontWeight: '800',
                fontSize: 18,
                textAlign: 'center',
              }}
            >
              Published to {selectedClassroom?.name ?? 'the classroom'}
            </Text>
            <Text
              style={{
                color: vaasenkNative.colors.text.muted,
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              {publishedNote?.title ?? title}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                gap: vaasenkNative.spacing.md,
                marginTop: vaasenkNative.spacing.sm,
              }}
            >
              <Pressable
                onPress={goHome}
                accessibilityRole="button"
                accessibilityLabel="Done"
                style={({ pressed }) => ({
                  paddingHorizontal: vaasenkNative.spacing['2xl'],
                  minHeight: vaasenkNative.components.button.minHeight,
                  borderRadius: vaasenkNative.components.button.borderRadius,
                  borderWidth: 1,
                  borderColor: 'rgba(160,0,0,0.24)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text
                  style={{
                    color: vaasenkNative.colors.text.deepMaroon,
                    fontWeight: '700',
                    fontSize: 14,
                  }}
                >
                  Done
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setCaptured(null);
                  setStage('camera');
                  setPublishedNote(null);
                  setUploadPct(0);
                }}
                accessibilityRole="button"
                accessibilityLabel="Upload another"
                style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
              >
                <LinearGradient
                  {...gradientProps('heroSunrise')}
                  style={[
                    {
                      paddingHorizontal: vaasenkNative.spacing['2xl'],
                      minHeight: vaasenkNative.components.button.minHeight,
                      borderRadius: vaasenkNative.components.button.borderRadius,
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
                      fontSize: 14,
                    }}
                  >
                    Upload another
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Publishing progress */}
        {stage === 'publishing' ? (
          <PublishProgressCard
            title="Publishing to classroom…"
            percent={uploadPct}
            milestone="Uploading photo · students notified on publish"
          />
        ) : null}

        {/* Metadata form */}
        {stage === 'metadata' ? (
          <>
            {uploadError ? (
              <ErrorState
                message={uploadError}
                onRetry={() => {
                  setUploadError(null);
                  void publish();
                }}
              />
            ) : null}

            <FormSection label="Title" required>
              <FormInput
                value={title}
                onChange={setTitle}
                placeholder="Trigonometry — Class 10 Board Notes"
                maxLength={200}
              />
              {title.trim().length > 0 && title.trim().length < 2 ? (
                <ValidationHint message="Title needs at least 2 characters." />
              ) : null}
            </FormSection>

            <FormSection label="Tags" hint="Pick up to 6 — helps students find this faster.">
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: vaasenkNative.spacing.sm,
                }}
              >
                {NOTE_TAGS.map((tag) => {
                  const active = tags.includes(tag);
                  return (
                    <TagChip
                      key={tag}
                      active={active}
                      label={TAG_LABELS[tag]}
                      onPress={() => toggleTag(tag)}
                    />
                  );
                })}
              </View>
            </FormSection>

            <FormSection label="Classroom" required>
              <Pressable
                onPress={() => setPicker(true)}
                accessibilityRole="button"
                accessibilityLabel="Choose classroom"
                style={({ pressed }) => ({
                  minHeight: vaasenkNative.components.input.minHeight,
                  paddingHorizontal: vaasenkNative.components.input.paddingHorizontal,
                  borderRadius: vaasenkNative.components.input.borderRadius,
                  borderWidth: vaasenkNative.components.input.borderWidth,
                  borderColor: vaasenkNative.components.input.borderColor,
                  backgroundColor: vaasenkNative.components.input.backgroundColor,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text
                  style={{
                    flex: 1,
                    color: selectedClassroom
                      ? vaasenkNative.colors.text.ink
                      : vaasenkNative.colors.text.subtle,
                    fontSize: 15,
                    fontWeight: selectedClassroom ? '700' : '500',
                  }}
                  numberOfLines={1}
                >
                  {selectedClassroom?.name ??
                    selectedClassroom?.subject?.name ??
                    (classroomsLoading
                      ? 'Loading classrooms…'
                      : 'Choose a classroom')}
                </Text>
                <ChevronDown
                  size={18}
                  color={vaasenkNative.colors.text.muted}
                />
              </Pressable>
            </FormSection>

            <FormSection label="Description (optional)">
              <FormInput
                value={description}
                onChange={setDescription}
                placeholder="Any extra context for students…"
                maxLength={2000}
                multiline
              />
            </FormSection>
          </>
        ) : null}
      </ScrollView>

      {/* Bottom publish bar */}
      {stage === 'metadata' || stage === 'publishing' ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingTop: vaasenkNative.spacing.md,
            paddingBottom: insets.bottom + vaasenkNative.spacing.md,
            paddingHorizontal: vaasenkNative.spacing.xl,
            backgroundColor: vaasenkNative.colors.surface.glassWhite,
            borderTopWidth: 1,
            borderTopColor: 'rgba(160,0,0,0.12)',
          }}
        >
          <Pressable
            onPress={publish}
            disabled={stage === 'publishing' || !canPublish}
            accessibilityRole="button"
            accessibilityLabel={
              stage === 'publishing'
                ? 'Publishing'
                : `Publish to ${selectedClassroom?.name ?? 'classroom'}`
            }
            style={({ pressed }) => ({
              opacity:
                stage === 'publishing' || !canPublish
                  ? 0.5
                  : pressed
                    ? 0.9
                    : 1,
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
              {stage === 'publishing' ? (
                <Text
                  style={{
                    color: vaasenkNative.colors.text.inverse,
                    fontWeight: '800',
                    fontSize: 15,
                  }}
                >
                  Publishing… {uploadPct}%
                </Text>
              ) : (
                <>
                  <CheckCircle2
                    size={18}
                    color={vaasenkNative.colors.text.inverse}
                  />
                  <Text
                    style={{
                      color: vaasenkNative.colors.text.inverse,
                      fontWeight: '800',
                      fontSize: 15,
                    }}
                  >
                    Publish{selectedClassroom?.name ? ` to ${selectedClassroom.name}` : ''}
                  </Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      ) : null}

      <ClassroomPickerSheet
        open={picker}
        title="Publish to which classroom?"
        classrooms={classrooms}
        onPick={(id) => {
          setClassroomId(id);
          setPicker(false);
        }}
        onClose={() => setPicker(false)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sub-components + utilities
// ---------------------------------------------------------------------------

function CameraIconButton({
  label,
  onPress,
  icon,
}: {
  label: string;
  onPress: () => void;
  icon: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {icon}
    </Pressable>
  );
}

function FormSection({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: vaasenkNative.spacing.xs }}>
      <Text
        style={{
          color: vaasenkNative.colors.text.deepMaroon,
          fontSize: 13,
          fontWeight: '700',
        }}
      >
        {label}
        {required ? (
          <Text style={{ color: vaasenkNative.colors.brand.red }}> *</Text>
        ) : null}
      </Text>
      {children}
      {hint ? (
        <Text
          style={{
            color: vaasenkNative.colors.text.subtle,
            fontSize: 12,
          }}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function FormInput({
  value,
  onChange,
  placeholder,
  maxLength,
  multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
}) {
  return (
    <View
      style={{
        minHeight: multiline ? 100 : vaasenkNative.components.input.minHeight,
        paddingHorizontal: vaasenkNative.components.input.paddingHorizontal,
        paddingVertical: vaasenkNative.spacing.sm,
        borderRadius: vaasenkNative.components.input.borderRadius,
        borderWidth: vaasenkNative.components.input.borderWidth,
        borderColor: vaasenkNative.components.input.borderColor,
        backgroundColor: vaasenkNative.components.input.backgroundColor,
      }}
    >
      <TextInputBridge
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        maxLength={maxLength}
        multiline={multiline}
      />
    </View>
  );
}

// Small TextInput wrapper to keep the imports tidy and let us
// centralise placeholder color.
function TextInputBridge({
  value,
  onChange,
  placeholder,
  maxLength,
  multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
}) {
  const { TextInput } = require('react-native') as typeof import('react-native');
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      maxLength={maxLength}
      multiline={multiline}
      placeholderTextColor={vaasenkNative.colors.text.subtle}
      style={{
        flex: 1,
        minHeight: multiline ? 80 : 24,
        textAlignVertical: multiline ? 'top' : 'center',
        color: vaasenkNative.colors.text.ink,
        fontSize: 15,
        ...(Platform.OS === 'web'
          ? ({ outlineStyle: 'none' } as object)
          : {}),
      }}
    />
  );
}

function ValidationHint({ message }: { message: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 4,
      }}
    >
      <AlertCircle size={12} color={vaasenkNative.colors.semantic.danger} />
      <Text
        style={{
          color: vaasenkNative.colors.semantic.danger,
          fontSize: 12,
        }}
      >
        {message}
      </Text>
    </View>
  );
}

function TagChip({
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
        accessibilityRole="checkbox"
        accessibilityState={{ checked: true }}
        accessibilityLabel={label}
      >
        <LinearGradient
          {...gradientProps('heroSunrise')}
          style={{
            minHeight: 36,
            paddingHorizontal: vaasenkNative.spacing.lg,
            paddingVertical: vaasenkNative.spacing.xs,
            borderRadius: vaasenkNative.radius.full,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              color: vaasenkNative.colors.text.inverse,
              fontWeight: '700',
              fontSize: 12,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
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
      accessibilityRole="checkbox"
      accessibilityState={{ checked: false }}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        minHeight: 36,
        paddingHorizontal: vaasenkNative.spacing.lg,
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
          fontSize: 12,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function defaultTitleFor(d: Date): string {
  const date = d.toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `Board notes · ${date}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

async function safeFileInfo(uri: string): Promise<number | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    if (info.exists && 'size' in info && typeof info.size === 'number') {
      return info.size;
    }
  } catch {
    // ignore
  }
  return null;
}
