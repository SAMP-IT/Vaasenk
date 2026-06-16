import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ClassroomsModule } from '../classrooms/classrooms.module';
import {
  ClassroomNotesController,
  NotesController,
} from './notes.controller';
import { NotesService } from './notes.service';
import { NotesStorageService } from './notes-storage.service';
import { NotesWorker } from './notes.worker';

@Module({
  imports: [
    ClassroomsModule, // ClassroomsService.assertVisible is used for scope checks
    BullModule.registerQueue({ name: 'notes' }),
  ],
  controllers: [ClassroomNotesController, NotesController],
  providers: [NotesService, NotesStorageService, NotesWorker],
  exports: [NotesService],
})
export class NotesModule {}
