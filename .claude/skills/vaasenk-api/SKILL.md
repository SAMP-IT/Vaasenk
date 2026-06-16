---
name: vaasenk-api
description: Use when creating, editing, or reviewing ANY NestJS module, controller, service, DTO, guard, interceptor, BullMQ worker, or Prisma access in apps/api (Vaasenk monorepo). Enforces the non-negotiable multi-tenant scoping rules from CLAUDE.md §3, role-based access control via @Roles, class-validator DTOs with proper bounds, the standard {data,meta}/{error,code,message} response envelope from CLAUDE.md §5, Vaasenk URL naming conventions from §7, file-upload + signed-URL patterns, BullMQ job patterns that carry institutionId, and the AI service-layer rules from §6. Invoke whenever the work touches apps/api/src/**, packages/db/**, or any backend HTTP/queue surface.
---

# Vaasenk API Skill

Authoritative spec lives in `CLAUDE.md` §3 (Multi-Tenancy — MANDATORY), §5 (Code Standards), §6 (AI Pipeline Rules), §7 (API Naming Conventions). This skill compresses those into working patterns. Use it for every backend file you touch.

## 1. Multi-tenant scoping — CRITICAL (CLAUDE.md §3)

Non-negotiable. Cross-institution data leakage is a P0 security bug.

```ts
// Controller — institutionId comes from JWT, NEVER from body/params/query
@Get()
list(@CurrentUser() user: User) {
  return this.service.list(user.institutionId);
}

// Service — every Prisma query carries institutionId in WHERE
async list(institutionId: string) {
  return this.prisma.note.findMany({
    where: {
      institutionId,        // ALWAYS first in the WHERE clause
      deletedAt: null,      // ALWAYS exclude soft-deleted
    },
    orderBy: { createdAt: 'desc' },
  });
}

// File operations — path always starts with institutionId
const path = `${institutionId}/${classroomId}/${noteId}/${filename}`;

// Vector store / AI ops — namespace always includes institutionId
const namespace = `inst_${institutionId}_syl_${syllabusId}`;
```

NEVER trust `req.body.institutionId` or `req.params.institutionId`. Always derive from `@CurrentUser()`.

When reviewing your own code: every `prisma.*.{findMany,findUnique,findFirst,update,delete,create}` call must carry `institutionId` (either directly in `where:` for reads, or in `data:` for creates).

## 2. Standard module skeleton

When asked to "create the X module," produce these 4 files in `apps/api/src/modules/{name}/`:

```
{name}.module.ts        @Module declaration; imports/providers/controllers/exports
{name}.controller.ts    HTTP handlers; ONE method per endpoint
{name}.service.ts       Business logic + Prisma queries; institutionId-first
{name}.dto.ts           Request DTOs with class-validator decorators
```

For larger modules add:

```
{name}.types.ts         Return type aliases / view models
{name}.worker.ts        BullMQ processor (only when the module owns a queue)
```

When a module owns a queue, register it in the module:

```ts
imports: [BullModule.registerQueue({ name: 'syllabus' })],
```

## 3. Controller pattern (copy-paste)

```ts
@ApiTags('classrooms')
@Controller('classrooms')
export class ClassroomsController {
  constructor(private readonly service: ClassroomsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({ summary: 'List classrooms visible to the current user' })
  list(@CurrentUser() user: User, @Query() query: ListClassroomsDto) {
    return this.service.list(user, query);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a classroom' })
  create(@CurrentUser() user: User, @Body() dto: CreateClassroomDto) {
    return this.service.create(user.institutionId, user.id, dto);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT)
  @ApiBearerAuth('supabase-jwt')
  detail(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.detail(user, id);
  }
}
```

Rules:
- Every protected route gets `@Roles(...)` — the global `RolesGuard` enforces it.
- Use `@CurrentUser()` (NOT `@Req()`). Never reach into the raw request.
- Use `@Public()` for routes that bypass JWT (e.g., `POST /auth/login`).
- `@ApiBearerAuth('supabase-jwt')` + `@ApiOperation` on every endpoint → Swagger.
- `@HttpCode()` for non-default status codes (201 on POST, 202 on async kickoff, 204 on DELETE).
- `ParseUUIDPipe` on every UUID path parameter.

## 4. DTO + validation pattern (CLAUDE.md §5)

```ts
export class CreateClassroomDto {
  @IsString() @MinLength(2) @MaxLength(120)
  name!: string;

  @IsUUID() classId!: string;

  @IsOptional() @IsUUID() sectionId?: string;

  @IsUUID() subjectId!: string;

  @IsUUID() teacherId!: string;

  @IsOptional() @IsUUID() syllabusId?: string;
}

export class ListClassroomsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number = 20;

  @IsOptional() @IsString() @MaxLength(120)
  search?: string;

  @IsOptional() @IsEnum(Status)
  status?: Status;
}
```

Rules:
- Every property gets at least one validator. Properties with no validator are forbidden (will fail the global `ValidationPipe { forbidNonWhitelisted: true }`).
- Free-text strings ALWAYS get `@MaxLength` — DoS defense.
- Numeric query params need `@Type(() => Number)` from `class-transformer` (URL params are strings until coerced).
- For shapes also used on the frontend, mirror them in `packages/shared-types/` as Zod schemas.

## 5. Response envelope (CLAUDE.md §5)

The global `ResponseInterceptor` wraps every successful response. Services return the INNER shape:

```ts
// Single object — return the entity
return { id: '...', name: '...' };
// becomes { data: { id, name } }

// Paginated list — return data + meta, the interceptor passes through unchanged
return {
  data: rows,
  meta: { page, limit, total },
};

// 204 No Content — return nothing (or undefined)
```

Errors throw `HttpException` subclasses:
- `BadRequestException` (400) — validation / bad input
- `UnauthorizedException` (401) — auth missing / invalid
- `ForbiddenException` (403) — auth OK, role/scope insufficient
- `NotFoundException` (404)
- `ConflictException` (409) — unique constraint / duplicate
- `UnprocessableEntityException` (422) — semantic invalid
- `PayloadTooLargeException` (413)
- `NotImplementedException` (501) — endpoint exists but stub

The global `HttpExceptionFilter` formats them as `{ error: { code, message, details? } }`. NEVER call `res.status().json()` directly.

## 6. RBAC matrix (default)

| Role | Sees |
|---|---|
| `SUPER_ADMIN` | All institutions (cross-tenant) |
| `ADMIN` | Their institution (everything inside) |
| `TEACHER` | Their institution + only classrooms they're assigned to |
| `STUDENT` | Their institution + only classrooms they're enrolled in |

Enforce the "only assigned/enrolled" rule via WHERE clauses in the service:

```ts
const where: Prisma.ClassroomWhereInput = {
  institutionId,
  status: 'ACTIVE',
};
if (user.role === UserRole.TEACHER) {
  where.teacherId = user.id;
}
if (user.role === UserRole.STUDENT) {
  where.members = { some: { userId: user.id, status: 'ACTIVE' } };
}
return this.prisma.classroom.findMany({ where });
```

Never rely on `@Roles(...)` alone for tenant scoping — `@Roles()` gates ENTRY to the handler, not the data inside it.

## 7. URL naming (CLAUDE.md §7)

```
GET    /api/v1/{resources}             list (paginated)
GET    /api/v1/{resources}/:id         single
POST   /api/v1/{resources}             create
PATCH  /api/v1/{resources}/:id         partial update
DELETE /api/v1/{resources}/:id         soft delete

Nested: /api/v1/classrooms/:id/notes
Actions (POST): /api/v1/question-papers/:id/generate
```

Global prefix `/api/v1` is set in `main.ts` (except `/health` + `/docs`). DON'T repeat it in `@Controller(...)`.

List endpoints always support `?page=1&limit=20&sort=createdAt:desc&search=keyword`.

## 8. File upload pattern

```ts
@Post(':id/notes')
@Roles(UserRole.TEACHER, UserRole.ADMIN)
@UseInterceptors(FileInterceptor('file', {
  limits: { fileSize: 25 * 1024 * 1024 },  // 25 MB hard limit
}))
async upload(
  @CurrentUser() user: User,
  @Param('id', new ParseUUIDPipe()) classroomId: string,
  @Body() dto: UploadNoteDto,
  @UploadedFile() file: Express.Multer.File,
) {
  validateMimeType(file.mimetype, ['image/jpeg', 'image/png', 'application/pdf']);

  // Compress images > 5 MB (sharp).
  const buffer =
    file.mimetype.startsWith('image/') && file.size > 5 * 1024 * 1024
      ? await sharp(file.buffer)
          .resize(2048, 2048, { fit: 'inside' })
          .jpeg({ quality: 85 })
          .toBuffer()
      : file.buffer;

  const noteId = randomUUID();
  const path = `${user.institutionId}/${classroomId}/${noteId}/${file.originalname}`;
  await this.storage.upload(path, buffer);
  return this.service.createNote(user, classroomId, { ...dto, path, noteId });
}
```

Rules:
- MIME validation server-side (NEVER trust client).
- 25 MB max via Multer limits.
- Compress images > 5 MB (sharp).
- Storage path ALWAYS starts with `institutionId`.
- Return signed URLs (1h expiry) — NEVER raw storage paths.

## 9. BullMQ job pattern

```ts
// In the module
imports: [BullModule.registerQueue({ name: 'syllabus' })],

// In the service — enqueue a job
constructor(@InjectQueue('syllabus') private readonly syllabusQueue: Queue) {}

async startProcessing(syllabusId: string, institutionId: string) {
  await this.syllabusQueue.add(
    'process',
    {
      syllabusId,
      institutionId,                    // ALWAYS in payload — workers re-derive scope
      fileUrl: '...',
    },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
      jobId: `syllabus:${syllabusId}`,  // dedupe key
    },
  );
}

// In the worker
@Processor('syllabus')
export class SyllabusWorker extends WorkerHost {
  async process(job: Job<{ syllabusId: string; institutionId: string; fileUrl: string }>) {
    const { syllabusId, institutionId } = job.data;
    // Every query inside still scopes by institutionId.
  }
}
```

Every job payload carries `institutionId`. Workers re-derive scope from `job.data`, never from shared state or the calling controller's context (controller context doesn't exist by the time the worker runs).

## 10. AI calls (CLAUDE.md §6)

All AI work goes through `packages/ai/`. Apps NEVER import `openai`, `@anthropic-ai/sdk`, or `@ai-sdk/*` directly.

Every AI request includes: `institutionId`, `classroomId`, `syllabusId`, `userId`. Token usage logs to `ai_usage_logs` with the same scoping.

```ts
import { ragChat } from '@vaasenk/ai';

const stream = await ragChat.stream({
  institutionId,
  classroomId,
  syllabusId,
  userId: user.id,
  message: dto.message,
});
// Stream via SSE in the controller. Log totals to ai_usage_logs.
```

Chat responses stream (SSE); paper generation polls (BullMQ job + status endpoint).

Always include the disclaimer in any user-facing AI surface: "AI can make mistakes. Verify important information." (Component layer responsibility, but the API should NEVER omit citations when they're available.)

Set hard per-plan AI credit limits — enforce in a guard before kicking off generation.

## 11. Auditing

Log sensitive actions to `audit_logs`. Fields: `institutionId`, `actorId` (the calling user), `action` (free-form string: 'create' | 'update' | 'delete' | 'generate' | 'login' | 'invite' | 'export' | ...), `entityType`, `entityId`, `metadata` (Json), `ipAddress`, `userAgent`. Call this from the service, not the controller.

Audit-worthy actions: institution updates, user creates/deletes, role changes, classroom create/delete, note delete by admin, syllabus replace, paper publish, subscription change, export, login, password reset.

## 12. Soft-delete convention

`User.deletedAt` is the only soft-delete column we ship in Sprint 0-1. Don't add soft-delete fields elsewhere unless the user asks. For users:

```ts
// Read — always exclude soft-deleted
where: { id, institutionId, deletedAt: null }

// Soft-delete
this.prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });

// Hard delete on cascade — only when the parent institution is removed
```

## 13. Common imports cheat sheet

```ts
import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param,
  ParseUUIDPipe, Patch, Post, Query, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { Prisma, UserRole, type User } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseService } from '../../common/supabase/supabase.service';
```

## 14. Quality gate before declaring "done" (run this as Reality Checker)

1. Is `institutionId` in every `where:` and every job payload?
2. Is `@Roles(...)` on every non-public endpoint (and `@Public()` on the deliberate ones)?
3. Is every DTO property validated AND bounded (`@MaxLength` on free text)?
4. Does every success path return either `{ data }` (the interceptor wraps) or `{ data, meta }` (already-shaped)?
5. Does every error path throw an `HttpException` subclass (not a plain `Error`)?
6. Are file URLs signed (not raw storage paths)?
7. Are AI calls routed through `packages/ai/`?
8. If this touched a sensitive action — is there an `audit_logs` write?
9. Are UUIDs validated via `ParseUUIDPipe`?
10. For new endpoints — is `@ApiBearerAuth('supabase-jwt')` + `@ApiOperation` present so Swagger reflects reality?
