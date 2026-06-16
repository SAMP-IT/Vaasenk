/**
 * Vaasenk Mobile — Navigator type definitions.
 *
 * Mounted in three distinct stacks that the root navigator swaps between:
 *   - AuthStack       — pre-login: Welcome, Login
 *   - StudentTabStack — post-login (STUDENT): 5 tabs, each tab a nested stack
 *   - TeacherTabStack — post-login (TEACHER): 5 tabs incl. Upload FAB
 *
 * Sprint 7.2 added the per-tab nested stacks for Home / Classrooms /
 * Bookmarks / Downloads so the student can drill from a tab into the
 * NoteDetail viewer while keeping the bottom tab bar visible. Per-tab
 * NoteDetail params are typed independently so the back-stack semantics
 * stay clean (e.g. NoteDetail-from-Downloads passes `{ offline: true }`).
 */

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type {
  CompositeScreenProps,
  NavigatorScreenParams,
} from '@react-navigation/native';

// -----------------------------
// Auth stack (pre-login)
// -----------------------------

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
};

// -----------------------------
// Student nested stacks (Sprint 7.2)
// -----------------------------

/**
 * Home tab — landing dashboard + a Join-classroom modal.
 *
 * JoinClassroom lives on the Home stack because the empty state on Home
 * deep-links straight into it; the Classrooms tab also navigates here
 * via `navigation.navigate('StudentHome', { screen: 'JoinClassroom' })`.
 */
export type StudentHomeStackParamList = {
  HomeRoot: undefined;
  JoinClassroom: undefined;
};

export type StudentClassroomsStackParamList = {
  ClassroomsList: undefined;
  ClassroomFeed: { classroomId: string };
  NoteDetail: { noteId: string; classroomId: string; offline?: false };
};

export type StudentBookmarksStackParamList = {
  BookmarksList: undefined;
  NoteDetail: { noteId: string; classroomId: string; offline?: false };
};

export type StudentDownloadsStackParamList = {
  DownloadsList: undefined;
  NoteDetail: { noteId: string; classroomId: string; offline: true };
};

// -----------------------------
// Student bottom tabs (post-login, STUDENT)
// -----------------------------

export type StudentTabsParamList = {
  StudentHome: NavigatorScreenParams<StudentHomeStackParamList>;
  StudentClassrooms: NavigatorScreenParams<StudentClassroomsStackParamList>;
  StudentBookmarks: NavigatorScreenParams<StudentBookmarksStackParamList>;
  StudentDownloads: NavigatorScreenParams<StudentDownloadsStackParamList>;
  StudentProfile: undefined;
};

// -----------------------------
// Teacher nested stacks (Sprint 7.3) — mirrors student-stacks pattern
// -----------------------------

/**
 * Home tab — landing dashboard. The "Generate paper" quick action surfaces
 * a classroom-picker sheet on the dashboard itself (not a nested route)
 * so the stack stays simple; QuickUpload lives on its own tab.
 */
export type TeacherHomeStackParamList = {
  HomeRoot: undefined;
};

/**
 * Classrooms tab — list → detail → drill-down. ClassroomDetail hosts the
 * Notes/Doubts/Papers/AI tabbed body. NoteDetail is reused for teacher's
 * note inspection. GeneratePaper + PaperPreview live on this stack so the
 * back button pops naturally back to the classroom detail.
 */
export type TeacherClassroomsStackParamList = {
  ClassroomsList: undefined;
  ClassroomDetail: { classroomId: string; initialTab?: TeacherClassroomTab };
  NoteDetail: { noteId: string; classroomId: string };
  GeneratePaper: { classroomId: string };
  PaperPreview: { paperId: string; jobId: string };
};

export type TeacherClassroomTab = 'notes' | 'doubts' | 'papers' | 'ai';

/**
 * Upload tab — single full-screen modal. Kept as its own stack so the
 * tab bar stays in place (we hide its label and elevate the FAB).
 */
export type TeacherUploadStackParamList = {
  QuickUpload: { classroomId?: string } | undefined;
};

/**
 * AI tab — sessions list → chat. Sessions are scoped per-classroom by the
 * backend; the list screen prompts the teacher to pick a classroom first.
 */
export type TeacherAIStackParamList = {
  AISessions: { classroomId?: string } | undefined;
  AIChat: { classroomId: string; sessionId: string };
};

// -----------------------------
// Teacher bottom tabs (post-login, TEACHER)
// -----------------------------

export type TeacherTabsParamList = {
  TeacherHome: NavigatorScreenParams<TeacherHomeStackParamList>;
  TeacherClassrooms: NavigatorScreenParams<TeacherClassroomsStackParamList>;
  TeacherUpload: NavigatorScreenParams<TeacherUploadStackParamList>;
  TeacherAI: NavigatorScreenParams<TeacherAIStackParamList>;
  TeacherProfile: undefined;
};

// -----------------------------
// Root stack
// -----------------------------

export type RootStackParamList = {
  Splash: undefined;
  Auth: NavigatorScreenParams<AuthStackParamList>;
  StudentTabs: NavigatorScreenParams<StudentTabsParamList>;
  TeacherTabs: NavigatorScreenParams<TeacherTabsParamList>;
  AdminBlocked: undefined;
};

// -----------------------------
// Screen prop helpers
// -----------------------------

export type RootScreenProps<K extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, K>;

export type AuthScreenProps<K extends keyof AuthStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<AuthStackParamList, K>,
    RootScreenProps<keyof RootStackParamList>
  >;

export type StudentScreenProps<K extends keyof StudentTabsParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<StudentTabsParamList, K>,
    RootScreenProps<keyof RootStackParamList>
  >;

export type TeacherScreenProps<K extends keyof TeacherTabsParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<TeacherTabsParamList, K>,
    RootScreenProps<keyof RootStackParamList>
  >;

// Per-tab nested stack helpers — every screen below the tab bar uses
// these so it can access both its local stack params and the parent
// tab navigator (e.g. to jump between tabs).
export type StudentHomeScreenProps<K extends keyof StudentHomeStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<StudentHomeStackParamList, K>,
    StudentScreenProps<keyof StudentTabsParamList>
  >;

export type StudentClassroomsScreenProps<
  K extends keyof StudentClassroomsStackParamList,
> = CompositeScreenProps<
  NativeStackScreenProps<StudentClassroomsStackParamList, K>,
  StudentScreenProps<keyof StudentTabsParamList>
>;

export type StudentBookmarksScreenProps<
  K extends keyof StudentBookmarksStackParamList,
> = CompositeScreenProps<
  NativeStackScreenProps<StudentBookmarksStackParamList, K>,
  StudentScreenProps<keyof StudentTabsParamList>
>;

export type StudentDownloadsScreenProps<
  K extends keyof StudentDownloadsStackParamList,
> = CompositeScreenProps<
  NativeStackScreenProps<StudentDownloadsStackParamList, K>,
  StudentScreenProps<keyof StudentTabsParamList>
>;

// Teacher per-tab nested stack helpers — each screen below the tab bar
// uses these so it can access both its local stack params and the parent
// tab navigator (e.g. to jump between tabs).
export type TeacherHomeScreenProps<K extends keyof TeacherHomeStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<TeacherHomeStackParamList, K>,
    TeacherScreenProps<keyof TeacherTabsParamList>
  >;

export type TeacherClassroomsScreenProps<
  K extends keyof TeacherClassroomsStackParamList,
> = CompositeScreenProps<
  NativeStackScreenProps<TeacherClassroomsStackParamList, K>,
  TeacherScreenProps<keyof TeacherTabsParamList>
>;

export type TeacherUploadScreenProps<
  K extends keyof TeacherUploadStackParamList,
> = CompositeScreenProps<
  NativeStackScreenProps<TeacherUploadStackParamList, K>,
  TeacherScreenProps<keyof TeacherTabsParamList>
>;

export type TeacherAIScreenProps<K extends keyof TeacherAIStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<TeacherAIStackParamList, K>,
    TeacherScreenProps<keyof TeacherTabsParamList>
  >;

// Global navigation typing — lets `useNavigation()` infer routes anywhere.
declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
