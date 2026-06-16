import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PaperPdfService } from './paper-pdf.service';
import { PapersStorageService } from './papers-storage.service';
import {
  ClassroomQuestionPapersController,
  QuestionPapersController,
} from './question-papers.controller';
import { QuestionPapersService } from './question-papers.service';
import { QuestionPapersWorker } from './question-papers.worker';

/**
 * Question Papers module — Sprint 5 PROMPT 20.
 *
 * Registers the per-module BullMQ queue (`question-papers`); the global
 * Redis connection lives in `BullModule.forRootAsync(...)` in `AppModule`.
 * The worker subscribes to the same queue and runs in-process for now
 * (Sprint 0/1 worker topology) — `main.worker.ts` re-loads this module
 * verbatim when we split the API and worker services in Sprint 4+.
 *
 * Imports `@vaasenk/ai` (registered globally in AppModule) for `ChatService`
 * + `RagService`. No need to re-import `AiModule` here because it's `@Global()`.
 */
@Module({
  imports: [BullModule.registerQueue({ name: 'question-papers' })],
  controllers: [ClassroomQuestionPapersController, QuestionPapersController],
  providers: [
    QuestionPapersService,
    QuestionPapersWorker,
    PaperPdfService,
    PapersStorageService,
  ],
  exports: [QuestionPapersService],
})
export class QuestionPapersModule {}
