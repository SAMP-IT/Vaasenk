/**
 * Vaasenk Mobile — REST client for notifications (Sprint 7.4).
 *
 * Ports apps/web/src/lib/notifications/api.ts to the mobile API client.
 * Same endpoints, same envelope contract — only difference is that the
 * list endpoint uses `apiFetchEnvelope` so callers can read
 * `meta.unreadTotal` in the same round-trip.
 */

import { apiFetch, apiFetchEnvelope } from './api';
import type {
  MarkAllReadResponse,
  MarkReadResponse,
  NotificationListMeta,
  NotificationListResponse,
  NotificationType,
  NotificationView,
} from './notifications-types';

export type ListNotificationsParams = {
  /** Tri-state filter: true = only read, false = only unread, undefined = both. */
  read?: boolean;
  /** Optional single-type filter — server enum-validates against NotificationType. */
  type?: NotificationType;
  page?: number;
  limit?: number;
  /** Optional AbortSignal — wired to fetch so we can cancel on unmount. */
  signal?: AbortSignal;
};

function buildQuery(params: ListNotificationsParams): string {
  const usp = new URLSearchParams();
  if (params.read !== undefined) {
    usp.set('read', params.read ? 'true' : 'false');
  }
  if (params.type) {
    usp.set('type', params.type);
  }
  if (params.page !== undefined) {
    usp.set('page', String(params.page));
  }
  if (params.limit !== undefined) {
    usp.set('limit', String(params.limit));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

/**
 * GET /api/v1/notifications
 *
 * Returns the FULL envelope so callers can read `meta.unreadTotal` for the
 * bell badge in the same round-trip.
 */
export async function listNotifications(
  params: ListNotificationsParams = {},
): Promise<NotificationListResponse> {
  const { signal, ...filters } = params;
  const envelope = await apiFetchEnvelope<NotificationView[]>(
    `/api/v1/notifications${buildQuery(filters)}`,
    signal ? { signal } : {},
  );
  return {
    data: envelope.data ?? [],
    meta: (envelope.meta ?? {
      page: 1,
      limit: 20,
      total: 0,
      unreadTotal: 0,
    }) as NotificationListMeta,
  };
}

/**
 * PATCH /api/v1/notifications/:id/read
 *
 * Idempotent — calling on an already-read row is a no-op server-side and
 * still returns the row. The WebSocket will also push a fresh
 * `notification:unread-count` after a real state change.
 */
export async function markNotificationRead(
  id: string,
): Promise<NotificationView> {
  const result = await apiFetch<MarkReadResponse>(
    `/api/v1/notifications/${id}/read`,
    { method: 'PATCH' },
  );
  return result.notification;
}

/**
 * PATCH /api/v1/notifications/read-all
 *
 * Returns the number of rows updated — useful for a "N notifications
 * marked read" toast. The backend also pushes
 * `notification:unread-count: { unreadTotal: 0 }` over the WS.
 */
export async function markAllNotificationsRead(): Promise<number> {
  const result = await apiFetch<MarkAllReadResponse>(
    `/api/v1/notifications/read-all`,
    { method: 'PATCH' },
  );
  return result.markedReadCount;
}
