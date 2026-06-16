import { InjectQueue } from '@nestjs/bullmq';
import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  Prisma,
  Status,
  SubscriptionStatus,
  UserRole,
  type Notification,
  type User,
} from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { ExpoPushMessage, ExpoPushService } from './expo-push.service';
import type { ExpoPushJobData } from './expo-push.worker';
import { ListNotificationsDto } from './notifications.dto';
import { NotificationsGateway } from './notifications.gateway';
import {
  NOTIFICATION_ENTITY_MAP,
  NotificationView,
} from './notifications.types';

/**
 * Notifications service — Sprint 6 PROMPT 22.
 *
 * Two responsibilities:
 *
 *   1. REST surface for the bell UI — list, mark-one-read, mark-all-read.
 *   2. Fan-out helpers consumed by other modules (notes, question-papers,
 *      classrooms, syllabus worker, ai-chat). All sites that previously
 *      called `prisma.notification.createMany` migrate to `notifyMany` so
 *      the WebSocket emit happens in lockstep with the row insert.
 *
 * Multi-tenant scoping (CLAUDE.md §3) is enforced on every read/write —
 * notifications are scoped by `(institutionId, userId)`. We filter on
 * BOTH even though userId alone would suffice, because defense-in-depth
 * against a tomorrow's bug where a user is incorrectly attributed to
 * another tenant is cheap insurance.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    // forwardRef because NotificationsGateway also imports NotificationsService.
    @Inject(forwardRef(() => NotificationsGateway))
    private readonly gateway: NotificationsGateway,
    private readonly expoPush: ExpoPushService,
    @InjectQueue('expo-push')
    private readonly expoPushQueue: Queue<ExpoPushJobData>,
  ) {}

  /* ------------------------------------------------------------------------ */
  /* REST endpoints (controller delegates here)                               */
  /* ------------------------------------------------------------------------ */

  /**
   * GET /api/v1/notifications
   *
   * Returns `{ data, meta }` with an extra `unreadTotal` field on `meta` so
   * the frontend can keep the bell badge in sync from a list fetch.
   */
  async list(
    actor: User,
    query: ListNotificationsDto,
  ): Promise<{
    data: NotificationView[];
    meta: { page: number; limit: number; total: number; unreadTotal: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.NotificationWhereInput = {
      institutionId: actor.institutionId,
      userId: actor.id,
    };
    if (query.read === true) {
      where.readAt = { not: null };
    } else if (query.read === false) {
      where.readAt = null;
    }
    if (query.type) {
      where.type = query.type;
    }

    const unreadWhere: Prisma.NotificationWhereInput = {
      institutionId: actor.institutionId,
      userId: actor.id,
      readAt: null,
    };

    const [rows, total, unreadTotal] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: unreadWhere }),
    ]);

    return {
      data: rows.map((r) => this.toView(r)),
      meta: { page, limit, total, unreadTotal },
    };
  }

  /**
   * PATCH /api/v1/notifications/:id/read
   *
   * Idempotent: a notification already marked read returns its existing
   * row unchanged. 404 on cross-tenant or cross-user access — never
   * disclose existence.
   */
  async markRead(
    actor: User,
    id: string,
  ): Promise<{ notification: NotificationView }> {
    const existing = await this.prisma.notification.findFirst({
      where: {
        id,
        institutionId: actor.institutionId,
        userId: actor.id,
      },
    });
    if (!existing) {
      throw new NotFoundException('Notification not found');
    }

    if (existing.readAt) {
      return { notification: this.toView(existing) };
    }

    const updated = await this.prisma.notification.update({
      where: { id: existing.id },
      data: { readAt: new Date() },
    });

    // Refresh the bell badge for every device this user has open.
    const unreadTotal = await this.countUnread(actor);
    this.gateway.emitUnreadCount(actor.id, unreadTotal);

    return { notification: this.toView(updated) };
  }

  /**
   * PATCH /api/v1/notifications/read-all
   *
   * Mass-marks every unread notification for the actor. Returns the count
   * affected so the UI can show a toast like "32 notifications marked read".
   */
  async markAllRead(actor: User): Promise<{ markedReadCount: number }> {
    const result = await this.prisma.notification.updateMany({
      where: {
        institutionId: actor.institutionId,
        userId: actor.id,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    if (result.count > 0) {
      this.gateway.emitUnreadCount(actor.id, 0);
    }

    return { markedReadCount: result.count };
  }

  /* ------------------------------------------------------------------------ */
  /* Fan-out helpers (called by other modules)                                */
  /* ------------------------------------------------------------------------ */

  /**
   * Notify a single recipient. Persists the row, projects to a view, and
   * pushes the realtime event. Returns the persisted row.
   *
   * Callers MUST pass an `institutionId` derived from a server-trusted
   * source (jwt actor, classroom row, syllabus row) — NEVER from
   * client-supplied input.
   */
  async notify(args: {
    institutionId: string;
    userId: string;
    type: NotificationType;
    title: string;
    body?: string;
    metadata?: Record<string, unknown>;
    link?: string;
  }): Promise<Notification> {
    const row = await this.prisma.notification.create({
      data: {
        institutionId: args.institutionId,
        userId: args.userId,
        type: args.type,
        title: args.title,
        ...(args.body !== undefined && { body: args.body }),
        ...(args.link !== undefined && { link: args.link }),
        ...(args.metadata !== undefined && {
          metadata: args.metadata as Prisma.InputJsonValue,
        }),
      },
    });

    this.gateway.emit(args.userId, this.toView(row));

    // Refresh badge — single-recipient path also needs the count update.
    const unreadTotal = await this.countUnreadByIds(
      args.institutionId,
      args.userId,
    );
    this.gateway.emitUnreadCount(args.userId, unreadTotal);

    if (args.type === NotificationType.SYSTEM_ANNOUNCEMENT) {
      await this.writeAuditLog(args.institutionId, null, args.type, row.id, {
        recipientUserId: args.userId,
      });
    }

    // Sprint 7.4 — mobile push fan-out. Asynchronous via BullMQ so this
    // critical-path write never waits on the external Expo API. Any
    // failure inside the enqueue path is logged and swallowed (the in-app
    // notification already shipped via the WebSocket emit above).
    void this.enqueuePushForRecipients(args.institutionId, [
      {
        userId: args.userId,
        notification: this.toView(row),
        unreadTotal,
      },
    ]).catch((err) => {
      this.logger.warn(
        `enqueuePushForRecipients (single) failed for user ${args.userId}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    });

    return row;
  }

  /**
   * Bulk fan-out — one row per recipient via `createMany`, then a single
   * `findMany` to recover the inserted rows so we can push WS events with
   * stable ids. Returns the inserted count and the typed rows.
   *
   * Used by notes-published, paper-published, AI_CREDITS_LOW (multi-admin),
   * and any future "broadcast to a list of users in one tenant" path.
   */
  async notifyMany(args: {
    institutionId: string;
    userIds: string[];
    type: NotificationType;
    title: string;
    body?: string;
    metadata?: Record<string, unknown>;
    link?: string;
  }): Promise<{ count: number; notifications: Notification[] }> {
    if (args.userIds.length === 0) {
      return { count: 0, notifications: [] };
    }

    // Dedupe userIds so a misconfigured caller can't double-notify.
    const uniqueUserIds = [...new Set(args.userIds)];

    // Tag the metadata with a fan-out batch id so we can recover the rows
    // we just inserted in one query (createMany doesn't return ids on
    // PostgreSQL through Prisma until the 5.x driver, which we don't have
    // pinned). Cheap, deterministic, and removed in toView so it doesn't
    // leak to clients.
    const batchId = crypto.randomUUID();
    const enrichedMetadata: Record<string, unknown> = {
      ...(args.metadata ?? {}),
      _batchId: batchId,
    };

    await this.prisma.notification.createMany({
      data: uniqueUserIds.map((userId) => ({
        institutionId: args.institutionId,
        userId,
        type: args.type,
        title: args.title,
        ...(args.body !== undefined && { body: args.body }),
        ...(args.link !== undefined && { link: args.link }),
        metadata: enrichedMetadata as Prisma.InputJsonValue,
      })),
    });

    const rows = await this.prisma.notification.findMany({
      where: {
        institutionId: args.institutionId,
        type: args.type,
        userId: { in: uniqueUserIds },
        // We can't filter on JSON _batchId portably in Prisma without
        // raw SQL — instead we filter by recent createdAt + the unique
        // (institutionId, userId, type) combo we just emitted. To keep
        // determinism without a JSON filter we sort by createdAt desc
        // and take userIds.length most recent.
      },
      orderBy: { createdAt: 'desc' },
      take: uniqueUserIds.length,
    });

    // Defensive — only the rows that match our batchId should fire WS
    // events. Filter on metadata client-side to avoid cross-talk if the
    // same caller fans out twice in the same millisecond.
    const ours = rows.filter((r) => {
      const meta = r.metadata as Record<string, unknown> | null;
      return (
        meta !== null &&
        typeof meta === 'object' &&
        meta['_batchId'] === batchId
      );
    });

    const emits = ours.map((r) => ({
      recipientUserId: r.userId,
      notification: this.toView(r),
    }));
    this.gateway.emitBulk(emits);

    // Refresh badge for each recipient. We issue one count() per user,
    // which is fine for the fan-out scales we expect (≤200 students per
    // classroom). If we ever fan-out to thousands, batch this.
    const unreadByUser = new Map<string, number>();
    await Promise.all(
      ours.map(async (r) => {
        const unreadTotal = await this.countUnreadByIds(
          r.institutionId,
          r.userId,
        );
        unreadByUser.set(r.userId, unreadTotal);
        this.gateway.emitUnreadCount(r.userId, unreadTotal);
      }),
    );

    if (args.type === NotificationType.SYSTEM_ANNOUNCEMENT) {
      await this.writeAuditLog(
        args.institutionId,
        null,
        args.type,
        null,
        {
          recipientCount: ours.length,
          batchId,
        },
      );
    }

    // Sprint 7.4 — mobile push fan-out. Async via BullMQ so the original
    // notifyMany call returns immediately. The fan-out runs per
    // (institution + batch); each user's badge count is read from the
    // map above so the Expo `badge` field stays accurate.
    const pushPayloads = ours.map((r) => ({
      userId: r.userId,
      notification: this.toView(r),
      unreadTotal: unreadByUser.get(r.userId) ?? 0,
    }));
    void this.enqueuePushForRecipients(
      args.institutionId,
      pushPayloads,
      batchId,
    ).catch((err) => {
      this.logger.warn(
        `enqueuePushForRecipients (bulk batch=${batchId}) failed: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    });

    return { count: ours.length, notifications: ours };
  }

  /**
   * Emit AI_CREDITS_LOW to every institution admin the FIRST time monthly
   * usage crosses 80%. Idempotent within a calendar month — re-calling does
   * nothing once the notification has been created.
   *
   * Designed to be called from `AiChatService.persistAssistantResponse`
   * (and any future credit-incrementing path) after the credit increment
   * has been committed.
   */
  async maybeNotifyCreditsLow(institutionId: string): Promise<void> {
    try {
      const subscription = await this.prisma.subscription.findFirst({
        where: { institutionId, status: SubscriptionStatus.ACTIVE },
        orderBy: { startedAt: 'desc' },
      });
      if (!subscription) return;
      if (subscription.aiCreditsMonthly === 0) return;

      const usedPercent =
        subscription.aiCreditsUsed / subscription.aiCreditsMonthly;
      if (usedPercent < 0.8) return;

      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);

      const existing = await this.prisma.notification.findFirst({
        where: {
          institutionId,
          type: NotificationType.AI_CREDITS_LOW,
          createdAt: { gte: monthStart },
        },
        select: { id: true },
      });
      if (existing) return;

      const adminIds = await this.getInstitutionAdminIds(institutionId);
      if (adminIds.length === 0) return;

      const percentage = Math.round(usedPercent * 100);
      await this.notifyMany({
        institutionId,
        userIds: adminIds,
        type: NotificationType.AI_CREDITS_LOW,
        title: 'AI credits running low',
        body:
          `Your institution has used ${percentage}% of this month's AI ` +
          `credits. Upgrade your plan before generation requests are blocked.`,
        metadata: {
          subscriptionId: subscription.id,
          usedPercent,
        },
      });
    } catch (err) {
      // Best effort — never let a notification miss break the calling
      // chat / generation path. Log and move on.
      this.logger.warn(
        `maybeNotifyCreditsLow failed for institution ${institutionId}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Helpers                                                                  */
  /* ------------------------------------------------------------------------ */

  /**
   * Returns ids of every ADMIN / SUPER_ADMIN user in an institution. Used
   * by SYLLABUS_READY / SYLLABUS_FAILED / AI_CREDITS_LOW fan-outs.
   * Soft-deleted and non-ACTIVE accounts are excluded.
   */
  async getInstitutionAdminIds(institutionId: string): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: {
        institutionId,
        role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
        deletedAt: null,
        status: Status.ACTIVE,
      },
      select: { id: true },
    });
    return admins.map((a) => a.id);
  }

  private async countUnread(actor: User): Promise<number> {
    return this.countUnreadByIds(actor.institutionId, actor.id);
  }

  private async countUnreadByIds(
    institutionId: string,
    userId: string,
  ): Promise<number> {
    return this.prisma.notification.count({
      where: { institutionId, userId, readAt: null },
    });
  }

  /**
   * Projects a Prisma Notification row to the public view. Derives
   * `entityType` + `entityId` from the per-type map so the frontend can
   * deep-link without re-implementing the lookup. Strips internal helpers
   * (e.g. `_batchId`) from the surfaced metadata.
   */
  private toView(row: Notification): NotificationView {
    const rawMetadata = row.metadata as Record<string, unknown> | null;
    const metadata = this.cleanMetadata(rawMetadata);
    const map = NOTIFICATION_ENTITY_MAP[row.type];
    let entityId: string | null = null;
    if (map.metadataKey && metadata && typeof metadata === 'object') {
      const candidate = metadata[map.metadataKey];
      entityId = typeof candidate === 'string' ? candidate : null;
    }

    return {
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      link: row.link,
      metadata,
      readAt: row.readAt,
      entityType: map.entityType,
      entityId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Sprint 7.4 — fan a notification out to every Expo push token belonging
   * to the recipients. Async by design: enqueues a single BullMQ job
   * (chunking happens inside `ExpoPushService.sendBatch`).
   *
   * The push channel id is derived from the notification type so Android
   * routes the message into the right `Notifications.setNotificationChannelAsync`
   * channel ("notes" / "ai" / "system"). iOS ignores channelId.
   *
   * Multi-tenant scoping (CLAUDE.md §3): both `userId IN (...)` AND
   * `institutionId =` are used in the WHERE — defense in depth against
   * a future bug where a user is incorrectly attributed to another tenant.
   */
  private async enqueuePushForRecipients(
    institutionId: string,
    recipients: Array<{
      userId: string;
      notification: NotificationView;
      unreadTotal: number;
    }>,
    batchId?: string,
  ): Promise<void> {
    if (recipients.length === 0) return;

    const userIds = recipients.map((r) => r.userId);

    // Pull every active device token for the recipients in ONE query.
    // We filter on (institutionId, userId IN ...) — even though userId
    // alone scopes correctly, the redundant institutionId WHERE is the
    // defense-in-depth pattern used by every notification read+write.
    const devices = await this.prisma.deviceToken.findMany({
      where: {
        institutionId,
        userId: { in: userIds },
      },
      select: {
        userId: true,
        expoPushToken: true,
      },
    });
    if (devices.length === 0) {
      // No-op: no recipient has a registered device. Cheap exit before we
      // touch the queue.
      return;
    }

    // Index recipient payloads by userId so each device picks up the right
    // notification + badge count.
    const recipientByUserId = new Map(
      recipients.map((r) => [r.userId, r]),
    );

    const messages: ExpoPushMessage[] = [];
    for (const device of devices) {
      const recipient = recipientByUserId.get(device.userId);
      if (!recipient) continue;
      const view = recipient.notification;
      messages.push({
        to: device.expoPushToken,
        title: view.title,
        body: view.body ?? undefined,
        data: {
          notificationId: view.id,
          type: view.type,
          entityType: view.entityType,
          entityId: view.entityId,
          link: view.link,
        },
        channelId: this.expoPush.channelFor(view.type),
        sound: 'default',
        badge: recipient.unreadTotal,
        priority: 'default',
      });
    }

    if (messages.length === 0) return;

    await this.expoPushQueue.add(
      'send',
      {
        institutionId,
        ...(batchId !== undefined && { batchId }),
        messages,
      },
      {
        // Retry transient failures (network blips, 5xx). Permanent errors
        // like DeviceNotRegistered are handled inside the service and do
        // NOT cause a retry — the bad token is pruned and the receipt is
        // logged.
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 24 * 3600, count: 1000 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    );
  }

  private cleanMetadata(
    raw: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (!raw || typeof raw !== 'object') return null;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key.startsWith('_')) continue;
      out[key] = value;
    }
    return Object.keys(out).length > 0 ? out : null;
  }

  private async writeAuditLog(
    institutionId: string,
    actorId: string | null,
    type: NotificationType,
    entityId: string | null,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          institutionId,
          ...(actorId !== null && { actorId }),
          action: 'notification.send',
          entityType: 'Notification',
          ...(entityId !== null && { entityId }),
          metadata: { type, ...metadata } as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Audit log write failed (notification ${type}): ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }
}
