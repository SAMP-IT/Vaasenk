import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { SamplePapersController } from './sample-papers.controller';
import { SamplePapersService } from './sample-papers.service';
import { SamplePapersStorageService } from './sample-papers-storage.service';
import { SamplePapersWorker } from './sample-papers.worker';

/**
 * Sample papers module — Sprint 3 PROMPT 15.
 *
 * Registers the `sample-papers` BullMQ queue. Worker runs in-process for
 * now; the `main.worker.ts` entry point re-loads this module verbatim when
 * we eventually split API and worker services (Sprint 4+).
 */
@Module({
  imports: [BullModule.registerQueue({ name: 'sample-papers' })],
  controllers: [SamplePapersController],
  providers: [
    SamplePapersService,
    SamplePapersStorageService,
    SamplePapersWorker,
  ],
  exports: [SamplePapersService],
})
export class SamplePapersModule {}
