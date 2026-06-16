import type { NotificationType } from '@prisma/client';

/**
 * Frozen REST + WebSocket contract for Sprint 6.
 *
 * The frontend, mobile, and any future consumer treat this file as the
 * canonical shape. Adding fields is safe; renaming or removing is breaking.
 */

/**
 * Public projection of a `Notification` row returned by:
 *   • GET    /api/v1/notifications
 *   • PATCH  /api/v1/notifications/:id/read     → { notification }
 *   • PATCH  /api/v1/notifications/read-all     → { markedReadCount }
 *   • Socket.IO `notification:created`           → payload IS this object
 *
 * `entityType` + `entityId` are convenience aliases derived from `metadata`
 * so the frontend can deep-link without re-implementing the per-type map.
 */
export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  metadata: Record<string, unknown> | null;
  readAt: Date | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Convenience map of canonical entity links per notification type. The
 * service layer reads this when projecting Notification rows to views so
 * the contract stays in one place.
 */
export const NOTIFICATION_ENTITY_MAP: Record<
  NotificationType,
  {
    /** Path to the entity id inside `metadata`. null = no entity link. */
    metadataKey: string | null;
    entityType: string | null;
  }
> = {
  // Active types
  NOTE_PUBLISHED: { metadataKey: 'noteId', entityType: 'note' },
  PAPER_GENERATED: { metadataKey: 'paperId', entityType: 'paper' },
  PAPER_FAILED: { metadataKey: 'paperJobId', entityType: 'paper-job' },
  SYLLABUS_READY: { metadataKey: 'syllabusId', entityType: 'syllabus' },
  SYLLABUS_FAILED: { metadataKey: 'syllabusId', entityType: 'syllabus' },
  CLASSROOM_JOINED: { metadataKey: 'classroomId', entityType: 'classroom' },
  DOUBT_RECEIVED: { metadataKey: 'doubtId', entityType: 'doubt' },
  DOUBT_REPLIED: { metadataKey: 'doubtId', entityType: 'doubt' },
  AI_CREDITS_LOW: {
    metadataKey: 'subscriptionId',
    entityType: 'subscription',
  },
  SYSTEM_ANNOUNCEMENT: { metadataKey: null, entityType: null },

  // Legacy types — left in the map so toView() never crashes on rows
  // emitted by older code paths. Treat them like their canonical replacements.
  PAPER_READY: { metadataKey: 'paperId', entityType: 'paper' },
  AI_READY: { metadataKey: 'syllabusId', entityType: 'syllabus' },
  SYLLABUS_PROCESSED: { metadataKey: 'syllabusId', entityType: 'syllabus' },
  CLASSROOM_INVITE: { metadataKey: 'classroomId', entityType: 'classroom' },
  SYSTEM: { metadataKey: null, entityType: null },
};

/**
 * Socket.IO event payloads — frozen contract.
 *
 * The gateway namespace is `/notifications` and the handshake carries the
 * Supabase JWT in either `socket.handshake.auth.token` (preferred) or
 * `?token=` query string (legacy / browser EventSource limitations).
 */

/** Server → client: a new notification was just created for this user. */
export interface NotificationCreatedEvent {
  notification: NotificationView;
}

/**
 * Server → client: the recipient's unread count changed. The frontend uses
 * this to update the bell badge without re-fetching the list — the count
 * is the AUTHORITATIVE value, not a delta.
 */
export interface NotificationUnreadCountEvent {
  unreadTotal: number;
}

/**
 * Socket.IO event names — kept as a const tuple so both server and client
 * can type-check against the same identifier.
 */
export const NOTIFICATION_EVENTS = {
  CREATED: 'notification:created',
  UNREAD_COUNT: 'notification:unread-count',
} as const;
