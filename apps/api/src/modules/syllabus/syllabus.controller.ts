import {
  Body,
  Controller,
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
  ListMappedClassroomsDto,
  ListSyllabusDto,
  MapSyllabusDto,
  UpdateSyllabusDto,
  UploadSyllabusDto,
} from './syllabus.dto';
import { SyllabusService } from './syllabus.service';

/**
 * Syllabus — Sprint 3 PROMPT 15.
 *
 * URL surface:
 *   POST   /syllabus                       upload a PDF (admin only)
 *   GET    /syllabus                       list with filters
 *   GET    /syllabus/:id                   detail + signed URL + timeline
 *   PATCH  /syllabus/:id                   metadata OR file replacement (dual-shape)
 *   POST   /syllabus/:id/map               map syllabus to classroom(s)
 *   GET    /syllabus/:id/classrooms        list mapped classrooms (paginated)
 *   POST   /syllabus/:id/reprocess         re-run extraction
 *
 * RBAC: ADMIN + SUPER_ADMIN only. Teachers/students discover syllabus
 * indirectly via their classrooms (Sprint 4 will surface chunks in the
 * teacher chatbot path).
 */
@ApiTags('syllabus')
@Controller('syllabus')
export class SyllabusController {
  constructor(private readonly syllabus: SyllabusService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('supabase-jwt')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        name: { type: 'string', minLength: 2, maxLength: 200 },
        boardType: { type: 'string', maxLength: 60 },
        classId: { type: 'string', format: 'uuid' },
        subjectId: { type: 'string', format: 'uuid' },
        language: { type: 'string', maxLength: 60 },
        version: { type: 'string', maxLength: 40 },
      },
    },
  })
  @ApiOperation({
    summary: 'Upload a syllabus PDF (25 MB max; PDFs only)',
    description:
      'Storage path: {institutionId}/syllabus/{syllabusId}/{filename}. ' +
      'Status starts at UPLOADED and advances to PROCESSING when the worker picks it up.',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
    }),
  )
  upload(
    @CurrentUser() user: User,
    @Body() dto: UploadSyllabusDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.syllabus.upload(user, dto, file);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'List syllabus library (paginated, filterable)',
  })
  list(@CurrentUser() user: User, @Query() query: ListSyllabusDto) {
    return this.syllabus.list(user, query);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Get syllabus detail with signed URL + processing timeline',
  })
  detail(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.syllabus.detail(user, id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    description:
      'Two shapes: ' +
      '(a) metadata-only update (any subset of fields), or ' +
      '(b) file replacement (supply `file`, which creates a new version row and archives the old).',
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        name: { type: 'string', minLength: 2, maxLength: 200 },
        boardType: { type: 'string', maxLength: 60 },
        classId: { type: 'string', format: 'uuid' },
        subjectId: { type: 'string', format: 'uuid' },
        language: { type: 'string', maxLength: 60 },
        version: { type: 'string', maxLength: 40 },
        isActive: { type: 'boolean' },
      },
    },
  })
  @ApiOperation({
    summary: 'Update syllabus metadata, or replace the PDF (new version row)',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  update(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSyllabusDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.syllabus.update(user, id, dto, file);
  }

  @Post(':id/map')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Map this syllabus to one or more classrooms',
  })
  map(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: MapSyllabusDto,
  ) {
    return this.syllabus.mapToClassrooms(user, id, dto);
  }

  @Get(':id/classrooms')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'List classrooms currently mapped to this syllabus (paginated)',
  })
  listClassrooms(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ListMappedClassroomsDto,
  ) {
    return this.syllabus.listMappedClassrooms(user, id, query);
  }

  @Post(':id/reprocess')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Re-trigger PDF extraction (only when status is FAILED or AI_READY)',
  })
  reprocess(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.syllabus.reprocess(user, id);
  }
}
