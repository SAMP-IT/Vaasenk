/**
 * Vaasenk Mobile — Classrooms service.
 *
 * Wire-compatible port of the calls apps/web makes against the
 * `/api/v1/classrooms*` endpoints. Backend visibility rules (institutionId
 * scoping via JWT + role-based filter — see classrooms.service.ts) mean
 * a student JWT only ever sees their own enrolled classrooms; we never
 * pass institutionId from the client (CLAUDE.md §3 rule 4).
 *
 * Backend contracts mirrored here are from
 * apps/api/src/modules/classrooms/{classrooms.controller,classrooms.service}.ts.
 *
 * A tiny in-memory cache for the "my classrooms" list (used by both Home
 * and the Classrooms tab) keeps tab switches snappy. Invalidate after a
 * successful join — see `invalidateClassroomsCache()` below.
 */

import { apiFetchEnvelope, apiGet, apiPost, type ApiSuccess } from './api';

// ---------------------------------------------------------------------------
// View types — mirror Prisma includes from CLASSROOM_LIST_INCLUDE +
// CLASSROOM_DETAIL_INCLUDE. We intentionally keep most fields nullable
// because the backend can surface partial rows (e.g. classroom without a
// section).
// ---------------------------------------------------------------------------

export type ClassroomStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export type ClassroomTeacherSummary = {
  id: string;
  name: string;
  email?: string | null;
  avatarUrl: string | null;
};

export type ClassroomView = {
  id: string;
  institutionId: string;
  name: string;
  status: ClassroomStatus;
  inviteCode: string | null;
  inviteExpiresAt: string | null;
  class: { id: string; name: string; gradeLevel?: number | null } | null;
  section: { id: string; name: string } | null;
  subject: { id: string; name: string } | null;
  teacher: ClassroomTeacherSummary | null;
  academicYear: { id: string; name: string; isActive?: boolean } | null;
  syllabus: { id: string; name: string; status: string } | null;
  _count: { members: number; notes: number };
  createdAt: string;
  updatedAt: string;
};

export type ClassroomMemberView = {
  id: string;
  classroomId: string;
  userId: string;
  role: 'STUDENT' | 'TEACHER';
  status: 'ACTIVE' | 'INACTIVE';
  joinedAt: string;
  user: {
    id: string;
    name: string;
    email?: string | null;
    avatarUrl: string | null;
  };
};

export type ClassroomDetailView = ClassroomView & {
  members?: ClassroomMemberView[];
  setupSummary?: {
    hasSyllabus: boolean;
    syllabusStatus: string | null;
    hasInviteCode: boolean;
    inviteExpiresAt: string | null;
  };
};

// ---------------------------------------------------------------------------
// In-memory cache — lifetime is the JS module (cleared on app reload).
// The Home + Classrooms tabs both read this synchronously on mount and
// kick off a background refresh; pull-to-refresh always bypasses.
// ---------------------------------------------------------------------------

type CacheState = {
  classrooms: ClassroomView[] | null;
  fetchedAt: number | null;
};

const cache: CacheState = { classrooms: null, fetchedAt: null };

/** Read the cached classrooms list. Returns `null` if never populated. */
export function readClassroomsCache(): ClassroomView[] | null {
  return cache.classrooms;
}

/**
 * Drop the cache. Called after a successful join so the next read pulls
 * the newly-enrolled classroom from the server.
 */
export function invalidateClassroomsCache(): void {
  cache.classrooms = null;
  cache.fetchedAt = null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const DEFAULT_LIST_LIMIT = 50;

/**
 * GET /api/v1/classrooms — paginated list scoped to the JWT user.
 *
 * For a STUDENT this returns only classrooms where they are an ACTIVE
 * member (per ClassroomsService.buildVisibilityWhere). We don't expose
 * pagination on this helper because a typical student is in <10 rooms;
 * the underlying endpoint still paginates with `limit` if needed.
 */
export async function listMyClassrooms(options?: {
  status?: ClassroomStatus;
  limit?: number;
}): Promise<{
  data: ClassroomView[];
  meta: { page: number; limit: number; total: number };
}> {
  const params = new URLSearchParams();
  params.set('status', options?.status ?? 'ACTIVE');
  params.set('limit', String(options?.limit ?? DEFAULT_LIST_LIMIT));
  const result = (await apiFetchEnvelope<ClassroomView[]>(
    `/api/v1/classrooms?${params.toString()}`,
  )) as ApiSuccess<ClassroomView[]> & {
    meta?: { page?: number; limit?: number; total?: number };
  };
  const list = result.data ?? [];
  cache.classrooms = list;
  cache.fetchedAt = Date.now();
  return {
    data: list,
    meta: {
      page: result.meta?.page ?? 1,
      limit: result.meta?.limit ?? DEFAULT_LIST_LIMIT,
      total: result.meta?.total ?? list.length,
    },
  };
}

/** GET /api/v1/classrooms/:id — single classroom detail. */
export async function getClassroom(id: string): Promise<ClassroomDetailView> {
  const result = await apiGet<{ classroom: ClassroomDetailView }>(
    `/api/v1/classrooms/${id}`,
  );
  return result.classroom;
}

/**
 * POST /api/v1/classrooms/join — student joins via 6-char invite code.
 *
 * Backend throws:
 *   404 — code not recognized (or different tenant)
 *   410 — code expired
 *
 * On success we invalidate the cache so the Home/Classrooms tabs refetch.
 */
export async function joinClassroom(
  inviteCode: string,
): Promise<{ classroom: ClassroomView }> {
  const trimmed = inviteCode.trim().toUpperCase();
  const result = await apiPost<{ classroom: ClassroomView }>(
    '/api/v1/classrooms/join',
    { inviteCode: trimmed },
  );
  invalidateClassroomsCache();
  return result;
}

/**
 * GET /api/v1/classrooms/:id/members — used by the classroom detail screen
 * to show "Who's in this class". Students can call this per the controller
 * @Roles decorator.
 */
export async function getClassroomMembers(
  id: string,
  options?: {
    role?: 'STUDENT' | 'TEACHER';
    status?: ClassroomStatus;
    limit?: number;
  },
): Promise<{
  data: ClassroomMemberView[];
  meta: { page: number; limit: number; total: number };
}> {
  const params = new URLSearchParams();
  if (options?.role) params.set('role', options.role);
  if (options?.status) params.set('status', options.status);
  params.set('limit', String(options?.limit ?? 50));
  const result = await apiFetchEnvelope<ClassroomMemberView[]>(
    `/api/v1/classrooms/${id}/members?${params.toString()}`,
  );
  return {
    data: result.data ?? [],
    meta: {
      page: result.meta?.page ?? 1,
      limit: result.meta?.limit ?? 50,
      total: result.meta?.total ?? (result.data ?? []).length,
    },
  };
}

// ---------------------------------------------------------------------------
// Teacher / Admin operations (Sprint 7.3)
// ---------------------------------------------------------------------------

/**
 * Lightweight discriminator for the teacher's "my classrooms" view. The
 * backend's `buildVisibilityWhere` already restricts the list endpoint to
 * the requester's role — teachers see only the rooms they're assigned to
 * or enrolled in. We reuse `listMyClassrooms` rather than introduce a new
 * helper so the cache (and `invalidateClassroomsCache`) work on both
 * tabs the same way.
 *
 * NOTE: There is no separate `GET /teacher/classrooms` endpoint — the
 * generic `GET /classrooms` is role-filtered server-side.
 */
export const listTeacherClassrooms = listMyClassrooms;

/**
 * POST /api/v1/classrooms — create a new classroom.
 *
 * GAP: The backend's `CreateClassroomDto` requires `classId`, `subjectId`,
 * and `teacherId` UUIDs, AND the controller is `@Roles(ADMIN, SUPER_ADMIN)`
 * only — teachers cannot create classrooms via this endpoint. The mobile
 * "Create classroom" surface is therefore wired to surface a polite
 * "Ask your admin" message on the teacher app; this function is exported
 * for future admin-mobile use OR if the backend later opens it to TEACHER.
 *
 * The shape below matches the backend DTO exactly so the wire format
 * doesn't drift when the role gate eventually relaxes.
 */
export type CreateClassroomPayload = {
  name?: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  sectionId?: string;
  academicYearId?: string;
  syllabusId?: string;
};

export async function createClassroom(
  payload: CreateClassroomPayload,
): Promise<ClassroomDetailView> {
  const result = await apiPost<{ classroom: ClassroomDetailView }>(
    '/api/v1/classrooms',
    payload,
  );
  invalidateClassroomsCache();
  return result.classroom;
}

/**
 * POST /api/v1/classrooms/:id/refresh-code — regenerate the 6-char invite
 * code. Teachers and admins can call this; the backend asserts visibility.
 *
 * `expiresInDays` is optional (1–90). Omit for a never-expiring code.
 */
export async function refreshInviteCode(
  classroomId: string,
  options?: { expiresInDays?: number },
): Promise<ClassroomView> {
  const body = options?.expiresInDays
    ? { expiresInDays: options.expiresInDays }
    : {};
  const result = await apiPost<{ classroom: ClassroomView }>(
    `/api/v1/classrooms/${classroomId}/refresh-code`,
    body,
  );
  return result.classroom;
}
