/**
 * Vaasenk Mobile — Teacher Classroom Card (Sprint 7.3).
 *
 * Distinct from the student `ClassroomCard` because:
 *   - Teacher screens use Teacher Orange (goldCard) gradient, not coral.
 *   - Surface emphasises invite code (tap-to-copy) + student count +
 *     last upload time, NOT teacher name / note count.
 *   - Compact + row variants mirror ClassroomCard so the Home + List tabs
 *     have a consistent layout API.
 */

import { ArrowRight, ChevronRight, Users } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';
import type { ClassroomView } from '@/services/classrooms';
import { gradientProps, vaasenkNative } from '@/theme/tokens';

type Props = {
  classroom: ClassroomView;
  onPress: () => void;
  compact?: boolean;
  /** Optional last-upload relative string for the row variant. */
  lastUploadRelative?: string | null;
};

export function TeacherClassroomCard({
  classroom,
  onPress,
  compact,
  lastUploadRelative,
}: Props) {
  const subject = classroom.subject?.name ?? classroom.name;
  const classSection = [classroom.class?.name, classroom.section?.name]
    .filter(Boolean)
    .join(' · ');
  const memberCount = classroom._count?.members ?? 0;
  const noteCount = classroom._count?.notes ?? 0;
  const inviteCode = classroom.inviteCode ?? '—';

  if (compact) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${subject}. ${memberCount} students.`}
        style={({ pressed }) => ({ width: 260, opacity: pressed ? 0.92 : 1 })}
      >
        <LinearGradient
          {...gradientProps('goldCard')}
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
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}
          >
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
                color: 'rgba(255,255,255,0.92)',
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
            <Badge label={inviteCode} mono />
            <Badge label={`${memberCount} ${memberCount === 1 ? 'student' : 'students'}`} />
          </View>
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${subject}. ${memberCount} students. ${noteCount} notes.`}
      style={({ pressed }) => ({
        marginHorizontal: vaasenkNative.spacing.xl,
        marginBottom: vaasenkNative.spacing.md,
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <LinearGradient
        {...gradientProps('goldCard')}
        style={[
          {
            borderRadius: vaasenkNative.radius.xl,
            padding: vaasenkNative.spacing.xl,
            minHeight: 130,
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
                  color: 'rgba(255,255,255,0.92)',
                  fontSize: 13,
                }}
              >
                {classSection}
              </Text>
            ) : null}
            <View
              style={{
                marginTop: vaasenkNative.spacing.sm,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Users size={14} color={vaasenkNative.colors.text.inverse} />
              <Text
                style={{
                  color: 'rgba(255,255,255,0.92)',
                  fontSize: 13,
                  fontWeight: '600',
                }}
              >
                {memberCount} {memberCount === 1 ? 'student' : 'students'}
              </Text>
              {lastUploadRelative ? (
                <Text
                  style={{
                    color: 'rgba(255,255,255,0.78)',
                    fontSize: 12,
                  }}
                >
                  · Last upload {lastUploadRelative}
                </Text>
              ) : null}
            </View>
          </View>
          <ChevronRight size={20} color={vaasenkNative.colors.text.inverse} />
        </View>

        <View
          style={{
            marginTop: vaasenkNative.spacing.md,
            flexDirection: 'row',
            gap: vaasenkNative.spacing.sm,
          }}
        >
          <Badge label={inviteCode} mono />
          <Badge label={`${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`} />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function Badge({ label, mono }: { label: string; mono?: boolean }) {
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
          letterSpacing: mono ? 1.5 : undefined,
          fontVariant: mono ? ['tabular-nums'] : undefined,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
