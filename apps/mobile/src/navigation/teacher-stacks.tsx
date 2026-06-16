/**
 * Vaasenk Mobile — Per-tab nested stacks for the Teacher tabs (Sprint 7.3).
 *
 * Mirrors apps/mobile/src/navigation/student-stacks.tsx structure.
 *
 *   HomeStack       ── HomeRoot
 *   ClassroomsStack ── ClassroomsList, ClassroomDetail, NoteDetail,
 *                       GeneratePaper, PaperPreview
 *   UploadStack     ── QuickUpload (single screen, full-bleed)
 *   AIStack         ── AISessions, AIChat
 *
 * Headers are always hidden — each screen draws its own role-themed
 * Teacher Orange gradient hero (CLAUDE.md §4).
 */

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  AIChatScreen,
  AISessionsScreen,
  ClassroomDetailScreen,
  TeacherClassroomsListScreen,
  TeacherHomeScreen,
  TeacherNoteDetailScreen,
  GeneratePaperScreen,
  PaperPreviewScreen,
  QuickUploadScreen,
} from '@/screens/teacher';
import type {
  TeacherAIStackParamList,
  TeacherClassroomsStackParamList,
  TeacherHomeStackParamList,
  TeacherUploadStackParamList,
} from './types';

const HomeNav = createNativeStackNavigator<TeacherHomeStackParamList>();
export function TeacherHomeStack() {
  return (
    <HomeNav.Navigator screenOptions={{ headerShown: false }}>
      <HomeNav.Screen name="HomeRoot" component={TeacherHomeScreen} />
    </HomeNav.Navigator>
  );
}

const ClassroomsNav =
  createNativeStackNavigator<TeacherClassroomsStackParamList>();
export function TeacherClassroomsStack() {
  return (
    <ClassroomsNav.Navigator screenOptions={{ headerShown: false }}>
      <ClassroomsNav.Screen
        name="ClassroomsList"
        component={TeacherClassroomsListScreen}
      />
      <ClassroomsNav.Screen
        name="ClassroomDetail"
        component={ClassroomDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <ClassroomsNav.Screen
        name="NoteDetail"
        component={TeacherNoteDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <ClassroomsNav.Screen
        name="GeneratePaper"
        component={GeneratePaperScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <ClassroomsNav.Screen
        name="PaperPreview"
        component={PaperPreviewScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </ClassroomsNav.Navigator>
  );
}

const UploadNav = createNativeStackNavigator<TeacherUploadStackParamList>();
export function TeacherUploadStack() {
  return (
    <UploadNav.Navigator screenOptions={{ headerShown: false }}>
      <UploadNav.Screen name="QuickUpload" component={QuickUploadScreen} />
    </UploadNav.Navigator>
  );
}

const AINav = createNativeStackNavigator<TeacherAIStackParamList>();
export function TeacherAIStack() {
  return (
    <AINav.Navigator screenOptions={{ headerShown: false }}>
      <AINav.Screen name="AISessions" component={AISessionsScreen} />
      <AINav.Screen
        name="AIChat"
        component={AIChatScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </AINav.Navigator>
  );
}
