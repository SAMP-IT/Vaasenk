import { apiFetch, apiFetchEnvelope } from './api-client';

/**
 * Classrooms / academic-structure API surface used by the classroom-creation
 * UI (`/admin/classrooms`) and the teacher home (`/teacher`).
 *
 * Wraps these endpoints:
 *   GET  /api/v1/classes          → classes (with nested sections)   [admin]
 *   GET  /api/v1/subjects         → subjects                          [admin]
 *   GET  /api/v1/academic-years   → academic years (active flagged)   [admin]
 *   GET  /api/v1/users?role=...    → users (teacher list)             [admin]
 *   GET  /api/v1/syllabus         → syllabus library (status flagged) [admin]
 *   POST /api/v1/classrooms       → create classroom (+ invite code)  [admin]
 *   GET  /api/v1/classrooms       → role-filtered paginated list
 *
 * Types are mirrored next to the consumer rather than imported from a shared
 * package — the same precedent the rest of the web app follows (the NestJS
 * DTOs use class-validator decorators that don't survive a type-only import;
 * see apps/web/src/lib/subscriptions-api.ts + the teachers/syllabus type
 * mirrors). The shapes below match the backend services exactly:
 *   - AcademicService.listClasses / listSubjects / listAcademicYears
 *   - UsersService list view (institution + teacherProfile include)
 *   - SyllabusService.toView (SyllabusView)
 *   - ClassroomsService CLASSROOM_LIST_INCLUDE (ClassroomView)
 *
 * Multi-tenancy: the backend derives institutionId from the JWT actor on
 * EVERY query — these wrappers never send an institutionId (CLAUDE.md §3
 * rule 4). The admin-only endpoints 403 for non-admin callers.
 */

/* -------------------------------------------------------------------------- */
/* Academic structure                                                         */
/* -------------------------------------------------------------------------- */

export type SectionOption = {
  id: string;
  name: string;
};

export type ClassOption = {
  id: string;
  name: string;
  boardType: string | null;
  gradeLevel: number | null;
  sections: SectionOption[];
};

export type SubjectOption = {
  id: string;
  name: string;
  code: string | null;
};

export type AcademicYearOption = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

export type TeacherOption = {
  id: string;
  name: string;
  email: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  avatarUrl: string | null;
  teacherProfile?: {
    employeeCode: string | null;
    department: string | null;
    subjects: string[];
  } | null;
};

export type SyllabusProcessingStatus =
  | 'UPLOADED'
  | 'PROCESSING'
  | 'AI_READY'
  | 'FAILED';

export type SyllabusOption = {
  id: string;
  name: string;
  boardType: string | null;
  status: SyllabusProcessingStatus;
  isActive: boolean;
  class: { id: string; name: string } | null;
  subject: { id: string; name: string } | null;
};

/* -------------------------------------------------------------------------- */
/* Classroom                                                                  */
/* -------------------------------------------------------------------------- */

export type ClassroomStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

/**
 * Mirrors ClassroomsService CLASSROOM_LIST_INCLUDE (ClassroomView). The base
 * Classroom columns (`inviteCode`, `inviteExpiresAt`, `status`, `name`,
 * `createdAt`) sit alongside the nested relation selects.
 */
export type ClassroomView = {
  id: string;
  name: string;
  status: ClassroomStatus;
  inviteCode: string | null;
  inviteExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  class: { id: string; name: string } | null;
  section: { id: string; name: string } | null;
  subject: { id: string; name: string } | null;
  teacher: {
    id: string;
    name: string;
    email: string | null;
    avatarUrl: string | null;
  } | null;
  academicYear: { id: string; name: string; isActive: boolean } | null;
  syllabus: {
    id: string;
    name: string;
    status: SyllabusProcessingStatus;
  } | null;
  _count: { members: number; notes: number };
};

export type CreateClassroomPayload = {
  classId: string;
  subjectId: string;
  teacherId: string;
  sectionId?: string;
  syllabusId?: string;
  academicYearId?: string;
  name?: string;
};

export type ListClassroomsParams = {
  page?: number;
  limit?: number;
  search?: string;
  status?: ClassroomStatus;
  academicYearId?: string;
};

/* -------------------------------------------------------------------------- */
/* Academic structure wrappers                                                */
/* -------------------------------------------------------------------------- */

export async function listClasses(): Promise<ClassOption[]> {
  return apiFetch<ClassOption[]>('/api/v1/classes');
}

export async function listSubjects(): Promise<SubjectOption[]> {
  return apiFetch<SubjectOption[]>('/api/v1/subjects');
}

export async function listAcademicYears(): Promise<AcademicYearOption[]> {
  return apiFetch<AcademicYearOption[]>('/api/v1/academic-years');
}

/**
 * Teacher list. The /users endpoint returns a `{ data, meta }` envelope; we
 * read the envelope and hand back just the rows (the picker doesn't paginate —
 * we pull a high limit and let the drawer filter client-side). Active teachers
 * are surfaced first so the picker leads with assignable accounts.
 */
export async function listTeachers(
  opts: { limit?: number } = {},
): Promise<TeacherOption[]> {
  // Backend ListUsersDto caps limit at @Max(100); sending more 400s.
  const limit = Math.max(1, Math.min(opts.limit ?? 100, 100));
  const env = await apiFetchEnvelope<TeacherOption[]>(
    `/api/v1/users?role=TEACHER&status=ACTIVE&limit=${limit}&sort=name:asc`,
  );
  return env.data ?? [];
}

/**
 * Syllabus library. Returns the full list (admin sees all) so the drawer can
 * surface AI-ready documents and let the admin map one optionally at create
 * time. The /syllabus endpoint is a `{ data, meta }` envelope.
 */
export async function listSyllabus(
  opts: { limit?: number } = {},
): Promise<SyllabusOption[]> {
  // Backend ListSyllabusDto caps limit at @Max(100); sending more 400s.
  const limit = Math.max(1, Math.min(opts.limit ?? 100, 100));
  const env = await apiFetchEnvelope<SyllabusOption[]>(
    `/api/v1/syllabus?limit=${limit}&sort=createdAt:desc`,
  );
  return env.data ?? [];
}

/* -------------------------------------------------------------------------- */
/* Classroom wrappers                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Create a classroom. The api-client unwraps the `{ data }` envelope, so the
 * resolved value is `{ classroom }` (the server-minted invite code lives on
 * `classroom.inviteCode`). Admin-gated server-side.
 */
export async function createClassroom(
  payload: CreateClassroomPayload,
): Promise<{ classroom: ClassroomView }> {
  return apiFetch<{ classroom: ClassroomView }>('/api/v1/classrooms', {
    method: 'POST',
    body: payload,
  });
}

/**
 * List classrooms. Role-filtered server-side (admins see all; teachers see
 * assigned). Returns the full `{ data, meta }` envelope so callers can render
 * "showing X of Y" / paginate.
 */
export async function listClassrooms(
  params: ListClassroomsParams = {},
): Promise<{ data: ClassroomView[]; total: number; page: number; limit: number }> {
  const search = new URLSearchParams();
  search.set('page', String(params.page ?? 1));
  search.set('limit', String(params.limit ?? 20));
  search.set('sort', 'createdAt:desc');
  if (params.status) search.set('status', params.status);
  if (params.search) search.set('search', params.search);
  if (params.academicYearId) search.set('academicYearId', params.academicYearId);

  const env = await apiFetchEnvelope<ClassroomView[]>(
    `/api/v1/classrooms?${search.toString()}`,
  );
  return {
    data: env.data ?? [],
    total: env.meta?.total ?? env.data?.length ?? 0,
    page: env.meta?.page ?? params.page ?? 1,
    limit: env.meta?.limit ?? params.limit ?? 20,
  };
}
