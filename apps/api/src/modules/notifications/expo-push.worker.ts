import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ExpoPushMessage, ExpoPushService } from './expo-push.service';

/**
 * BullMQ processor for the `expo-push` queue — Sprint 7.4.
 *
 * Why a queue?
 * ------------
 * `NotificationsService.notify` is on the critical path of every note
 * publish, every paper completion, every classroom join. The in-app
 * Notification row + Socket.IO emit MUST stay in lockstep with the
 * caller's transaction. The Expo Push API call, by contrast, talks to a
 * third party over the public internet with a >1s p99 — wrong place to
 * block the user's request.
 *
 * Enqueueing also gives us:
 *   • Retries with exponential backoff (BullMQ's `attempts` + `backoff`).
 *   • Visibility — failed jobs show up in the same dashboard as the OCR
 *     + syllabus pipelines.
 *   • A clean place to add rate-limiting later (Expo recommends batching
 *     anyway, but a global concurrency cap is a one-liner here).
 *
 * Topology — same as every other Sprint 0/4 worker
 * ------------------------------------------------
 * Runs in-process inside the main API for now. When traffic justifies a
 * split, the SAME Docker image launched via `main.worker.ts` picks this
 * processor up automatically (it imports AppModule, which re-imports
 * NotificationsModule).
 *
 * Job shape
 * ---------
 * One job = one batch of messages (already chunked by ExpoPushService into
 * ≤100-message arrays before enqueue). `NotificationsService` produces a
 * single job per fan-out so receipts can be correlated with the source
 * notification batch via the `batchId` field — useful when debugging from
 * the BullMQ dashboard.
 */
export interface ExpoPushJobData {
  /** Best-effort correlation id from the originating notify/notifyMany. */
  batchId?: string;
  /**
   * Tenant id of the source notification. Carried so the worker logs
   * are tagged the same way HTTP request logs are (CLAUDE.md §3 — every
   * job carries institutionId for multi-tenant observability).
   */
  institutionId: string;
  messages: ExpoPushMessage[];
}

@Processor('expo-push')
export class ExpoPushWorker extends WorkerHost {
  private readonly logger = new Logger(ExpoPushWorker.name);

  constructor(private readonly expoPush: ExpoPushService) {
    super();
  }

  async process(job: Job<ExpoPushJobData>): Promise<void> {
    if (job.name !== 'send') {
      this.logger.warn(
        `Unhandled job name "${job.name}" on expo-push queue; skipping.`,
      );
      return;
    }

    const { messages, institutionId, batchId } = job.data;
    if (!messages || messages.length === 0) {
      // Nothing to do — caller fanned out to a user list with no active
      // device tokens. Cheap to skip.
      return;
    }

    const summary = await this.expoPush.sendBatch(messages);

    this.logger.log(
      `expo-push batch=${batchId ?? '(none)'} institution=${institutionId} ` +
        `sent=${summary.sent} transient=${summary.failedTransient} ` +
        `permanent=${summary.failedPermanent}`,
    );
  }
}
