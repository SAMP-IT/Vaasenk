/**
 * Vaasenk Mobile — Deep-link router (Sprint 7.4).
 *
 * Mirrors apps/web/src/lib/notifications/links.ts but emits React Navigation
 * route descriptors instead of URLs. Pure function — no state, no IO. The
 * caller (RootNavigator's response listener, NotificationCenterSheet's row
 * tap, etc.) feeds the {@link NotificationView} or {@link PushNotificationData}
 * shape in and gets back either a `{ stack, screen, params }` instruction
 * or `null` (don't navigate — leave the user where they are).
 *
 * Why null instead of throwing or defaulting to a home route:
 *
 *   - A student receiving a teacher-only PAPER_GENERATED would otherwise
 *     get bounced to a screen they can't see. Cleaner UX is to surface
 *     the row in the bell list (where it's already informative) and stay
 *     put.
 *   - Some notification types (SYLLABUS_READY) have no mobile destination
 *     because they're admin-only on the web. Returning null keeps the
 *     bell usable while admins finish their work on a laptop.
 *
 * Routing target shape:
 *
 *   {
 *     stack: 'StudentTabs' | 'TeacherTabs',
 *     screen: <tab name>,                     // e.g. 'StudentClassrooms'
 *     params: { screen: <leaf>, params: {...} } // nested-stack descriptor
 *   }
 *
 * The caller passes this directly to `navigation.navigate(stack, params)`.
 * The two levels of nesting (tab to stack to leaf) are how React Navigation
 * v6 represents drill-into-a-tab — see ../navigation/types.ts.
 */

import type {
  StudentBookmarksStackParamList,
  StudentClassroomsStackParamList,
  StudentDownloadsStackParamList,
  StudentHomeStackParamList,
  StudentTabsParamList,
  TeacherAIStackParamList,
  TeacherClassroomsStackParamList,
  TeacherHomeStackParamList,
  TeacherTabsParamList,
  TeacherUploadStackParamList,
} from '@/navigation/types';
import type { UserRole } from './auth-types';
import type {
  NotificationType,
  NotificationView,
  PushNotificationData,
} from './notifications-types';

// -----------------------------------------------------------------------
// Deep link target type
// -----------------------------------------------------------------------

/**
 * The discriminator pair (`stack` + `screen`) doubles as a type-narrowing
 * key for the callers. We build the union per-tab so TypeScript can
 * validate the leaf params at the call site.
 */
type StudentDeepLink =
  | {
      stack: 'StudentTabs';
      screen: keyof StudentTabsParamList & 'StudentHome';
      params: {
        screen: keyof StudentHomeStackParamList;
        params?: StudentHomeStackParamList[keyof StudentHomeStackParamList];
      };
    }
  | {
      stack: 'StudentTabs';
      screen: keyof StudentTabsParamList & 'StudentClassrooms';
      params: {
        screen: keyof StudentClassroomsStackParamList;
        params: StudentClassroomsStackParamList[keyof StudentClassroomsStackParamList];
      };
    }
  | {
      stack: 'StudentTabs';
      screen: keyof StudentTabsParamList & 'StudentBookmarks';
      params: {
        screen: keyof StudentBookmarksStackParamList;
        params: StudentBookmarksStackParamList[keyof StudentBookmarksStackParamList];
      };
    }
  | {
      stack: 'StudentTabs';
      screen: keyof StudentTabsParamList & 'StudentDownloads';
      params: {
        screen: keyof StudentDownloadsStackParamList;
        params: StudentDownloadsStackParamList[keyof StudentDownloadsStackParamList];
      };
    };

type TeacherDeepLink =
  | {
      stack: 'TeacherTabs';
      screen: keyof TeacherTabsParamList & 'TeacherHome';
      params: {
        screen: keyof TeacherHomeStackParamList;
        params?: TeacherHomeStackParamList[keyof TeacherHomeStackParamList];
      };
    }
  | {
      stack: 'TeacherTabs';
      screen: keyof TeacherTabsParamList & 'TeacherClassrooms';
      params: {
        screen: keyof TeacherClassroomsStackParamList;
        params: TeacherClassroomsStackParamList[keyof TeacherClassroomsStackParamList];
      };
    }
  | {
      stack: 'TeacherTabs';
      screen: keyof TeacherTabsParamList & 'TeacherUpload';
      params: {
        screen: keyof TeacherUploadStackParamList;
        params?: TeacherUploadStackParamList[keyof TeacherUploadStackParamList];
      };
    }
  | {
      stack: 'TeacherTabs';
      screen: keyof TeacherTabsParamList & 'TeacherAI';
      params: {
        screen: keyof TeacherAIStackParamList;
        params?: TeacherAIStackParamList[keyof TeacherAIStackParamList];
      };
    };

export type DeepLinkTarget = StudentDeepLink | TeacherDeepLink;

// -----------------------------------------------------------------------
// Input normalisation
// -----------------------------------------------------------------------

/**
 * Both `NotificationView` (REST + Socket) and `PushNotificationData` (Expo
 * push `data`) carry the same routing fields under the same names — we
 * narrow to the smallest common shape internally so the switch below can
 * be reused for either source.
 */
type RoutingInput = {
  type: NotificationType | string;
  entityType: string | null;
  entityId: string | null;
  link: string | null;
  metadata?: Record<string, unknown> | null;
};

function isNotificationView(value: unknown): value is NotificationView {
  return (
    !!value &&
    typeof value === 'object' &&
    'metadata' in (value as NotificationView)
  );
}

function toRoutingInput(
  value: NotificationView | PushNotificationData,
): RoutingInput {
  if (isNotificationView(value)) {
    return {
      type: value.type,
      entityType: value.entityType,
      entityId: value.entityId,
      link: value.link,
      metadata: value.metadata,
    };
  }
  return {
    type: value.type,
    entityType: value.entityType,
    entityId: value.entityId,
    link: value.link,
    metadata: null,
  };
}

/**
 * Read a metadata key as a string. Returns null for missing keys or
 * non-string values. Tolerant of `metadata === null`.
 *
 * Push payloads strip metadata to keep the OS-side data envelope under
 * the 4KB cap, so all metadata access here is a graceful no-op for the
 * push code path. The REST/Socket payload carries it for the bell sheet.
 */
function meta(input: RoutingInput, key: string): string | null {
  const raw = input.metadata;
  if (!raw || typeof raw !== 'object') return null;
  const value = raw[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

// -----------------------------------------------------------------------
// vaasenk:// URL parsing for SYSTEM_ANNOUNCEMENT.link
// -----------------------------------------------------------------------

/**
 * Translate a `vaasenk://...` deep-link URL into a navigation target.
 * Used when the backend writes a free-form link on a SYSTEM_ANNOUNCEMENT.
 *
 * Supported patterns (intentionally narrow — we only route what we can
 * verify exists in the app):
 *
 *   vaasenk://student/classrooms/<id>
 *   vaasenk://student/classrooms/<id>/notes/<id>
 *   vaasenk://teacher/classrooms/<id>
 *   vaasenk://teacher/classrooms/<id>/notes/<id>
 *   vaasenk://teacher/classrooms/<id>/papers/<id>
 *
 * Anything else returns null. We deliberately do NOT route from a URL into
 * a screen the user can't access (RBAC) — the calling site passes `role`
 * so we can validate that before emitting a target.
 */
function parseVaasenkUrl(
  url: string,
  role: 'STUDENT' | 'TEACHER',
): DeepLinkTarget | null {
  // Strip the scheme, leaving "<role>/<path>...".
  const match = /^vaasenk:\/\/([^?#]+)/.exec(url);
  if (!match || !match[1]) return null;
  const segments = match[1].split('/').filter(Boolean);
  if (segments.length < 1) return null;

  const [targetRole, ...rest] = segments;
  // Block cross-role deep-links from a notification — the user wouldn't
  // see them anyway, but we'd rather no-op than confuse the navigation.
  if (
    (targetRole === 'student' && role !== 'STUDENT') ||
    (targetRole === 'teacher' && role !== 'TEACHER')
  ) {
    return null;
  }

  if (targetRole === 'student' && rest[0] === 'classrooms' && rest[1]) {
    const classroomId = rest[1];
    if (rest[2] === 'notes' && rest[3]) {
      return {
        stack: 'StudentTabs',
        screen: 'StudentClassrooms',
        params: {
          screen: 'NoteDetail',
          params: { noteId: rest[3], classroomId, offline: false },
        },
      };
    }
    return {
      stack: 'StudentTabs',
      screen: 'StudentClassrooms',
      params: {
        screen: 'ClassroomFeed',
        params: { classroomId },
      },
    };
  }

  if (targetRole === 'teacher' && rest[0] === 'classrooms' && rest[1]) {
    const classroomId = rest[1];
    if (rest[2] === 'notes' && rest[3]) {
      return {
        stack: 'TeacherTabs',
        screen: 'TeacherClassrooms',
        params: {
          screen: 'NoteDetail',
          params: { noteId: rest[3], classroomId },
        },
      };
    }
    if (rest[2] === 'papers' && rest[3]) {
      // jobId is unknown when arriving via a free-form URL — pass an
      // empty string so PaperPreview can refetch by paperId. The screen
      // tolerates jobId='' (used by the publish-from-list flow).
      return {
        stack: 'TeacherTabs',
        screen: 'TeacherClassrooms',
        params: {
          screen: 'PaperPreview',
          params: { paperId: rest[3], jobId: '' },
        },
      };
    }
    return {
      stack: 'TeacherTabs',
      screen: 'TeacherClassrooms',
      params: {
        screen: 'ClassroomDetail',
        params: { classroomId },
      },
    };
  }

  return null;
}

// -----------------------------------------------------------------------
// Main entry
// -----------------------------------------------------------------------

/**
 * Resolve a notification to a navigation target.
 *
 * Resolution order matches the web:
 *   1. `link` override — only honoured when it parses as `vaasenk://...`.
 *      Web-style `https://...` links would dump the user into a browser;
 *      we ignore those here so the mobile experience stays in-app.
 *   2. Type-driven routing — switch over the NotificationType enum.
 *   3. Fallback: return null (caller stays put).
 *
 * The `role` argument is mandatory because deep-links are role-scoped.
 * Even if the backend mis-targets a payload (it shouldn't), we won't
 * navigate the user into a screen their role isn't mounted under.
 */
export function getDeepLinkForNotification(
  input: NotificationView | PushNotificationData,
  role: UserRole,
): DeepLinkTarget | null {
  // Mobile is student/teacher-first. Admin sessions on mobile bounce to
  // the AdminBlocked screen; no deep-link surface to route into.
  if (role !== 'STUDENT' && role !== 'TEACHER') {
    return null;
  }

  const r = toRoutingInput(input);

  // 1. Backend-supplied `vaasenk://` URL wins when it parses.
  if (r.link && r.link.startsWith('vaasenk://')) {
    const target = parseVaasenkUrl(r.link, role);
    if (target) return target;
    // Falls through to type-driven routing if parsing fails — preserves
    // a useful default even when the link is malformed.
  }

  switch (r.type) {
    case 'NOTE_PUBLISHED': {
      const noteId =
        r.entityType === 'note' ? r.entityId : meta(r, 'noteId');
      const classroomId =
        r.entityType === 'classroom'
          ? r.entityId
          : meta(r, 'classroomId');
      if (!noteId || !classroomId) {
        // Without both ids we can't open NoteDetail — return null so the
        // bell list still shows the row but tapping is a no-op.
        return null;
      }
      if (role === 'STUDENT') {
        return {
          stack: 'StudentTabs',
          screen: 'StudentClassrooms',
          params: {
            screen: 'NoteDetail',
            params: { noteId, classroomId, offline: false },
          },
        };
      }
      return {
        stack: 'TeacherTabs',
        screen: 'TeacherClassrooms',
        params: {
          screen: 'NoteDetail',
          params: { noteId, classroomId },
        },
      };
    }

    case 'PAPER_GENERATED':
    case 'PAPER_READY': {
      if (role !== 'TEACHER') return null;
      const paperId =
        r.entityType === 'paper' ? r.entityId : meta(r, 'paperId');
      if (!paperId) {
        // Surface the classrooms list so the teacher can find the paper
        // manually — the bell row's text usually says which classroom.
        return {
          stack: 'TeacherTabs',
          screen: 'TeacherClassrooms',
          params: { screen: 'ClassroomsList', params: undefined as never },
        };
      }
      return {
        stack: 'TeacherTabs',
        screen: 'TeacherClassrooms',
        params: {
          screen: 'PaperPreview',
          params: { paperId, jobId: meta(r, 'jobId') ?? '' },
        },
      };
    }

    case 'PAPER_FAILED': {
      if (role !== 'TEACHER') return null;
      // No success entity — drop the teacher on the classrooms list so
      // they can retry. The bell row body explains the failure.
      return {
        stack: 'TeacherTabs',
        screen: 'TeacherClassrooms',
        params: { screen: 'ClassroomsList', params: undefined as never },
      };
    }

    case 'CLASSROOM_JOINED':
    case 'CLASSROOM_INVITE': {
      if (role !== 'TEACHER') {
        // Students don't receive CLASSROOM_JOINED for their own join —
        // it fires for the teacher when a new student joins. Defensive
        // no-op for the rare cross-fire case.
        return null;
      }
      const classroomId =
        r.entityType === 'classroom'
          ? r.entityId
          : meta(r, 'classroomId');
      if (!classroomId) return null;
      return {
        stack: 'TeacherTabs',
        screen: 'TeacherClassrooms',
        params: {
          screen: 'ClassroomDetail',
          params: { classroomId },
        },
      };
    }

    case 'SYLLABUS_READY':
    case 'SYLLABUS_FAILED':
    case 'SYLLABUS_PROCESSED':
    case 'AI_READY': {
      // No mobile admin syllabus surface — the bell row still informs,
      // but tapping it is a no-op. The user finishes the workflow on web.
      return null;
    }

    case 'AI_CREDITS_LOW': {
      // No mobile billing screen — admin/web-only. No-op on tap.
      return null;
    }

    case 'DOUBT_RECEIVED':
    case 'DOUBT_REPLIED': {
      // Doubt feature is post-Sprint-7 on mobile. Fall back to the
      // teacher classroom detail when we have a classroomId.
      const classroomId = meta(r, 'classroomId');
      if (role === 'TEACHER' && classroomId) {
        return {
          stack: 'TeacherTabs',
          screen: 'TeacherClassrooms',
          params: {
            screen: 'ClassroomDetail',
            params: { classroomId, initialTab: 'doubts' },
          },
        };
      }
      return null;
    }

    case 'SYSTEM_ANNOUNCEMENT':
    case 'SYSTEM': {
      // Without a usable vaasenk:// link there's nothing to route to.
      // The list row carries the announcement text, which is enough.
      return null;
    }

    default: {
      // Unknown type — log in dev so we notice unmapped server enums.
      if (__DEV__) {
         
        console.warn(
          `[notifications] Unmapped notification type for mobile: ${String(r.type)}`,
        );
      }
      return null;
    }
  }
}

// -----------------------------------------------------------------------
// Helpers for testing
// -----------------------------------------------------------------------

/** Exposed for unit tests in a follow-up sprint. */
export const __internal = { parseVaasenkUrl };
