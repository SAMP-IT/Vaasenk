/**
 * Vaasenk Mobile — ClassroomPickerSheet (Sprint 7.3).
 *
 * Bottom-sheet modal used by TeacherHomeScreen's quick actions to ask
 * "which classroom?" before deep-linking into Upload / Generate /
 * AISessions. React Native's built-in `<Modal>` provides the chrome —
 * we keep it dependency-free.
 *
 * Used in two intents:
 *   - Intent: Upload  → list classrooms with student/note counts.
 *   - Intent: Paper / AI → same list; the route handler diverges later.
 *
 * Touch targets ≥44px (CLAUDE.md §4). Backdrop dismisses, "Cancel" CTA
 * dismisses, the back gesture / system back closes it cleanly.
 */

import {
  FlatList,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, X } from 'lucide-react-native';
import type { ClassroomView } from '@/services/classrooms';
import { vaasenkNative } from '@/theme/tokens';

type Props = {
  open: boolean;
  title: string;
  classrooms: ClassroomView[];
  onPick: (classroomId: string) => void;
  onClose: () => void;
};

export function ClassroomPickerSheet({
  open,
  title,
  classrooms,
  onPick,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(74,5,8,0.32)',
          justifyContent: 'flex-end',
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          accessibilityRole="none"
          style={{
            maxHeight: '78%',
            backgroundColor: vaasenkNative.colors.surface.warmCanvas,
            borderTopLeftRadius: vaasenkNative.radius['2xl'],
            borderTopRightRadius: vaasenkNative.radius['2xl'],
            paddingBottom: insets.bottom + vaasenkNative.spacing.lg,
          }}
        >
          {/* Grabber */}
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: 'rgba(122,98,102,0.32)',
              alignSelf: 'center',
              marginTop: vaasenkNative.spacing.md,
            }}
          />

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: vaasenkNative.spacing.xl,
              paddingTop: vaasenkNative.spacing.md,
              paddingBottom: vaasenkNative.spacing.sm,
            }}
          >
            <Text
              style={{
                flex: 1,
                color: vaasenkNative.colors.text.ink,
                fontSize: 18,
                fontWeight: '800',
                paddingRight: vaasenkNative.spacing.md,
              }}
            >
              {title}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
              style={({ pressed }) => ({
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: vaasenkNative.colors.surface.glassWhite,
                borderWidth: 1,
                borderColor: 'rgba(160,0,0,0.12)',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <X size={16} color={vaasenkNative.colors.text.muted} />
            </Pressable>
          </View>

          <FlatList
            data={classrooms}
            keyExtractor={(c) => c.id}
            contentContainerStyle={{
              paddingHorizontal: vaasenkNative.spacing.xl,
              paddingTop: vaasenkNative.spacing.sm,
              gap: vaasenkNative.spacing.sm,
            }}
            renderItem={({ item }) => (
              <Row classroom={item} onPress={() => onPick(item.id)} />
            )}
            ListEmptyComponent={
              <Text
                style={{
                  paddingVertical: vaasenkNative.spacing.xl,
                  textAlign: 'center',
                  color: vaasenkNative.colors.text.muted,
                  fontSize: 13,
                }}
              >
                No classrooms available.
              </Text>
            }
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({
  classroom,
  onPress,
}: {
  classroom: ClassroomView;
  onPress: () => void;
}) {
  const subject = classroom.subject?.name ?? classroom.name;
  const classSection = [classroom.class?.name, classroom.section?.name]
    .filter(Boolean)
    .join(' · ');
  const memberCount = classroom._count?.members ?? 0;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${subject}. ${memberCount} students.`}
      style={({ pressed }) => ({
        minHeight: 56,
        padding: vaasenkNative.spacing.md,
        borderRadius: vaasenkNative.radius.lg,
        backgroundColor: vaasenkNative.colors.surface.glassWhite,
        borderWidth: 1,
        borderColor: 'rgba(160,0,0,0.08)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: vaasenkNative.spacing.md,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{
            color: vaasenkNative.colors.text.ink,
            fontWeight: '700',
            fontSize: 15,
          }}
        >
          {subject}
        </Text>
        {classSection ? (
          <Text
            numberOfLines={1}
            style={{
              color: vaasenkNative.colors.text.muted,
              fontSize: 12,
              marginTop: 2,
            }}
          >
            {classSection} · {memberCount} {memberCount === 1 ? 'student' : 'students'}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={18} color={vaasenkNative.colors.text.subtle} />
    </Pressable>
  );
}
