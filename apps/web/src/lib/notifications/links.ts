/**
 * Deep-link routing table — Sprint 6.2.
 *
 * Resolves a {@link NotificationView} to the route the user should land on
 * when they click the row in the bell dropdown.
 *
 * Resolution order:
 *   1. `notification.link`           — backend may override the default.
 *   2. The type → entityType → entityId map below.
 *   3. Fallback `/` (with a dev-mode console.warn for unmapped types).
 *
 * The role-based routing (teacher vs student deep-link for NOTE_PUBLISHED)
 * uses the metadata to decide: backend writes `metadata.classroomId` and
 * sometimes `metadata.recipientRole`. We keep this client-agnostic and
 * default to the role-neutral classroom URL — Next.js middleware will redirect
 * a student hitting a teacher route to the correct space.
 */

import type { NotificationView } from './types';

/**
 * Extract a metadata key as a string. Returns `null` when missing or not
 * string-typed. Tolerant of `metadata === null` (e.g. SYSTEM_ANNOUNCEMENT).
 */
function meta(notification: NotificationView, key: string): string | null {
  const raw = notification.metadata;
  if (!raw || typeof raw !== 'object') return null;
  const value = raw[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function getNotificationHref(notification: NotificationView): string {
  // 1. Backend override always wins. Lets future server-side logic compute
  //    role-aware URLs without forcing a frontend release.
  if (notification.link && notification.link.length > 0) {
    return notification.link;
  }

  // 2. Type-driven routing.
  switch (notification.type) {
    case 'NOTE_PUBLISHED': {
      // Default to the teacher classroom view; students get redirected by
      // middleware when they don't have access to the teacher route.
      const classroomId =
        notification.entityType === 'classroom'
          ? notification.entityId
          : meta(notification, 'classroomId');
      const noteId =
        notification.entityType === 'note'
          ? notification.entityId
          : meta(notification, 'noteId');
      if (classroomId) {
        return noteId
          ? `/teacher/classrooms/${classroomId}#note-${noteId}`
          : `/teacher/classrooms/${classroomId}`;
      }
      return '/teacher';
    }

    case 'PAPER_GENERATED':
    case 'PAPER_READY': {
      const paperId =
        notification.entityType === 'paper'
          ? notification.entityId
          : meta(notification, 'paperId');
      return paperId
        ? `/teacher/question-papers/${paperId}`
        : '/teacher/question-papers';
    }

    case 'PAPER_FAILED':
      return '/teacher/question-papers';

    case 'SYLLABUS_READY':
    case 'SYLLABUS_PROCESSED':
    case 'AI_READY': {
      const syllabusId =
        notification.entityType === 'syllabus'
          ? notification.entityId
          : meta(notification, 'syllabusId');
      return syllabusId
        ? `/admin/syllabus/${syllabusId}`
        : '/admin/syllabus';
    }

    case 'SYLLABUS_FAILED':
      return '/admin/syllabus';

    case 'CLASSROOM_JOINED':
    case 'CLASSROOM_INVITE': {
      const classroomId =
        notification.entityType === 'classroom'
          ? notification.entityId
          : meta(notification, 'classroomId');
      return classroomId
        ? `/teacher/classrooms/${classroomId}`
        : '/teacher';
    }

    case 'AI_CREDITS_LOW':
      return '/admin/billing';

    case 'SYSTEM_ANNOUNCEMENT':
    case 'SYSTEM':
      // No entity to drill into — surface the dashboard. Backend should
      // override via `notification.link` for actionable announcements.
      return '/';

    case 'DOUBT_RECEIVED':
    case 'DOUBT_REPLIED': {
      // Doubt feature is post-Sprint-6; route to a placeholder so the
      // legacy notification at least lands somewhere meaningful.
      const classroomId = meta(notification, 'classroomId');
      return classroomId ? `/teacher/classrooms/${classroomId}` : '/';
    }

    default: {
      // Exhaustiveness escape hatch — TS narrows `notification.type` to
      // `never` once every union member is handled. If we ever ship a
      // new server enum without updating the client, this prevents the
      // bell from crashing.
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn(
          `[notifications] Unmapped notification type: ${String(
            (notification as NotificationView).type,
          )}`,
        );
      }
      return '/';
    }
  }
}
