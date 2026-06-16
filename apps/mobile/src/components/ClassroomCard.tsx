/**
 * Vaasenk Mobile — ClassroomCard.
 *
 * Coral-gradient classroom card used on the Home horizontal scroll and
 * the Classrooms tab list. Visual lineage: design-docs §4 "Student
 * Coral" + the web's ClassroomCard. The note count badge mirrors the
 * web's right-aligned pill.
 *
 * Two layouts via the `compact` prop:
 *   - compact: 280x180 hero card for horizontal scrollers (Home).
 *   - false (default): full-width row card for the Classrooms list.
 */

import { ArrowRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';
import type { ClassroomView } from '@/services/classrooms';
import { gradientProps, vaasenkNative } from '@/theme/tokens';

type Props = {
  classroom: ClassroomView;
  onPress: () => void;
  compact?: boolean;
};

export function ClassroomCard({ classroom, onPress, compact }: Props) {
  const subject = classroom.subject?.name ?? classroom.name;
  const classSection = [classroom.class?.name, classroom.section?.name]
    .filter(Boolean)
    .join(' · ');
  const teacherName = classroom.teacher?.name ?? 'Unassigned';
  const noteCount = classroom._count?.notes ?? 0;
  const memberCount = classroom._count?.members ?? 0;

  if (compact) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${subject}. ${classSection}. ${noteCount} notes.`}
        style={({ pressed }) => ({
          width: 260,
          opacity: pressed ? 0.92 : 1,
        })}
      >
        <LinearGradient
          {...gradientProps('studentCandy')}
          style={[
            {
              borderRadius: vaasenkNative.radius.xl,
              padding: vaasenkNative.spacing.xl,
              minHeight: 170,
              justifyContent: 'space-between',
            },
            vaasenkNative.shadows.glowRed,
          ]}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text
              numberOfLines={2}
              style={{
                flex: 1,
                color: vaasenkNative.colors.text.inverse,
                fontWeight: '800',
                fontSize: 20,
                lineHeight: 24,
              }}
            >
              {subject}
            </Text>
            <ArrowRight size={20} color={vaasenkNative.colors.text.inverse} />
          </View>

          {classSection ? (
            <Text
              numberOfLines={1}
              style={{
                marginTop: vaasenkNative.spacing.xs,
                color: 'rgba(255,255,255,0.9)',
                fontSize: 13,
              }}
            >
              {classSection}
            </Text>
          ) : null}

          <View
            style={{
              marginTop: vaasenkNative.spacing.md,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                color: 'rgba(255,255,255,0.92)',
                fontSize: 12,
                fontWeight: '600',
              }}
            >
              {teacherName}
            </Text>
            <View
              style={{
                paddingHorizontal: vaasenkNative.spacing.md,
                paddingVertical: 4,
                borderRadius: vaasenkNative.radius.full,
                backgroundColor: 'rgba(255,255,255,0.22)',
              }}
            >
              <Text
                style={{
                  color: vaasenkNative.colors.text.inverse,
                  fontWeight: '700',
                  fontSize: 11,
                }}
              >
                {noteCount} {noteCount === 1 ? 'note' : 'notes'}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </Pressable>
    );
  }

  // Full-width row variant (Classrooms tab list).
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${subject}. ${classSection}. ${noteCount} notes.`}
      style={({ pressed }) => ({
        marginHorizontal: vaasenkNative.spacing.xl,
        marginBottom: vaasenkNative.spacing.md,
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <LinearGradient
        {...gradientProps('studentCandy')}
        style={[
          {
            borderRadius: vaasenkNative.radius.xl,
            padding: vaasenkNative.spacing.xl,
            minHeight: 120,
          },
          vaasenkNative.shadows.cardSoft,
        ]}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <View style={{ flex: 1, paddingRight: vaasenkNative.spacing.md }}>
            <Text
              numberOfLines={2}
              style={{
                color: vaasenkNative.colors.text.inverse,
                fontWeight: '800',
                fontSize: 18,
                lineHeight: 22,
              }}
            >
              {subject}
            </Text>
            {classSection ? (
              <Text
                numberOfLines={1}
                style={{
                  marginTop: 2,
                  color: 'rgba(255,255,255,0.9)',
                  fontSize: 13,
                }}
              >
                {classSection}
              </Text>
            ) : null}
            <Text
              numberOfLines={1}
              style={{
                marginTop: vaasenkNative.spacing.sm,
                color: 'rgba(255,255,255,0.92)',
                fontSize: 13,
                fontWeight: '600',
              }}
            >
              {teacherName}
            </Text>
          </View>
          <ArrowRight size={20} color={vaasenkNative.colors.text.inverse} />
        </View>

        <View
          style={{
            marginTop: vaasenkNative.spacing.md,
            flexDirection: 'row',
            gap: vaasenkNative.spacing.sm,
          }}
        >
          <Badge label={`${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`} />
          <Badge label={`${memberCount} ${memberCount === 1 ? 'classmate' : 'classmates'}`} />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <View
      style={{
        paddingHorizontal: vaasenkNative.spacing.md,
        paddingVertical: 4,
        borderRadius: vaasenkNative.radius.full,
        backgroundColor: 'rgba(255,255,255,0.22)',
      }}
    >
      <Text
        style={{
          color: vaasenkNative.colors.text.inverse,
          fontWeight: '700',
          fontSize: 11,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
