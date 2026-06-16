import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

/**
 * BullMQ processor for the `notes` queue.
 *
 * Sprint 2 ships a stub: we accept the OCR job and log receipt so the
 * upload pipeline can be exercised end-to-end. Sprint 4 wires the actual
 * OCR + embedding flow (see Vaasenk Development Playbook §4).
 *
 * Per vaasenk-api SKILL.md §9, every job payload carries `institutionId`
 * so the worker can re-derive multi-tenant scope without leaning on
 * controller-bound context (which doesn't exist at job-execution time).
 */
interface NoteOcrJobData {
  noteId: string;
  institutionId: string;
  classroomId: string;
  filePath: string | null;
}

@Processor('notes')
export class NotesWorker extends WorkerHost {
  private readonly logger = new Logger(NotesWorker.name);

  async process(job: Job<NoteOcrJobData>): Promise<void> {
    if (job.name === 'ocr') {
      const { noteId, institutionId } = job.data;
      this.logger.log(
        `OCR job received for note ${noteId} (institution ${institutionId}); processor stubbed for Sprint 4.`,
      );
      return;
    }

    this.logger.warn(
      `Unhandled job name "${job.name}" on notes queue; skipping.`,
    );
  }
}
