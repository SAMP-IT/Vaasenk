/**
 * Notification client types — Sprint 6.2.
 *
 * Mirrors the frozen Sprint 6.1 backend contract in
 * `apps/api/src/modules/notifications/notifications.types.ts`. Kept inline
 * (not imported from a shared package) because the backend's enum comes
 * from `@prisma/client` which the web app should not pull in.
 *
 * If the backend adds a new NotificationType the union here must grow too —
 * a server emitting an unknown type falls into the SYSTEM_ANNOUNCEMENT
 * fallback in `links.ts`, but the icon switch falls back to the generic
 * megaphone.
 */

export type NotificationType =
  // Active types
  | 'NOTE_PUBLISHED'
  | 'PAPER_GENERATED'
  | 'PAPER_FAILED'
  | 'SYLLABUS_READY'
  | 'SYLLABUS_FAILED'
  | 'CLASSROOM_JOINED'
  | 'AI_CREDITS_LOW'
  | 'SYSTEM_ANNOUNCEMENT'
  // Legacy values still appearing on older rows — treat as fallback so a
  // pre-Sprint-6 notification never crashes the bell.
  | 'PAPER_READY'
  | 'AI_READY'
  | 'SYLLABUS_PROCESSED'
  | 'CLASSROOM_INVITE'
  | 'DOUBT_RECEIVED'
  | 'DOUBT_REPLIED'
  | 'SYSTEM';

/**
 * Entity slugs the backend writes to `NotificationView.entityType`. Used by
 * the deep-link router to choose a route.
 */
export type NotificationEntityType =
  | 'note'
  | 'paper'
  | 'paper-job'
  | 'classroom'
  | 'syllabus'
  | 'subscription'
  | 'doubt';

/**
 * Public projection of a Notification row. Mirrors
 * apps/api/src/modules/notifications/notifications.types.ts → NotificationView.
 *
 * Dates arrive as ISO strings over the wire (JSON has no Date type). The
 * REST + WS layers both serialize the Prisma row through the same toView()
 * projection, so callers can trust this shape on both transports.
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

/**
 * Envelope for `GET /api/v1/notifications`. The list endpoint's `meta`
 * carries an extra `unreadTotal` so we can hydrate the bell badge from a
 * single round-trip (no separate /unread-count call).
 */
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

/** Wire shape of `PATCH /:id/read` (after the API envelope is unwrapped). */
export type MarkReadResponse = {
  notification: NotificationView;
};

/** Wire shape of `PATCH /read-all` (after the API envelope is unwrapped). */
export type MarkAllReadResponse = {
  markedReadCount: number;
};

/**
 * Bucket keys used by the dropdown to group items into Today / Yesterday /
 * This week / Older sections.
 */
export type NotificationGroupKey = 'today' | 'yesterday' | 'this-week' | 'older';

export type NotificationGroup = {
  key: NotificationGroupKey;
  label: string;
  items: NotificationView[];
};

/* ------------------------------------------------------------------------ */
/* Socket.IO event payloads — frozen at backend.                            */
/* ------------------------------------------------------------------------ */

/** `notification:created` — server pushes a single new notification. */
export type NotificationCreatedEvent = {
  notification: NotificationView;
};

/** `notification:unread-count` — server pushes the authoritative count. */
export type NotificationUnreadCountEvent = {
  unreadTotal: number;
};

/** Event names — mirror NOTIFICATION_EVENTS on the server. */
export const NOTIFICATION_EVENTS = {
  CREATED: 'notification:created',
  UNREAD_COUNT: 'notification:unread-count',
} as const;
