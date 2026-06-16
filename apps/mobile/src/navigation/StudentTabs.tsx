/**
 * Vaasenk Mobile — Student bottom tabs.
 *
 * Sprint 7.2 swaps the 7.1 placeholder screens for real per-tab nested
 * NativeStacks (see ./student-stacks.tsx). The bottom tab bar stays
 * visible while drilling into NoteDetail / ClassroomFeed / JoinClassroom.
 *
 * Profile remains a single-screen tab (no nested stack needed yet).
 *
 * The tab bar uses a glassmorphic surface from
 * vaasenkNative.components.bottomNav so it sits attractively on the
 * Warm Canvas page background.
 */

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Bookmark, Download, Home, Layers, User } from 'lucide-react-native';
import { View } from 'react-native';
import { BellOverlay } from '@/components/notifications';
import { ProfileScreen } from '@/screens/student';
import { vaasenkNative } from '@/theme/tokens';
import {
  StudentBookmarksStack,
  StudentClassroomsStack,
  StudentDownloadsStack,
  StudentHomeStack,
} from './student-stacks';
import type { StudentTabsParamList } from './types';

const Tab = createBottomTabNavigator<StudentTabsParamList>();

export function StudentTabs() {
  return (
    <View style={{ flex: 1 }}>
      <StudentTabNavigator />
      {/* Floating notification bell, pinned to the safe-area top-right.
          One bell for the entire student session — reads its data from
          the shared NotificationsProvider. */}
      <BellOverlay iconColor={vaasenkNative.colors.text.inverse} />
    </View>
  );
}

function StudentTabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="StudentHome"
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
        name="StudentHome"
        component={StudentHomeStack}
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="StudentClassrooms"
        component={StudentClassroomsStack}
        options={{
          title: 'Classes',
          tabBarIcon: ({ color, size }) => <Layers color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="StudentBookmarks"
        component={StudentBookmarksStack}
        options={{
          title: 'Saved',
          tabBarIcon: ({ color, size }) => (
            <Bookmark color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="StudentDownloads"
        component={StudentDownloadsStack}
        options={{
          title: 'Offline',
          tabBarIcon: ({ color, size }) => (
            <Download color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="StudentProfile"
        component={ProfileScreen}
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}
