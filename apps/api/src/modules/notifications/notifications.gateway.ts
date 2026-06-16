import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { User } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NotificationCreatedEvent,
  NotificationUnreadCountEvent,
  NotificationView,
  NOTIFICATION_EVENTS,
} from './notifications.types';

/**
 * Notifications gateway — Sprint 6 PROMPT 22.
 *
 * Socket.IO transport for real-time notification delivery. Lives on the
 * `/notifications` namespace at the `/socket.io` path so a single Vercel
 * preview / Railway deploy can host both REST and WS on the same origin.
 *
 * Auth handshake (CLAUDE.md §3 — institutionId derived from token, never
 * from the client):
 *
 *   1. Read `socket.handshake.auth.token` (preferred) or `?token=` query
 *      string. Reject with `disconnect()` if absent.
 *   2. Call `SupabaseService.admin.auth.getUser(token)` — same validation
 *      path as `JwtAuthGuard` so a token that works for REST also works
 *      for WS.
 *   3. Look up the local Prisma user. Reject soft-deleted accounts.
 *   4. Join two rooms:
 *        • `user:{user.id}`            → direct fan-out (NotificationsService.emit)
 *        • `institution:{user.institutionId}` → tenant-wide broadcasts
 *          (SYSTEM_ANNOUNCEMENT, future ops hooks)
 *   5. Stash the loaded User on `socket.data.user` for downstream handlers.
 *
 * The handshake does NOT use a guard because Socket.IO connection lifecycle
 * is outside Nest's request pipeline — gates are enforced at the
 * `handleConnection` boundary instead.
 *
 * CORS uses the same patterns as the REST layer (localhost dev + *.vercel.app
 * preview deploys). Tighten in production via env-driven allowlist if we
 * ever expose this beyond the trusted browser surface.
 */
@WebSocketGateway({
  cors: {
    origin: [/^http:\/\/localhost:\d+$/, /^https:\/\/[a-z0-9-]+\.vercel\.app$/],
    credentials: true,
  },
  path: '/socket.io',
  namespace: 'notifications',
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly prisma: PrismaService,
  ) {}

  /* ------------------------------------------------------------------------ */
  /* Lifecycle hooks                                                          */
  /* ------------------------------------------------------------------------ */

  async handleConnection(socket: Socket): Promise<void> {
    try {
      const token = this.extractToken(socket);
      if (!token) {
        this.logger.debug(
          `WS handshake rejected — no token (socket ${socket.id})`,
        );
        socket.emit('error', { code: 'UNAUTHORIZED', message: 'Missing auth token' });
        socket.disconnect(true);
        return;
      }

      const { data, error } = await this.supabase.admin.auth.getUser(token);
      if (error || !data?.user) {
        this.logger.debug(
          `WS handshake rejected — bad token (socket ${socket.id}): ${
            error?.message ?? 'no user'
          }`,
        );
        socket.emit('error', { code: 'UNAUTHORIZED', message: 'Invalid token' });
        socket.disconnect(true);
        return;
      }

      const user = await this.prisma.user.findUnique({
        where: { id: data.user.id },
      });
      if (!user || user.deletedAt) {
        this.logger.debug(
          `WS handshake rejected — user not provisioned or deactivated (socket ${socket.id})`,
        );
        socket.emit('error', {
          code: 'UNAUTHORIZED',
          message: 'User profile is not provisioned',
        });
        socket.disconnect(true);
        return;
      }

      socket.data.user = user;
      await socket.join(this.userRoom(user.id));
      await socket.join(this.institutionRoom(user.institutionId));

      this.logger.log(
        `WS connected user=${user.id} institution=${user.institutionId} socket=${socket.id}`,
      );
    } catch (err) {
      this.logger.error(
        `WS handshake error (socket ${socket.id}): ` +
          (err instanceof Error ? err.message : String(err)),
        err instanceof Error ? err.stack : undefined,
      );
      socket.emit('error', { code: 'INTERNAL', message: 'Handshake failed' });
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket): void {
    const user = socket.data.user as User | undefined;
    if (user) {
      this.logger.debug(
        `WS disconnected user=${user.id} socket=${socket.id}`,
      );
    }
    // Socket.IO automatically removes the socket from all rooms on
    // disconnect — no manual leave() needed.
  }

  /* ------------------------------------------------------------------------ */
  /* Server → client emitters (called by NotificationsService)                */
  /* ------------------------------------------------------------------------ */

  /**
   * Push a single notification to its recipient. The event reaches every
   * socket the user has open across devices because Socket.IO broadcasts
   * to all sockets in `user:{id}` room.
   *
   * Failure is best-effort logged — losing a realtime event must NOT bubble
   * back into the caller's transaction. The REST list endpoint catches up
   * any client that reconnects mid-flight.
   */
  emit(recipientUserId: string, notification: NotificationView): void {
    if (!this.server) {
      // Worker-only mode (main.worker.ts uses createApplicationContext
      // and never binds the Socket.IO adapter). The notification was
      // persisted by the service; the realtime push simply isn't
      // available from a worker process. The user's next reconnect will
      // pick it up via the REST list endpoint.
      return;
    }
    try {
      const payload: NotificationCreatedEvent = { notification };
      this.server
        .to(this.userRoom(recipientUserId))
        .emit(NOTIFICATION_EVENTS.CREATED, payload);
    } catch (err) {
      this.logger.warn(
        `Failed to emit notification ${notification.id}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  /**
   * Bulk fan-out helper — used when one event creates dozens of recipient
   * notifications (e.g. NOTE_PUBLISHED to 50 students). Each row is sent
   * to its own room so a student in one classroom never sees another
   * classroom's payload by accident.
   */
  emitBulk(
    items: Array<{ recipientUserId: string; notification: NotificationView }>,
  ): void {
    for (const item of items) {
      this.emit(item.recipientUserId, item.notification);
    }
  }

  /**
   * Push the authoritative unread count to every socket a user has open.
   * Called by NotificationsService after mark-read / mark-all-read so the
   * bell badge updates without an extra REST round-trip.
   */
  emitUnreadCount(userId: string, unreadTotal: number): void {
    if (!this.server) return;
    try {
      const payload: NotificationUnreadCountEvent = { unreadTotal };
      this.server
        .to(this.userRoom(userId))
        .emit(NOTIFICATION_EVENTS.UNREAD_COUNT, payload);
    } catch (err) {
      this.logger.warn(
        `Failed to emit unread count for user ${userId}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  /**
   * Broadcast to every socket connected from a tenant — reserved for
   * SYSTEM_ANNOUNCEMENT (admin sends a message to the whole institution).
   * Not used by Sprint 6's automatic triggers, exposed so the controller
   * layer can hook in without a re-export later.
   */
  emitToInstitution(
    institutionId: string,
    event: string,
    payload: Record<string, unknown>,
  ): void {
    if (!this.server) return;
    try {
      this.server
        .to(this.institutionRoom(institutionId))
        .emit(event, payload);
    } catch (err) {
      this.logger.warn(
        `Failed to broadcast ${event} to institution ${institutionId}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Helpers                                                                  */
  /* ------------------------------------------------------------------------ */

  private extractToken(socket: Socket): string | null {
    // 1) `auth.token` from the Socket.IO client option.
    const authToken = socket.handshake.auth?.['token'];
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }
    // 2) `?token=` query string for browser clients without auth() support.
    const queryToken = socket.handshake.query?.['token'];
    if (typeof queryToken === 'string' && queryToken.length > 0) {
      return queryToken;
    }
    if (Array.isArray(queryToken) && queryToken[0]) {
      return queryToken[0];
    }
    // 3) Authorization: Bearer header — preserved for parity with REST.
    const authHeader = socket.handshake.headers['authorization'];
    if (typeof authHeader === 'string') {
      const [scheme, value] = authHeader.split(' ');
      if (scheme?.toLowerCase() === 'bearer' && value) {
        return value.trim();
      }
    }
    return null;
  }

  private userRoom(userId: string): string {
    return `user:${userId}`;
  }

  private institutionRoom(institutionId: string): string {
    return `institution:${institutionId}`;
  }

}
