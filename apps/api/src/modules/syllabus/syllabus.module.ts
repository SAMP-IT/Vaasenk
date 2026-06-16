import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { SyllabusController } from './syllabus.controller';
import { SyllabusService } from './syllabus.service';
import { SyllabusStorageService } from './syllabus-storage.service';
import { SyllabusWorker } from './syllabus.worker';

/**
 * Syllabus module — Sprint 3 PROMPT 15.
 *
 * Registers the per-module BullMQ queue (`syllabus`); the global Redis
 * connection lives in `BullModule.forRootAsync(...)` in `AppModule`. The
 * worker subscribes to the same queue and runs in-process for now
 * (Sprint 0/1 worker topology), but `main.worker.ts` re-loads this module
 * verbatim when we eventually split the API and worker services.
 */
@Module({
  imports: [BullModule.registerQueue({ name: 'syllabus' })],
  controllers: [SyllabusController],
  providers: [SyllabusService, SyllabusStorageService, SyllabusWorker],
  exports: [SyllabusService],
})
export class SyllabusModule {}
