/**
 * Vaasenk Mobile — Student screen barrel (Sprint 7.2).
 *
 * Re-exports the real screen components for the bottom-tab navigator
 * and the per-tab nested stacks. The Sprint 7.1 placeholders are gone —
 * everything here is now the Playbook Prompt 25 screen graph:
 *
 *   StudentHome  ── HomeScreen, JoinClassroomScreen
 *   StudentClassrooms ── ClassroomsListScreen, ClassroomFeedScreen, NoteDetailScreen
 *   StudentBookmarks ── BookmarksScreen, NoteDetailScreen
 *   StudentDownloads ── DownloadsScreen, NoteDetailScreen
 *   StudentProfile   ── ProfileScreen
 *
 * The actual NativeStack wiring lives in navigation/student-stacks.tsx —
 * keep this file as a simple re-export hub so consumers (tests, future
 * deep-link helpers) don't have to know about the file layout.
 */

export { StudentHomeScreen } from './HomeScreen';
export { JoinClassroomScreen } from './JoinClassroomScreen';
export { ClassroomsListScreen } from './ClassroomsListScreen';
export { ClassroomFeedScreen } from './ClassroomFeedScreen';
export { NoteDetailScreen } from './NoteDetailScreen';
export { BookmarksScreen } from './BookmarksScreen';
export { DownloadsScreen } from './DownloadsScreen';
export { ProfileScreen } from './ProfileScreen';
