/**
 * Vaasenk Mobile — Teacher bottom tabs (Sprint 7.3).
 *
 * Five tabs, each backed by a nested NativeStack (see teacher-stacks.tsx).
 * The centre Upload tab is the Brand Flame FAB — tapping it routes to
 * QuickUploadScreen which immediately opens the camera.
 *
 * Sprint 7.1 plumbed the FAB; Sprint 7.3 swaps the placeholder screens
 * for real implementations. The bar geometry is unchanged.
 */

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Home,
  Layers,
  MessageCircle,
  Plus,
  User,
} from 'lucide-react-native';
import { Pressable, View, type GestureResponderEvent } from 'react-native';
import { BellOverlay } from '@/components/notifications';
import { TeacherProfileScreen } from '@/screens/teacher';
import {
  TeacherAIStack,
  TeacherClassroomsStack,
  TeacherHomeStack,
  TeacherUploadStack,
} from './teacher-stacks';
import { gradientProps, vaasenkNative } from '@/theme/tokens';
import type { TeacherTabsParamList } from './types';

const Tab = createBottomTabNavigator<TeacherTabsParamList>();

const FAB_SIZE = 64;

function UploadFabButton({
  onPress,
  accessibilityState,
}: {
  onPress?: (e: GestureResponderEvent) => void;
  accessibilityState?: { selected?: boolean };
}) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginTop: -FAB_SIZE / 2,
      }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Upload note"
        accessibilityState={accessibilityState}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={({ pressed }) => [
          {
            width: FAB_SIZE,
            height: FAB_SIZE,
            borderRadius: FAB_SIZE / 2,
            overflow: 'hidden',
            transform: [{ scale: pressed ? 0.94 : 1 }],
          },
          vaasenkNative.shadows.glowRed,
        ]}
      >
        <LinearGradient
          {...gradientProps('heroSunrise')}
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Plus
            color={vaasenkNative.colors.text.inverse}
            size={28}
            strokeWidth={2.5}
          />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

export function TeacherTabs() {
  return (
    <View style={{ flex: 1 }}>
      <TeacherTabNavigator />
      {/* Floating notification bell — same overlay as student. */}
      <BellOverlay iconColor={vaasenkNative.colors.text.inverse} />
    </View>
  );
}

function TeacherTabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="TeacherHome"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: vaasenkNative.colors.brand.red,
        tabBarInactiveTintColor: vaasenkNative.colors.text.muted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginBottom: 4,
        },
        tabBarStyle: {
          backgroundColor: vaasenkNative.components.bottomNav.backgroundColor,
          borderTopWidth: 0,
          height: vaasenkNative.components.bottomNav.height,
          paddingTop: 8,
        },
      }}
    >
      <Tab.Screen
        name="TeacherHome"
        component={TeacherHomeStack}
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="TeacherClassrooms"
        component={TeacherClassroomsStack}
        options={{
          title: 'Classes',
          tabBarIcon: ({ color, size }) => <Layers color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="TeacherUpload"
        component={TeacherUploadStack}
        options={{
          title: '',
          tabBarLabel: () => null,
          tabBarButton: (props) => (
            <UploadFabButton
              onPress={
                props.onPress as
                  | ((e: GestureResponderEvent) => void)
                  | undefined
              }
              accessibilityState={
                props.accessibilityState as { selected?: boolean }
              }
            />
          ),
        }}
      />
      <Tab.Screen
        name="TeacherAI"
        component={TeacherAIStack}
        options={{
          title: 'AI',
          tabBarIcon: ({ color, size }) => (
            <MessageCircle color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="TeacherProfile"
        component={TeacherProfileScreen}
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}
