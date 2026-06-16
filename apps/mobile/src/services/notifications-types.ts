/**
 * Vaasenk Mobile — Notification client types (Sprint 7.4).
 *
 * Mirrors the frozen Sprint 6.1 backend contract in
 * `apps/api/src/modules/notifications/notifications.types.ts` and the web
 * port in `apps/web/src/lib/notifications/types.ts`. Re-declared inline
 * rather than imported from a shared package because:
 *
 *   • Mobile doesn't have Prisma — the backend's `NotificationType` enum
 *     comes from `@prisma/client` which we don't want to bundle into RN.
 *   • The web file was already inlined for the same reason; keeping the
 *     mobile copy 1:1 makes the contract obvious at review time.
 *
 * If the backend grows a new NotificationType, add it to the union here.
 * A server payload carrying an unknown type will still render — it falls
 * through the deep-link switch in `push-links.ts` and the bell icon
 * switch in `NotificationCenterSheet.tsx` (megaphone fallback).
 */

export type NotificationType =
  // Active types (Sprint 6+).
  | 'NOTE_PUBLISHED'
  | 'PAPER_GENERATED'
  | 'PAPER_FAILED'
  | 'SYLLABUS_READY'
  | 'SYLLABUS_FAILED'
  | 'CLASSROOM_JOINED'
  | 'AI_CREDITS_LOW'
  | 'SYSTEM_ANNOUNCEMENT'
  // Legacy values still appearing on older rows.
  | 'PAPER_READY'
  | 'AI_READY'
  | 'SYLLABUS_PROCESSED'
  | 'CLASSROOM_INVITE'
  | 'DOUBT_RECEIVED'
  | 'DOUBT_REPLIED'
  | 'SYSTEM';

/** Entity slugs the backend writes to `NotificationView.entityType`. */
export type NotificationEntityType =
  | 'note'
  | 'paper'
  | 'paper-job'
  | 'classroom'
  | 'syllabus'
  | 'subscription'
  | 'doubt';

/**
 * Public projection of a Notification row. ISO strings over the wire —
 * the REST + WS layers both serialize through the same `toView()` so
 * we trust this shape on both transports.
 */
export type NotificationView = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  metadata: Record<string, unknown> | null;
  readAt: string | null;
  entityType: NotificationEntityType | string | null;
  entityId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NotificationListMeta = {
  page: number;
  limit: number;
  total: number;
  unreadTotal: number;
};

export type NotificationListResponse = {
  data: NotificationView[];
  meta: NotificationListMeta;
};

export type MarkReadResponse = {
  notification: NotificationView;
};

export type MarkAllReadResponse = {
  markedReadCount: number;
};

/** Bucket keys used by the center sheet to group items. */
export type NotificationGroupKey =
  | 'today'
  | 'yesterday'
  | 'this-week'
  | 'older';

export type NotificationGroup = {
  key: NotificationGroupKey;
  label: string;
  items: NotificationView[];
};

/* ------------------------------------------------------------------------ */
/* Socket.IO event payloads — frozen at backend.                            */
/* ------------------------------------------------------------------------ */

export type NotificationCreatedEvent = {
  notification: NotificationView;
};

export type NotificationUnreadCountEvent = {
  unreadTotal: number;
};

export const NOTIFICATION_EVENTS = {
  CREATED: 'notification:created',
  UNREAD_COUNT: 'notification:unread-count',
} as const;

/* ------------------------------------------------------------------------ */
/* Push payload (server → device).                                          */
/* ------------------------------------------------------------------------ */

/**
 * Mirrors the frozen push payload the backend sends through the Expo Push
 * API. The OS delivers this verbatim to the `addNotificationReceivedListener`
 * and `addNotificationResponseReceivedListener` handlers in `data:`.
 *
 * `entityType` / `entityId` / `link` are the same fields surfaced on the
 * `NotificationView` REST projection — using the same names lets us hand
 * the data object directly to {@link getDeepLinkForNotification} without
 * a translation layer.
 */
export type PushNotificationData = {
  notificationId: string;
  type: NotificationType;
  entityType: NotificationEntityType | string | null;
  entityId: string | null;
  link: string | null;
};
