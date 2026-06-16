/**
 * Vaasenk Mobile — Per-tab nested stacks for the Student tabs (Sprint 7.2).
 *
 * Each bottom tab mounts a NativeStack so the user can drill from a list
 * into a detail screen while the tab bar stays on screen. Four stacks:
 *
 *   HomeStack       ── HomeRoot, JoinClassroom (deep-linked from empty state)
 *   ClassroomsStack ── ClassroomsList, ClassroomFeed, NoteDetail
 *   BookmarksStack  ── BookmarksList, NoteDetail
 *   DownloadsStack  ── DownloadsList, NoteDetail (offline mode)
 *
 * Each NoteDetail screen is mounted in its own stack so the back button
 * pops to the originating tab's list — natural mobile UX.
 *
 * Header is always hidden because every screen draws its own coral hero
 * (matches the design-doc's role-themed gradient policy).
 */

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  BookmarksScreen,
  ClassroomFeedScreen,
  ClassroomsListScreen,
  DownloadsScreen,
  JoinClassroomScreen,
  NoteDetailScreen,
  StudentHomeScreen,
} from '@/screens/student';
import type {
  StudentBookmarksStackParamList,
  StudentClassroomsStackParamList,
  StudentDownloadsStackParamList,
  StudentHomeStackParamList,
} from './types';

const HomeNav = createNativeStackNavigator<StudentHomeStackParamList>();
export function StudentHomeStack() {
  return (
    <HomeNav.Navigator screenOptions={{ headerShown: false }}>
      <HomeNav.Screen name="HomeRoot" component={StudentHomeScreen} />
      <HomeNav.Screen
        name="JoinClassroom"
        component={JoinClassroomScreen}
        options={{
          // Slide-from-bottom feels modal-ish without the extra ceremony.
          animation: 'slide_from_bottom',
        }}
      />
    </HomeNav.Navigator>
  );
}

const ClassroomsNav = createNativeStackNavigator<StudentClassroomsStackParamList>();
export function StudentClassroomsStack() {
  return (
    <ClassroomsNav.Navigator screenOptions={{ headerShown: false }}>
      <ClassroomsNav.Screen
        name="ClassroomsList"
        component={ClassroomsListScreen}
      />
      <ClassroomsNav.Screen
        name="ClassroomFeed"
        component={ClassroomFeedScreen}
      />
      <ClassroomsNav.Screen
        name="NoteDetail"
        component={NoteDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </ClassroomsNav.Navigator>
  );
}

const BookmarksNav = createNativeStackNavigator<StudentBookmarksStackParamList>();
export function StudentBookmarksStack() {
  return (
    <BookmarksNav.Navigator screenOptions={{ headerShown: false }}>
      <BookmarksNav.Screen
        name="BookmarksList"
        component={BookmarksScreen}
      />
      <BookmarksNav.Screen
        name="NoteDetail"
        component={NoteDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </BookmarksNav.Navigator>
  );
}

const DownloadsNav = createNativeStackNavigator<StudentDownloadsStackParamList>();
export function StudentDownloadsStack() {
  return (
    <DownloadsNav.Navigator screenOptions={{ headerShown: false }}>
      <DownloadsNav.Screen
        name="DownloadsList"
        component={DownloadsScreen}
      />
      <DownloadsNav.Screen
        name="NoteDetail"
        component={NoteDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </DownloadsNav.Navigator>
  );
}
