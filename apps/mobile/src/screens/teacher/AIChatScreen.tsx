/**
 * Vaasenk Mobile — AIChatScreen (Sprint 7.3).
 *
 * Mirrors apps/web/src/app/(dashboard)/teacher/classrooms/[id]/ai-chat-view.tsx:
 *   - Deep AI Glow gradient hero with mandatory disclaimer chip.
 *   - Message thread (assistant + user bubbles, citation chips with gold accent).
 *   - Streaming via services/ai-chat.ts streamChat (XHR-based SSE — see
 *     that file for the rationale; React Native fetch can't yield a
 *     ReadableStream).
 *   - Thinking-step ticker (Reading syllabus → Finding relevant content →
 *     Generating response) until first token arrives.
 *   - AbortController-backed "Stop generating" button.
 *   - Quick prompt chips at the bottom (Summary / Important questions /
 *     Lesson plan / Quiz / Explain simply).
 *
 * Auto-scroll heuristic: if the user is within 96px of the bottom we stick
 * to the latest token; otherwise we show a "Jump to latest" pill.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  Send,
  Sparkles,
  StopCircle,
} from 'lucide-react-native';
import {
  AI_DISCLAIMER,
  type AiChatCitation,
  type ChatStreamEvent,
  getSession,
  streamChat,
  type ServerChatMessage,
} from '@/services/ai-chat';
import { ApiClientError } from '@/services/api';
import { ErrorState } from '@/components/ErrorState';
import { LoadingShimmer } from '@/components/LoadingShimmer';
import { gradientProps, vaasenkNative } from '@/theme/tokens';
import type { TeacherAIScreenProps } from '@/navigation/types';

// Deep AI Glow gradient — see AISessionsScreen for the TODO.
const DEEP_AI_GLOW = {
  colors: ['#3B0010', '#780018', '#A00000', '#FF8A00'] as const,
  locations: [0, 0.45, 0.7, 1] as const,
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
};

const THINKING_STEPS = [
  'Reading syllabus…',
  'Finding relevant content…',
  'Generating response…',
];

const QUICK_PROMPTS: { label: string; prompt: string }[] = [
  {
    label: 'Summary',
    prompt:
      'Summarise the key concepts from the current chapter in 5 bullet points.',
  },
  {
    label: 'Important questions',
    prompt:
      'List 8 important questions from the current chapter, grouped by mark weight (2-mark, 5-mark, 10-mark).',
  },
  {
    label: 'Lesson plan',
    prompt:
      'Draft a 40-minute lesson plan for the next class — include warm-up, core teaching, examples, and a wrap-up activity.',
  },
  {
    label: 'Quiz',
    prompt:
      'Generate a 10-question quick quiz (MCQ + short answer) covering the current chapter. Include an answer key at the end.',
  },
  {
    label: 'Explain simply',
    prompt:
      'Explain the most difficult topic in this chapter in simple language suitable for a Class 10 student.',
  },
];

type ClientMessage = {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  citations: AiChatCitation[];
  status: 'sending' | 'streaming' | 'complete' | 'error' | 'aborted';
  errorMessage?: string;
};

const MAX_INPUT_LENGTH = 4000;

export function AIChatScreen({
  navigation,
  route,
}: TeacherAIScreenProps<'AIChat'>) {
  const insets = useSafeAreaInsets();
  const { classroomId, sessionId } = route.params;

  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [thinkingStep, setThinkingStep] = useState(0);
  const [showThinking, setShowThinking] = useState(false);
  const [showScrollHint, setShowScrollHint] = useState(false);

  const scrollerRef = useRef<ScrollView | null>(null);
  const contentHeightRef = useRef(0);
  const scrollOffsetRef = useRef(0);
  const layoutHeightRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // ---------- Load session detail ------------------------------------------
  const fetchSession = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await getSession(classroomId, sessionId);
      setSessionTitle(result.session.title);
      setMessages(toClientMessages(result.messages));
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not load this chat.';
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [classroomId, sessionId]);

  useEffect(() => {
    void fetchSession();
  }, [fetchSession]);

  // Abort any in-flight stream on unmount or session swap.
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [sessionId],
  );

  // Thinking-step ticker.
  useEffect(() => {
    if (!showThinking) return;
    const id = setInterval(() => {
      setThinkingStep((s) => (s + 1) % THINKING_STEPS.length);
    }, 700);
    return () => clearInterval(id);
  }, [showThinking]);

  // Auto-scroll-near-bottom heuristic — fired on every messages update.
  useEffect(() => {
    const nearBottom =
      contentHeightRef.current -
        scrollOffsetRef.current -
        layoutHeightRef.current <
      96;
    if (nearBottom) {
      scrollerRef.current?.scrollToEnd({ animated: false });
      setShowScrollHint(false);
    } else {
      setShowScrollHint(true);
    }
  }, [messages]);

  // ---------- Send + stream ------------------------------------------------
  const submitDisabled =
    streaming ||
    input.trim().length === 0 ||
    input.length > MAX_INPUT_LENGTH;

  const sendMessage = useCallback(async () => {
    const content = input.trim();
    if (!content || content.length > MAX_INPUT_LENGTH || streaming) return;

    const userId = `tmp-user-${Date.now()}`;
    const assistantId = `tmp-ai-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      {
        id: userId,
        role: 'USER',
        content,
        citations: [],
        status: 'sending',
      },
      {
        id: assistantId,
        role: 'ASSISTANT',
        content: '',
        citations: [],
        status: 'streaming',
      },
    ]);
    setInput('');
    setStreaming(true);
    setShowThinking(true);
    setThinkingStep(0);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      for await (const event of streamChat({
        classroomId,
        sessionId,
        content,
        signal: ac.signal,
      })) {
        handleEvent(event, userId, assistantId);
      }
    } catch (err) {
      const aborted = (err as { name?: string })?.name === 'AbortError';
      setShowThinking(false);
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === userId && m.status === 'sending') {
            return { ...m, status: 'complete' };
          }
          if (m.id === assistantId) {
            if (aborted) {
              return { ...m, status: 'aborted' };
            }
            return {
              ...m,
              status: 'error',
              errorMessage:
                err instanceof Error ? err.message : 'Stream interrupted.',
            };
          }
          return m;
        }),
      );
    } finally {
      setStreaming(false);
      setShowThinking(false);
      abortRef.current = null;
    }
  }, [classroomId, sessionId, input, streaming]);

  const handleEvent = (
    event: ChatStreamEvent,
    userId: string,
    assistantId: string,
  ) => {
    if (event.type === 'token') {
      setShowThinking(false);
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === userId && m.status === 'sending') {
            return { ...m, status: 'complete' };
          }
          if (m.id === assistantId) {
            return { ...m, content: m.content + event.content };
          }
          return m;
        }),
      );
    } else if (event.type === 'usage') {
      setShowThinking(false);
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === userId && m.status === 'sending') {
            return { ...m, status: 'complete' };
          }
          if (m.id === assistantId) {
            return {
              ...m,
              status: 'complete',
              citations: event.citations ?? [],
            };
          }
          return m;
        }),
      );
    } else if (event.type === 'error') {
      setShowThinking(false);
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === userId && m.status === 'sending') {
            return { ...m, status: 'complete' };
          }
          if (m.id === assistantId) {
            return { ...m, status: 'error', errorMessage: event.message };
          }
          return m;
        }),
      );
    }
  };

  const handleStop = () => abortRef.current?.abort();

  const applyPrompt = (prompt: string) => setInput(prompt);

  // ---------- Render -------------------------------------------------------
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: vaasenkNative.colors.surface.warmCanvas }}
    >
      <LinearGradient
        colors={
          DEEP_AI_GLOW.colors as unknown as readonly [string, string, ...string[]]
        }
        locations={
          DEEP_AI_GLOW.locations as unknown as readonly [
            number,
            number,
            ...number[],
          ]
        }
        start={DEEP_AI_GLOW.start}
        end={DEEP_AI_GLOW.end}
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
            accessibilityLabel="Back to sessions"
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
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              flex: 1,
              justifyContent: 'center',
            }}
          >
            <Sparkles size={14} color={vaasenkNative.colors.brand.gold} />
            <Text
              style={{
                color: vaasenkNative.colors.brand.gold,
                fontSize: 12,
                fontWeight: '800',
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              Vaasenk AI
            </Text>
          </View>
          {streaming ? (
            <View
              style={{
                flexDirection: 'row',
                gap: 4,
                alignItems: 'center',
                paddingHorizontal: vaasenkNative.spacing.sm,
                paddingVertical: 4,
                borderRadius: vaasenkNative.radius.full,
                backgroundColor: 'rgba(255,255,255,0.18)',
              }}
            >
              <ActivityIndicator size="small" color={vaasenkNative.colors.brand.gold} />
              <Text
                style={{
                  color: vaasenkNative.colors.brand.gold,
                  fontSize: 11,
                  fontWeight: '700',
                }}
              >
                Streaming
              </Text>
            </View>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>
        <Text
          style={{
            marginTop: vaasenkNative.spacing.sm,
            color: vaasenkNative.colors.text.inverse,
            fontSize: 18,
            fontWeight: '800',
          }}
          numberOfLines={1}
        >
          {sessionTitle ?? 'Vaasenk AI session'}
        </Text>
      </LinearGradient>

      {/* Disclaimer */}
      <View
        style={{
          marginTop: vaasenkNative.spacing.sm,
          marginHorizontal: vaasenkNative.spacing.xl,
          paddingVertical: vaasenkNative.spacing.sm,
          paddingHorizontal: vaasenkNative.spacing.md,
          borderRadius: vaasenkNative.radius.md,
          backgroundColor: 'rgba(254,202,2,0.18)',
          borderWidth: 1,
          borderColor: 'rgba(160,0,0,0.12)',
          flexDirection: 'row',
          gap: 6,
          alignItems: 'center',
        }}
      >
        <Sparkles size={14} color={vaasenkNative.colors.text.deepMaroon} />
        <Text
          style={{
            flex: 1,
            color: vaasenkNative.colors.text.deepMaroon,
            fontSize: 12,
            fontWeight: '600',
          }}
        >
          {AI_DISCLAIMER}
        </Text>
      </View>

      {/* Message thread */}
      {loadError ? (
        <View style={{ marginTop: vaasenkNative.spacing.lg }}>
          <ErrorState message={loadError} onRetry={fetchSession} />
        </View>
      ) : null}

      {loading && !loadError ? (
        <View
          style={{
            paddingHorizontal: vaasenkNative.spacing.xl,
            marginTop: vaasenkNative.spacing.lg,
            gap: vaasenkNative.spacing.md,
          }}
        >
          <LoadingShimmer height={70} borderRadius={20} />
          <LoadingShimmer height={70} borderRadius={20} />
        </View>
      ) : null}

      {!loading && !loadError ? (
        <View style={{ flex: 1 }}>
          <ScrollView
            ref={scrollerRef}
            contentContainerStyle={{
              padding: vaasenkNative.spacing.xl,
              gap: vaasenkNative.spacing.md,
            }}
            onContentSizeChange={(_, h) => {
              contentHeightRef.current = h;
            }}
            onLayout={(e) => {
              layoutHeightRef.current = e.nativeEvent.layout.height;
            }}
            onScroll={(e) => {
              scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
              const nearBottom =
                contentHeightRef.current -
                  e.nativeEvent.contentOffset.y -
                  layoutHeightRef.current <
                96;
              setShowScrollHint(!nearBottom);
            }}
            scrollEventThrottle={64}
            keyboardShouldPersistTaps="handled"
          >
            {messages.length === 0 ? (
              <EmptyChatHint onPick={applyPrompt} />
            ) : (
              messages.map((m, i) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  onRetry={
                    m.status === 'error' && i === messages.length - 1
                      ? () => {
                          setMessages((prev) =>
                            prev.filter((_, idx) => idx < prev.length - 2),
                          );
                          const lastUser = [...messages]
                            .reverse()
                            .find((mm) => mm.role === 'USER');
                          if (lastUser) setInput(lastUser.content);
                        }
                      : undefined
                  }
                />
              ))
            )}

            {showThinking ? <ThinkingSteps step={thinkingStep} /> : null}
          </ScrollView>

          {/* Jump to latest pill */}
          {showScrollHint ? (
            <Pressable
              onPress={() => scrollerRef.current?.scrollToEnd({ animated: true })}
              accessibilityRole="button"
              accessibilityLabel="Jump to latest"
              style={({ pressed }) => ({
                position: 'absolute',
                bottom: 120,
                alignSelf: 'center',
                paddingHorizontal: vaasenkNative.spacing.md,
                paddingVertical: vaasenkNative.spacing.xs,
                borderRadius: vaasenkNative.radius.full,
                backgroundColor: vaasenkNative.colors.surface.glassWhite,
                borderWidth: 1,
                borderColor: 'rgba(160,0,0,0.16)',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <ChevronDown size={14} color={vaasenkNative.colors.text.deepMaroon} />
              <Text
                style={{
                  color: vaasenkNative.colors.text.deepMaroon,
                  fontSize: 12,
                  fontWeight: '700',
                }}
              >
                Jump to latest
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Composer */}
      <View
        style={{
          paddingTop: vaasenkNative.spacing.sm,
          paddingBottom: insets.bottom + vaasenkNative.spacing.md,
          paddingHorizontal: vaasenkNative.spacing.xl,
          borderTopWidth: 1,
          borderTopColor: 'rgba(160,0,0,0.12)',
          backgroundColor: vaasenkNative.colors.surface.glassWhite,
          gap: vaasenkNative.spacing.sm,
        }}
      >
        {/* Quick prompt chips */}
        {messages.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
            keyboardShouldPersistTaps="handled"
          >
            {QUICK_PROMPTS.map((p) => (
              <Pressable
                key={p.label}
                onPress={() => applyPrompt(p.prompt)}
                accessibilityRole="button"
                accessibilityLabel={`Insert prompt: ${p.label}`}
                style={({ pressed }) => ({
                  minHeight: 32,
                  paddingHorizontal: vaasenkNative.spacing.md,
                  borderRadius: vaasenkNative.radius.full,
                  backgroundColor: 'rgba(255,255,255,0.6)',
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
                    fontSize: 11,
                    fontWeight: '700',
                  }}
                >
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: vaasenkNative.spacing.sm,
          }}
        >
          <View
            style={{
              flex: 1,
              borderRadius: vaasenkNative.radius.lg,
              borderWidth: 1,
              borderColor: 'rgba(160,0,0,0.18)',
              backgroundColor: 'rgba(255,255,255,0.85)',
              minHeight: 44,
              paddingHorizontal: vaasenkNative.spacing.md,
              paddingVertical: vaasenkNative.spacing.sm,
            }}
          >
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask Vaasenk AI…"
              placeholderTextColor={vaasenkNative.colors.text.subtle}
              multiline
              maxLength={MAX_INPUT_LENGTH + 200}
              editable={!streaming}
              style={{
                color: vaasenkNative.colors.text.ink,
                fontSize: 15,
                lineHeight: 22,
                maxHeight: 140,
                ...(Platform.OS === 'web'
                  ? ({ outlineStyle: 'none' } as object)
                  : {}),
              }}
            />
          </View>

          {streaming ? (
            <Pressable
              onPress={handleStop}
              accessibilityRole="button"
              accessibilityLabel="Stop generating"
              style={({ pressed }) => ({
                minHeight: 44,
                minWidth: 44,
                paddingHorizontal: vaasenkNative.spacing.md,
                borderRadius: vaasenkNative.radius.full,
                borderWidth: 1,
                borderColor: 'rgba(220,38,38,0.32)',
                backgroundColor: 'rgba(220,38,38,0.1)',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 4,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <StopCircle size={16} color={vaasenkNative.colors.semantic.danger} />
            </Pressable>
          ) : (
            <Pressable
              onPress={sendMessage}
              disabled={submitDisabled}
              accessibilityRole="button"
              accessibilityLabel="Send message"
              accessibilityState={{ disabled: submitDisabled }}
              style={({ pressed }) => ({
                opacity: submitDisabled ? 0.4 : pressed ? 0.85 : 1,
              })}
            >
              <LinearGradient
                {...gradientProps('heroSunrise')}
                style={[
                  {
                    minHeight: 44,
                    minWidth: 44,
                    borderRadius: vaasenkNative.radius.full,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: vaasenkNative.spacing.md,
                  },
                  vaasenkNative.shadows.glowRed,
                ]}
              >
                <Send size={18} color={vaasenkNative.colors.text.inverse} />
              </LinearGradient>
            </Pressable>
          )}
        </View>

        <Text
          style={{
            color: vaasenkNative.colors.text.subtle,
            fontSize: 11,
          }}
        >
          {input.length} / {MAX_INPUT_LENGTH}
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Helpers + sub-components
// ---------------------------------------------------------------------------

function toClientMessages(messages: ServerChatMessage[]): ClientMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    citations: m.citations ?? [],
    status: 'complete',
  }));
}

function MessageBubble({
  message,
  onRetry,
}: {
  message: ClientMessage;
  onRetry?: () => void;
}) {
  const isUser = message.role === 'USER';
  const isError = message.status === 'error';
  const isAborted = message.status === 'aborted';
  const isEmpty =
    !isUser && message.status === 'streaming' && message.content.length === 0;

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: vaasenkNative.spacing.sm,
        alignItems: 'flex-start',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      {!isUser ? (
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: 'rgba(74,5,8,0.92)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Sparkles size={16} color={vaasenkNative.colors.brand.gold} />
        </View>
      ) : null}
      <View
        style={{
          maxWidth: '80%',
          padding: vaasenkNative.spacing.md,
          borderRadius: 20,
          borderTopLeftRadius: isUser ? 20 : 6,
          borderTopRightRadius: isUser ? 6 : 20,
          backgroundColor: isUser
            ? vaasenkNative.colors.text.deepMaroon
            : isError
              ? 'rgba(220,38,38,0.1)'
              : vaasenkNative.colors.surface.glassWhite,
          borderWidth: isError ? 1 : 1,
          borderColor: isError
            ? 'rgba(220,38,38,0.32)'
            : isUser
              ? 'transparent'
              : 'rgba(160,0,0,0.1)',
        }}
      >
        {isError && message.errorMessage ? (
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
            <AlertCircle
              size={14}
              color={vaasenkNative.colors.semantic.danger}
            />
            <Text
              style={{
                flex: 1,
                color: vaasenkNative.colors.semantic.danger,
                fontSize: 13,
                lineHeight: 18,
              }}
            >
              {message.errorMessage}
            </Text>
          </View>
        ) : isEmpty ? (
          <Text
            style={{
              color: vaasenkNative.colors.text.muted,
              fontSize: 14,
              fontStyle: 'italic',
            }}
          >
            Thinking…
          </Text>
        ) : (
          <Text
            style={{
              color: isUser
                ? vaasenkNative.colors.text.inverse
                : vaasenkNative.colors.text.ink,
              fontSize: 14,
              lineHeight: 20,
            }}
          >
            {message.content}
          </Text>
        )}

        {isAborted ? (
          <Text
            style={{
              marginTop: 6,
              color: vaasenkNative.colors.text.muted,
              fontSize: 11,
              fontStyle: 'italic',
            }}
          >
            Generation stopped.
          </Text>
        ) : null}

        {message.citations.length > 0 ? (
          <View
            style={{
              marginTop: vaasenkNative.spacing.sm,
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 4,
            }}
          >
            {message.citations.map((c) => (
              <View
                key={c.index}
                style={{
                  paddingHorizontal: vaasenkNative.spacing.sm,
                  paddingVertical: 2,
                  borderRadius: vaasenkNative.radius.full,
                  backgroundColor: 'rgba(254,202,2,0.22)',
                }}
              >
                <Text
                  style={{
                    color: vaasenkNative.colors.text.deepMaroon,
                    fontSize: 10,
                    fontWeight: '700',
                  }}
                >
                  {[c.chapter, c.topic].filter(Boolean).join(' · ') ||
                    `Source ${c.index + 1}`}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {onRetry ? (
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel="Try again"
            hitSlop={6}
            style={({ pressed }) => ({
              marginTop: vaasenkNative.spacing.sm,
              alignSelf: 'flex-start',
              paddingHorizontal: vaasenkNative.spacing.md,
              paddingVertical: vaasenkNative.spacing.xs,
              borderRadius: vaasenkNative.radius.full,
              borderWidth: 1,
              borderColor: 'rgba(220,38,38,0.5)',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              style={{
                color: vaasenkNative.colors.semantic.danger,
                fontWeight: '700',
                fontSize: 12,
              }}
            >
              Try again
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function ThinkingSteps({ step }: { step: number }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: vaasenkNative.spacing.sm,
        alignItems: 'flex-start',
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: 'rgba(74,5,8,0.92)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Sparkles size={16} color={vaasenkNative.colors.brand.gold} />
      </View>
      <View
        style={{
          padding: vaasenkNative.spacing.md,
          borderRadius: 20,
          borderTopLeftRadius: 6,
          backgroundColor: vaasenkNative.colors.surface.glassWhite,
          borderWidth: 1,
          borderColor: 'rgba(160,0,0,0.1)',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <ActivityIndicator size="small" color={vaasenkNative.colors.brand.red} />
        <Text
          style={{
            color: vaasenkNative.colors.text.muted,
            fontSize: 13,
            fontWeight: '600',
          }}
        >
          {THINKING_STEPS[step] ?? THINKING_STEPS[0]}
        </Text>
      </View>
    </View>
  );
}

function EmptyChatHint({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <View
      style={{
        alignItems: 'center',
        gap: vaasenkNative.spacing.md,
        paddingVertical: vaasenkNative.spacing['2xl'],
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: 'rgba(74,5,8,0.92)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Sparkles size={24} color={vaasenkNative.colors.brand.gold} />
      </View>
      <Text
        style={{
          color: vaasenkNative.colors.text.ink,
          fontSize: 18,
          fontWeight: '800',
          textAlign: 'center',
        }}
      >
        Ask anything from the syllabus
      </Text>
      <Text
        style={{
          color: vaasenkNative.colors.text.muted,
          fontSize: 13,
          textAlign: 'center',
          paddingHorizontal: vaasenkNative.spacing.lg,
        }}
      >
        Vaasenk AI answers only from this classroom's syllabus, with chapter
        and topic citations. Pick a quick prompt below or type your own
        question.
      </Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 6,
          justifyContent: 'center',
        }}
      >
        {QUICK_PROMPTS.map((p) => (
          <Pressable
            key={p.label}
            onPress={() => onPick(p.prompt)}
            accessibilityRole="button"
            accessibilityLabel={`Insert prompt: ${p.label}`}
            style={({ pressed }) => ({
              minHeight: 32,
              paddingHorizontal: vaasenkNative.spacing.md,
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
                fontSize: 12,
                fontWeight: '700',
              }}
            >
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
