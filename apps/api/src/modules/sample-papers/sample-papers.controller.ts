import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole, type User } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  ListSamplePapersDto,
  UpdateSamplePaperDto,
  UploadSamplePaperDto,
} from './sample-papers.dto';
import { SamplePapersService } from './sample-papers.service';

/**
 * Sample papers — Sprint 3 PROMPT 15.
 *
 * URL surface:
 *   POST   /sample-papers                upload (admin only)
 *   GET    /sample-papers                list with filters
 *   GET    /sample-papers/:id            detail + signed URL + timeline
 *   PATCH  /sample-papers/:id            metadata OR file replacement
 *   POST   /sample-papers/:id/reprocess  re-run extraction
 *   DELETE /sample-papers/:id            soft delete
 *
 * Mapping to classrooms happens at question-paper-generation time
 * (Sprint 5) — no /map endpoint here.
 */
@ApiTags('sample-papers')
@Controller('sample-papers')
export class SamplePapersController {
  constructor(private readonly samplePapers: SamplePapersService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('supabase-jwt')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'examType', 'file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        name: { type: 'string', minLength: 2, maxLength: 200 },
        examType: {
          type: 'string',
          enum: [
            'UNIT_TEST',
            'MONTHLY_TEST',
            'QUARTERLY',
            'HALF_YEARLY',
            'ANNUAL',
            'REVISION_TEST',
            'CUSTOM',
          ],
        },
        year: { type: 'integer', minimum: 2000, maximum: 2100 },
        term: { type: 'string', maxLength: 40 },
        boardType: { type: 'string', maxLength: 60 },
        classId: { type: 'string', format: 'uuid' },
        subjectId: { type: 'string', format: 'uuid' },
        syllabusId: { type: 'string', format: 'uuid' },
        priority: { type: 'string', enum: ['high', 'normal', 'archive'] },
      },
    },
  })
  @ApiOperation({
    summary: 'Upload a sample question paper PDF (25 MB max)',
    description:
      'Storage path: {institutionId}/sample-papers/{paperId}/{filename}. ' +
      'Status starts at UPLOADED and advances to PROCESSING when the worker picks it up.',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  upload(
    @CurrentUser() user: User,
    @Body() dto: UploadSamplePaperDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.samplePapers.upload(user, dto, file);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'List sample papers library (paginated, filterable)',
  })
  list(@CurrentUser() user: User, @Query() query: ListSamplePapersDto) {
    return this.samplePapers.list(user, query);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Get sample paper detail with signed URL + processing timeline',
  })
  detail(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.samplePapers.detail(user, id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    description:
      'Two shapes: (a) metadata-only update, or (b) file replacement (supply `file`).',
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        name: { type: 'string', minLength: 2, maxLength: 200 },
        examType: {
          type: 'string',
          enum: [
            'UNIT_TEST',
            'MONTHLY_TEST',
            'QUARTERLY',
            'HALF_YEARLY',
            'ANNUAL',
            'REVISION_TEST',
            'CUSTOM',
          ],
        },
        year: { type: 'integer', minimum: 2000, maximum: 2100 },
        term: { type: 'string', maxLength: 40 },
        boardType: { type: 'string', maxLength: 60 },
        classId: { type: 'string', format: 'uuid' },
        subjectId: { type: 'string', format: 'uuid' },
        syllabusId: { type: 'string', format: 'uuid' },
        priority: { type: 'string', enum: ['high', 'normal', 'archive'] },
      },
    },
  })
  @ApiOperation({
    summary: 'Update sample paper metadata, or replace the PDF in-place',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  update(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSamplePaperDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.samplePapers.update(user, id, dto, file);
  }

  @Post(':id/reprocess')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary:
      'Re-trigger PDF extraction (only when status is FAILED or AI_READY)',
  })
  reprocess(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.samplePapers.reprocess(user, id);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Soft delete a sample paper (extractionMeta.deletedAt marker)',
  })
  async delete(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.samplePapers.softDelete(user, id);
  }
}
