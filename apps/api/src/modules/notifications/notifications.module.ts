import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ExpoPushService } from './expo-push.service';
import { ExpoPushWorker } from './expo-push.worker';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';

/**
 * Notifications module — Sprint 6 PROMPT 22 + Sprint 7.4 push extension.
 *
 * Marked `@Global()` so any downstream module (notes, question-papers,
 * classrooms, syllabus worker, ai-chat) can `inject` `NotificationsService`
 * without re-importing the module. This avoids a fan-out of duplicate
 * imports across half the codebase and is consistent with `@vaasenk/ai`'s
 * registration in AppModule.
 *
 * The gateway also lives inside this module — it's instantiated by Nest's
 * Socket.IO platform adapter (configured in main.ts) and binds to the
 * `/notifications` namespace at `/socket.io`. The gateway and service
 * have a circular dep (service injects gateway for emit, gateway accesses
 * Prisma+Supabase but not the service) — resolved via `forwardRef`.
 *
 * Sprint 7.4 additions (mobile push):
 *   • `expo-push` BullMQ queue — async fan-out so the in-app notify path
 *     never blocks on the external Expo API.
 *   • ExpoPushService — chunks ≤100 messages per HTTP call, parses ticket
 *     receipts, prunes `device_tokens` rows flagged DeviceNotRegistered.
 *   • ExpoPushWorker — drains the queue. Runs in-process for now and will
 *     pick up automatically when main.worker.ts splits to a separate
 *     Railway service.
 *
 * Bootstrapping order:
 *   • main.ts calls `app.useWebSocketAdapter(new IoAdapter(app))` BEFORE
 *     `app.listen()` — see the same file where helmet/CORS are registered.
 */
@Global()
@Module({
  imports: [BullModule.registerQueue({ name: 'expo-push' })],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsGateway,
    ExpoPushService,
    ExpoPushWorker,
  ],
  exports: [NotificationsService, ExpoPushService],
})
export class NotificationsModule {}
