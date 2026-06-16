/**
 * ADVERSARIAL multi-tenant isolation + RBAC integration tests (HARDENED).
 *
 * Goal: prove (or disprove) that an actor scoped to institution A cannot READ
 * OR WRITE institution B's notes, classrooms, syllabus documents, users, or AI
 * chat history through ANY API endpoint — and that a STUDENT is blocked from
 * teacher/admin endpoints.
 *
 * HOW THE AUTH IS FAITHFUL (not faked away):
 * The ONLY thing stubbed is the external Supabase token-verification HTTP call.
 * `SupabaseService.admin.auth.getUser(token)` is overridden to return
 * `{ user: { id: token } }` — i.e. "Supabase says this token belongs to uid
 * <token>". Everything downstream is the REAL production code path: the REAL
 * JwtAuthGuard does the REAL Prisma user lookup and populates req.user, the
 * REAL RolesGuard enforces @Roles, and the REAL service-layer Prisma WHERE
 * clauses (`where: { institutionId: actor.institutionId, ... }`) enforce
 * tenancy. So a test request uses the target user's id AS the bearer token.
 *
 * WHERE TENANCY IS ACTUALLY ENFORCED (corrected after adversarial review):
 * Isolation is enforced by the SERVICE-LAYER WHERE clauses, NOT by
 * InstitutionScopeInterceptor — that interceptor only asserts req.institutionId
 * is PRESENT (a presence check), it does not inject scope or compare ids and
 * cannot block a cross-tenant read on its own. These tests therefore target
 * the service WHERE clauses directly.
 *
 * FALSE-PASS GUARDS:
 *   1. SAME-ROUTE POSITIVE CONTROLS — for every cross-tenant denial there is a
 *      paired control hitting the SAME route shape that returns 200 with the
 *      caller's OWN data. So a denial cannot be "route is broken / 404s for
 *      everyone"; it is specifically a cross-tenant access decision.
 *   2. NON-EMPTINESS — list-scoping checks ("must NOT contain B") are paired
 *      with an assertion that the same list DOES contain A's own row, so the
 *      "not contain B" check can never pass vacuously on an empty list.
 *   3. CONTENT-LEAK — denials assert the response body contains neither B's row
 *      id NOR B's distinctive secret strings (note title, AI message content,
 *      session title) — so a partial leak that hides the id but exposes the
 *      content still fails.
 *   4. WRITE ISOLATION — every cross-tenant mutation re-reads B's row from the
 *      DB AFTER the attempt and asserts it is UNCHANGED — so a write that
 *      returns a denial status but still mutated the row fails.
 *   5. NEGATIVE AUTH CONTROL — a well-formed-but-unprovisioned UUID token is
 *      rejected with a clean 401 (proves the guard gates real users, via
 *      findUnique -> null -> 401, not a blanket pass).
 */
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/common/supabase/supabase.service';
import {
  seedTwoInstitutions,
  cleanupTestInstitutions,
  type SeedResult,
} from './seed-two-institutions';

// Distinctive secrets planted by the seed — used for content-leak assertions.
const SECRET_B_NOTE_TITLE = 'Photosynthesis board notes (B)';
const SECRET_B_SESSION_TITLE = 'Lesson planning chat (B)';
const SECRET_B_MESSAGE = 'Confidential teacher question for institution B.';

// Stub: token IS the supabase user id. Whether that uid is a real, active user
// is decided by the REAL Prisma lookup inside JwtAuthGuard.
function supabaseStub() {
  return {
    admin: {
      auth: {
        getUser: async (token: string) => {
          if (typeof token === 'string' && token.length > 0) {
            return { data: { user: { id: token } }, error: null };
          }
          return { data: { user: null }, error: { message: 'no token' } };
        },
      },
    },
  };
}

describe('Multi-tenant isolation + RBAC (adversarial, hardened)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof app.getHttpServer>;
  let prisma: PrismaClient;
  let seed: SeedResult;

  const get = (url: string, actorId: string) =>
    request(http).get(url).set('Authorization', `Bearer ${actorId}`);
  const post = (url: string, actorId: string, body: unknown = {}) =>
    request(http).post(url).set('Authorization', `Bearer ${actorId}`).send(body);
  const patch = (url: string, actorId: string, body: unknown = {}) =>
    request(http).patch(url).set('Authorization', `Bearer ${actorId}`).send(body);
  const del = (url: string, actorId: string) =>
    request(http).delete(url).set('Authorization', `Bearer ${actorId}`);

  // A cross-tenant access must be DENIED with 403/404 (a recognised access
  // decision) — never 401 (auth broke) or 5xx (crash) — and must not leak the
  // forbidden id OR any of B's distinctive secret strings anywhere in the body.
  function expectDeniedAndNoLeak(
    res: request.Response,
    ...secrets: string[]
  ) {
    expect([403, 404]).toContain(res.status);
    const body = JSON.stringify(res.body);
    for (const secret of secrets) {
      expect(body).not.toContain(secret);
    }
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    seed = await seedTwoInstitutions(prisma);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SupabaseService)
      .useValue(supabaseStub())
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    http = app.getHttpServer();
  }, 60000);

  afterAll(async () => {
    await cleanupTestInstitutions(prisma);
    await prisma.$disconnect();
    if (app) await app.close();
  });

  // ---------------------------------------------------------------------------
  // 0. CONTROLS — prove the harness authenticates and reads real own-tenant data
  //    on EVERY route shape that a cross-tenant test later attacks.
  // ---------------------------------------------------------------------------
  describe('CONTROLS (same-route positive + negative)', () => {
    it('NEGATIVE: a well-formed but unprovisioned UUID token → clean 401', async () => {
      const res = await get(
        `/api/v1/classrooms/${seed.A.classroomId}`,
        randomUUID(),
      );
      expect(res.status).toBe(401);
    });

    it('NEGATIVE: a malformed (non-UUID) token id → clean 401, not 500', async () => {
      // Regression guard for the JwtAuthGuard robustness gap: a token id that
      // is not a valid UUID must be rejected cleanly (401), not crash the
      // Prisma UUID parse into a 500.
      const res = await get(
        `/api/v1/classrooms/${seed.A.classroomId}`,
        'this-is-not-a-uuid',
      );
      expect(res.status).toBe(401);
    });

    it('POSITIVE: A-admin reads A classroom detail (200)', async () => {
      const res = await get(
        `/api/v1/classrooms/${seed.A.classroomId}`,
        seed.A.adminId,
      );
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).toContain(seed.A.classroomId);
    });

    it('POSITIVE: A-student (enrolled) reads A classroom detail (200)', async () => {
      const res = await get(
        `/api/v1/classrooms/${seed.A.classroomId}`,
        seed.A.studentId,
      );
      expect(res.status).toBe(200);
    });

    it('POSITIVE: A-admin reads A classroom MEMBERS incl. A student (200)', async () => {
      const res = await get(
        `/api/v1/classrooms/${seed.A.classroomId}/members`,
        seed.A.adminId,
      );
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).toContain(seed.A.studentId);
    });

    it('POSITIVE: A-teacher lists A classroom notes incl. seeded note (200)', async () => {
      const res = await get(
        `/api/v1/classrooms/${seed.A.classroomId}/notes`,
        seed.A.teacherId,
      );
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).toContain(seed.A.noteId);
    });

    it('POSITIVE: A-teacher reads A note detail (200)', async () => {
      const res = await get(`/api/v1/notes/${seed.A.noteId}`, seed.A.teacherId);
      expect(res.status).toBe(200);
    });

    it('POSITIVE: A-admin reads A syllabus DETAIL (200)', async () => {
      const res = await get(
        `/api/v1/syllabus/${seed.A.syllabusId}`,
        seed.A.adminId,
      );
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).toContain(seed.A.syllabusId);
    });

    it('POSITIVE: A-admin lists syllabus incl. A syllabus (200, non-empty)', async () => {
      const res = await get('/api/v1/syllabus', seed.A.adminId);
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).toContain(seed.A.syllabusId);
    });

    it('POSITIVE: A-teacher lists A AI sessions incl. seeded session (200)', async () => {
      const res = await get(
        `/api/v1/classrooms/${seed.A.classroomId}/ai/sessions`,
        seed.A.teacherId,
      );
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).toContain(seed.A.sessionId);
    });

    it('POSITIVE: A-teacher reads A AI session DETAIL (200)', async () => {
      const res = await get(
        `/api/v1/classrooms/${seed.A.classroomId}/ai/sessions/${seed.A.sessionId}`,
        seed.A.teacherId,
      );
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).toContain(seed.A.sessionId);
    });

    it('POSITIVE: A-admin lists users incl. A teacher (200, non-empty)', async () => {
      const res = await get('/api/v1/users', seed.A.adminId);
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).toContain(seed.A.teacherId);
    });

    it('POSITIVE: A-admin lists classrooms incl. A classroom (200, non-empty)', async () => {
      const res = await get('/api/v1/classrooms', seed.A.adminId);
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).toContain(seed.A.classroomId);
    });
  });

  // ---------------------------------------------------------------------------
  // 1. READ ISOLATION — A actors must not READ B's data (+ no content leak)
  // ---------------------------------------------------------------------------
  describe('READ · Notes', () => {
    it('A-admin cannot read B note detail', async () => {
      const res = await get(`/api/v1/notes/${seed.B.noteId}`, seed.A.adminId);
      expectDeniedAndNoLeak(res, seed.B.noteId, SECRET_B_NOTE_TITLE);
    });
    it('A-teacher cannot read B note detail', async () => {
      const res = await get(`/api/v1/notes/${seed.B.noteId}`, seed.A.teacherId);
      expectDeniedAndNoLeak(res, seed.B.noteId, SECRET_B_NOTE_TITLE);
    });
    it('A-student cannot read B note detail', async () => {
      const res = await get(`/api/v1/notes/${seed.B.noteId}`, seed.A.studentId);
      expectDeniedAndNoLeak(res, seed.B.noteId, SECRET_B_NOTE_TITLE);
    });
    it('A-admin cannot list B classroom notes', async () => {
      const res = await get(
        `/api/v1/classrooms/${seed.B.classroomId}/notes`,
        seed.A.adminId,
      );
      expectDeniedAndNoLeak(res, seed.B.noteId, SECRET_B_NOTE_TITLE);
    });
  });

  describe('READ · Classrooms', () => {
    it('A-admin cannot read B classroom detail', async () => {
      const res = await get(
        `/api/v1/classrooms/${seed.B.classroomId}`,
        seed.A.adminId,
      );
      expectDeniedAndNoLeak(res, seed.B.classroomId);
    });
    it('A-teacher cannot read B classroom detail', async () => {
      const res = await get(
        `/api/v1/classrooms/${seed.B.classroomId}`,
        seed.A.teacherId,
      );
      expectDeniedAndNoLeak(res, seed.B.classroomId);
    });
    it('A-student cannot read B classroom detail', async () => {
      const res = await get(
        `/api/v1/classrooms/${seed.B.classroomId}`,
        seed.A.studentId,
      );
      expectDeniedAndNoLeak(res, seed.B.classroomId);
    });
    it('A-admin cannot read B classroom members', async () => {
      const res = await get(
        `/api/v1/classrooms/${seed.B.classroomId}/members`,
        seed.A.adminId,
      );
      expectDeniedAndNoLeak(res, seed.B.studentId);
    });
    it("A-admin's classroom list does NOT include B's classroom", async () => {
      const res = await get('/api/v1/classrooms', seed.A.adminId);
      expect(res.status).toBe(200);
      // non-emptiness is proven by the paired positive control above
      expect(JSON.stringify(res.body)).not.toContain(seed.B.classroomId);
    });
  });

  describe('READ · Syllabus', () => {
    it('A-admin cannot read B syllabus detail', async () => {
      const res = await get(
        `/api/v1/syllabus/${seed.B.syllabusId}`,
        seed.A.adminId,
      );
      expectDeniedAndNoLeak(res, seed.B.syllabusId);
    });
    it("A-admin's syllabus list does NOT include B's syllabus", async () => {
      const res = await get('/api/v1/syllabus', seed.A.adminId);
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain(seed.B.syllabusId);
    });
  });

  describe('READ · AI chat history', () => {
    it('A-teacher cannot list B classroom AI sessions', async () => {
      const res = await get(
        `/api/v1/classrooms/${seed.B.classroomId}/ai/sessions`,
        seed.A.teacherId,
      );
      expectDeniedAndNoLeak(res, seed.B.sessionId, SECRET_B_SESSION_TITLE);
    });
    it('A-teacher cannot read B AI session detail (+ no message content leak)', async () => {
      const res = await get(
        `/api/v1/classrooms/${seed.B.classroomId}/ai/sessions/${seed.B.sessionId}`,
        seed.A.teacherId,
      );
      expectDeniedAndNoLeak(
        res,
        seed.B.sessionId,
        SECRET_B_SESSION_TITLE,
        SECRET_B_MESSAGE,
      );
    });
    it('A-teacher cannot smuggle a B session under an A classroom path', async () => {
      const res = await get(
        `/api/v1/classrooms/${seed.A.classroomId}/ai/sessions/${seed.B.sessionId}`,
        seed.A.teacherId,
      );
      expectDeniedAndNoLeak(res, seed.B.sessionId, SECRET_B_MESSAGE);
    });
  });

  describe('READ · Users', () => {
    it("A-admin's user list does NOT include B's users", async () => {
      const res = await get('/api/v1/users', seed.A.adminId);
      expect(res.status).toBe(200);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain(seed.B.teacherId);
      expect(body).not.toContain('teacher.b@test-isolation.local');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. WRITE ISOLATION — A actors must not MUTATE B's data. Each test attempts
  //    the write THEN re-reads B's row from the DB to prove it is UNCHANGED.
  // ---------------------------------------------------------------------------
  // Same-route WRITE positive controls: prove each mutation route ACTUALLY
  // works (2xx + the row really changes) for the legitimate tenant — so the
  // cross-tenant denials below are "denied specifically", not "this route is
  // broken and 404s for everyone". Targets A's disposable rows only.
  describe('WRITE positive controls (route works for own tenant)', () => {
    it('A-admin PATCH A disposable note → 200 AND title changes', async () => {
      const res = await patch(
        `/api/v1/notes/${seed.A.disposableNoteId}`,
        seed.A.adminId,
        { title: 'A-LEGIT-UPDATED-TITLE' },
      );
      expect(res.status).toBe(200);
      const after = await prisma.note.findUnique({
        where: { id: seed.A.disposableNoteId },
      });
      expect(after?.title).toBe('A-LEGIT-UPDATED-TITLE');
    });

    it('A-admin DELETE A disposable note → 2xx AND status ARCHIVED', async () => {
      const res = await del(
        `/api/v1/notes/${seed.A.disposableNoteId}`,
        seed.A.adminId,
      );
      expect([200, 204]).toContain(res.status);
      const after = await prisma.note.findUnique({
        where: { id: seed.A.disposableNoteId },
      });
      expect(after?.status).toBe('ARCHIVED');
    });

    it('A-admin PATCH A disposable user status → 200 AND status INACTIVE', async () => {
      const res = await patch(
        `/api/v1/users/${seed.A.disposableUserId}/status`,
        seed.A.adminId,
        { status: 'INACTIVE' },
      );
      expect(res.status).toBe(200);
      const after = await prisma.user.findUnique({
        where: { id: seed.A.disposableUserId },
      });
      expect(after?.status).toBe('INACTIVE');
    });

    it('A-admin DELETE A disposable user → 2xx AND deletedAt is set', async () => {
      const res = await del(
        `/api/v1/users/${seed.A.disposableUserId}`,
        seed.A.adminId,
      );
      expect([200, 204]).toContain(res.status);
      const after = await prisma.user.findUnique({
        where: { id: seed.A.disposableUserId },
      });
      expect(after?.deletedAt).not.toBeNull();
    });

    it('A-admin PATCH A disposable syllabus → 200 AND name changes', async () => {
      const res = await patch(
        `/api/v1/syllabus/${seed.A.disposableSyllabusId}`,
        seed.A.adminId,
        { name: 'A-LEGIT-UPDATED-SYLLABUS' },
      );
      expect(res.status).toBe(200);
      const after = await prisma.syllabusDocument.findUnique({
        where: { id: seed.A.disposableSyllabusId },
      });
      expect(after?.name).toBe('A-LEGIT-UPDATED-SYLLABUS');
    });

    it('A-admin refresh-code on A OWN classroom → 200 AND invite code changes', async () => {
      const res = await post(
        `/api/v1/classrooms/${seed.A.classroomId}/refresh-code`,
        seed.A.adminId,
        {},
      );
      expect(res.status).toBe(200);
      const after = await prisma.classroom.findUnique({
        where: { id: seed.A.classroomId },
      });
      expect(after?.inviteCode).not.toBe(seed.A.inviteCode);
    });
  });

  describe('WRITE · A must not mutate B', () => {
    it('A-admin PATCH B note is denied AND B note is unchanged', async () => {
      const res = await patch(`/api/v1/notes/${seed.B.noteId}`, seed.A.adminId, {
        title: 'PWNED-BY-A',
      });
      expect([403, 404]).toContain(res.status);
      const after = await prisma.note.findUnique({
        where: { id: seed.B.noteId },
      });
      expect(after?.title).toBe(SECRET_B_NOTE_TITLE);
    });

    it('A-teacher PATCH B note is denied AND B note is unchanged', async () => {
      const res = await patch(
        `/api/v1/notes/${seed.B.noteId}`,
        seed.A.teacherId,
        { title: 'PWNED-BY-A-TEACHER' },
      );
      expect([403, 404]).toContain(res.status);
      const after = await prisma.note.findUnique({
        where: { id: seed.B.noteId },
      });
      expect(after?.title).toBe(SECRET_B_NOTE_TITLE);
    });

    it('A-admin DELETE B note is denied AND B note still exists (not archived)', async () => {
      const res = await del(`/api/v1/notes/${seed.B.noteId}`, seed.A.adminId);
      expect([403, 404]).toContain(res.status);
      const after = await prisma.note.findUnique({
        where: { id: seed.B.noteId },
      });
      expect(after).not.toBeNull();
      expect(after?.status).toBe('PUBLISHED'); // soft-delete would flip to ARCHIVED
    });

    it('A-admin PATCH B user status is denied AND B user is unchanged', async () => {
      const res = await patch(
        `/api/v1/users/${seed.B.studentId}/status`,
        seed.A.adminId,
        { status: 'INACTIVE' },
      );
      expect([403, 404]).toContain(res.status);
      const after = await prisma.user.findUnique({
        where: { id: seed.B.studentId },
      });
      expect(after?.status).toBe('ACTIVE');
    });

    it('A-admin DELETE B user is denied AND B user is not soft-deleted', async () => {
      const res = await del(
        `/api/v1/users/${seed.B.studentId}`,
        seed.A.adminId,
      );
      expect([403, 404]).toContain(res.status);
      const after = await prisma.user.findUnique({
        where: { id: seed.B.studentId },
      });
      expect(after).not.toBeNull();
      expect(after?.deletedAt).toBeNull();
    });

    it('A-admin PATCH B syllabus is denied AND B syllabus name unchanged', async () => {
      const res = await patch(
        `/api/v1/syllabus/${seed.B.syllabusId}`,
        seed.A.adminId,
        { name: 'PWNED-SYLLABUS' },
      );
      expect([403, 404]).toContain(res.status);
      const after = await prisma.syllabusDocument.findUnique({
        where: { id: seed.B.syllabusId },
      });
      expect(after?.name).toBe('Samacheer Class 10 Maths (B)');
    });

    it('A-admin refresh-code on B classroom is denied AND invite code unchanged', async () => {
      const res = await post(
        `/api/v1/classrooms/${seed.B.classroomId}/refresh-code`,
        seed.A.adminId,
        {},
      );
      expect([403, 404]).toContain(res.status);
      const after = await prisma.classroom.findUnique({
        where: { id: seed.B.classroomId },
      });
      expect(after?.inviteCode).toBe(seed.B.inviteCode);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. RBAC — a STUDENT is blocked from teacher/admin endpoints (403)
  // ---------------------------------------------------------------------------
  describe('RBAC · student blocked from teacher/admin endpoints', () => {
    it('student cannot create a classroom (admin-only) → 403', async () => {
      const res = await post('/api/v1/classrooms', seed.A.studentId, {});
      expect(res.status).toBe(403);
    });
    it('student cannot list users (admin-only) → 403', async () => {
      const res = await get('/api/v1/users', seed.A.studentId);
      expect(res.status).toBe(403);
    });
    it('student cannot list syllabus (admin-only) → 403', async () => {
      const res = await get('/api/v1/syllabus', seed.A.studentId);
      expect(res.status).toBe(403);
    });
    it('student cannot access AI chat sessions (teacher+ only) → 403', async () => {
      const res = await get(
        `/api/v1/classrooms/${seed.A.classroomId}/ai/sessions`,
        seed.A.studentId,
      );
      expect(res.status).toBe(403);
    });
    it('student cannot upload a note (teacher+ only) → 403', async () => {
      const res = await post(
        `/api/v1/classrooms/${seed.A.classroomId}/notes`,
        seed.A.studentId,
        {},
      );
      expect(res.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. ACADEMIC STRUCTURE read endpoints (NEW) — /classes, /subjects,
  //    /academic-years. Admin-only, institution-scoped. List-scoping isolation:
  //    A's list must include A's rows and exclude B's; non-admins are 403.
  // ---------------------------------------------------------------------------
  describe('Academic structure · read endpoints', () => {
    // -- positive controls (also prove non-emptiness) ----------------------
    it('A-admin GET /classes includes A class + section (200)', async () => {
      const res = await get('/api/v1/classes', seed.A.adminId);
      expect(res.status).toBe(200);
      const body = JSON.stringify(res.body);
      expect(body).toContain(seed.A.classId);
      expect(body).toContain(seed.A.sectionId);
    });
    it('A-admin GET /subjects includes A subject (200)', async () => {
      const res = await get('/api/v1/subjects', seed.A.adminId);
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).toContain(seed.A.subjectId);
    });
    it('A-admin GET /academic-years includes A year (200)', async () => {
      const res = await get('/api/v1/academic-years', seed.A.adminId);
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).toContain(seed.A.academicYearId);
    });

    // -- cross-tenant scoping ----------------------------------------------
    it("A-admin's /classes does NOT include B's class or section", async () => {
      const res = await get('/api/v1/classes', seed.A.adminId);
      expect(res.status).toBe(200);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain(seed.B.classId);
      expect(body).not.toContain(seed.B.sectionId);
    });
    it("A-admin's /subjects does NOT include B's subject", async () => {
      const res = await get('/api/v1/subjects', seed.A.adminId);
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain(seed.B.subjectId);
    });
    it("A-admin's /academic-years does NOT include B's year", async () => {
      const res = await get('/api/v1/academic-years', seed.A.adminId);
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain(seed.B.academicYearId);
    });

    // -- RBAC: admin-only, so student AND teacher are 403 ------------------
    it('student cannot GET /classes (admin-only) → 403', async () => {
      expect((await get('/api/v1/classes', seed.A.studentId)).status).toBe(403);
    });
    it('teacher cannot GET /classes (admin-only) → 403', async () => {
      expect((await get('/api/v1/classes', seed.A.teacherId)).status).toBe(403);
    });
    it('student cannot GET /subjects (admin-only) → 403', async () => {
      expect((await get('/api/v1/subjects', seed.A.studentId)).status).toBe(403);
    });
    it('teacher cannot GET /subjects (admin-only) → 403', async () => {
      expect((await get('/api/v1/subjects', seed.A.teacherId)).status).toBe(403);
    });
    it('student cannot GET /academic-years (admin-only) → 403', async () => {
      expect((await get('/api/v1/academic-years', seed.A.studentId)).status).toBe(
        403,
      );
    });
    it('teacher cannot GET /academic-years (admin-only) → 403', async () => {
      expect((await get('/api/v1/academic-years', seed.A.teacherId)).status).toBe(
        403,
      );
    });
  });
});
