import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

/**
 * Worker-only entry point.
 *
 * For Sprint 0 / Sprint 1, BullMQ processors run in-process within the main
 * API server (see `main.ts`). This file exists so the SAME Docker image can
 * be deployed as a second Railway service running ONLY the workers — no
 * HTTP listener — when traffic justifies the split (Sprint 4+).
 *
 * Behaviour:
 *   • Creates a Nest application context (no HTTP listener).
 *   • Loads `AppModule`, which registers BullMQ processors via
 *     `@nestjs/bullmq`. Processors begin draining their queues immediately.
 *   • Stays alive via the application context — there is no `app.listen()`.
 *
 * Deployment (when split):
 *   Railway service "vaasenk-worker"
 *     image:  same as the API image (apps/api/Dockerfile)
 *     start:  node dist/main.worker.js   (or `npm run start:worker`)
 *
 * See CLAUDE.md §2 (Locked Technical Decisions — Worker Topology).
 */
const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });

  const logger = new Logger('Worker');

  // Graceful shutdown so BullMQ processors finish in-flight jobs.
  app.enableShutdownHooks();

  const stop = async (signal: NodeJS.Signals): Promise<void> => {
    logger.log(`Received ${signal} — closing worker context.`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void stop('SIGTERM'));
  process.on('SIGINT', () => void stop('SIGINT'));

  logger.log('Vaasenk worker running (worker-only mode — no HTTP listener).');
};

void bootstrap();
