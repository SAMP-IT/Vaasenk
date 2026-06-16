/**
 * Adversarial multi-tenant test fixture.
 *
 * Seeds TWO fully-populated institutions (A and B) into whatever database
 * DATABASE_URL points at. Each institution gets a complete vertical slice so
 * that EVERY read endpoint has cross-tenant data to (illegitimately) reach for:
 *   • admin / teacher / student users (+ role profiles)
 *   • academic year / class / section / subject
 *   • a classroom (teacher assigned, student joined as member)
 *   • a PUBLISHED note
 *   • an AI-READY syllabus document
 *   • an AI chatbot + chat session (owned by the teacher) + one message
 *
 * The two institutions are structurally identical but have NO shared rows.
 * If any endpoint lets an institution-A actor read an institution-B row, the
 * tenancy boundary is broken.
 *
 * User ids are plain UUIDs. The e2e harness uses each user's id AS its bearer
 * token (the SupabaseService.getUser stub maps token -> { user: { id: token }})
 * so the REAL JwtAuthGuard does a REAL Prisma lookup and populates req.user
 * exactly as production would.
 *
 * NOTE: this fixture writes raw rows with Prisma. It deliberately does NOT go
 * through the create endpoints — we are testing READ isolation, and several
 * create paths (classroom, note upload) are gated/multipart and out of scope.
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient, UserRole } from '@prisma/client';

export interface SeededInstitution {
  key: 'A' | 'B';
  institutionId: string;
  adminId: string;
  teacherId: string;
  studentId: string;
  academicYearId: string;
  classId: string;
  sectionId: string;
  subjectId: string;
  classroomId: string;
  noteId: string;
  syllabusId: string;
  chatbotId: string;
  sessionId: string;
  messageId: string;
  inviteCode: string;
  // Disposable rows — exist so same-route WRITE positive controls can mutate
  // an own-tenant target without perturbing the cross-tenant fixtures above.
  disposableNoteId: string;
  disposableUserId: string;
  disposableSyllabusId: string;
}

export interface SeedResult {
  A: SeededInstitution;
  B: SeededInstitution;
}

export const TEST_INSTITUTION_NAMES = [
  'TEST-ISOLATION Institution A',
  'TEST-ISOLATION Institution B',
] as const;

async function seedOne(
  prisma: PrismaClient,
  key: 'A' | 'B',
): Promise<SeededInstitution> {
  const name =
    key === 'A' ? TEST_INSTITUTION_NAMES[0] : TEST_INSTITUTION_NAMES[1];

  const institution = await prisma.institution.create({
    data: {
      name,
      type: 'school',
      boardType: 'samacheer_kalvi',
      status: 'ACTIVE',
      subscriptionPlan: 'GROWTH',
    },
  });
  const institutionId = institution.id;

  const adminId = randomUUID();
  await prisma.user.create({
    data: {
      id: adminId,
      institutionId,
      name: `Admin ${key}`,
      email: `admin.${key.toLowerCase()}@test-isolation.local`,
      role: UserRole.ADMIN,
      status: 'ACTIVE',
    },
  });

  const teacherId = randomUUID();
  await prisma.user.create({
    data: {
      id: teacherId,
      institutionId,
      name: `Teacher ${key}`,
      email: `teacher.${key.toLowerCase()}@test-isolation.local`,
      role: UserRole.TEACHER,
      status: 'ACTIVE',
      teacherProfile: {
        create: {
          institutionId,
          employeeCode: `TCHR-${key}`,
          department: 'Mathematics',
          subjects: ['Mathematics'],
          status: 'ACTIVE',
        },
      },
    },
  });

  const studentId = randomUUID();
  await prisma.user.create({
    data: {
      id: studentId,
      institutionId,
      name: `Student ${key}`,
      email: `student.${key.toLowerCase()}@test-isolation.local`,
      role: UserRole.STUDENT,
      status: 'ACTIVE',
    },
  });

  const academicYear = await prisma.academicYear.create({
    data: {
      institutionId,
      name: '2025-2026',
      startDate: new Date('2025-06-01'),
      endDate: new Date('2026-04-30'),
      isActive: true,
    },
  });

  const klass = await prisma.class.create({
    data: {
      institutionId,
      name: 'Grade 10',
      boardType: 'samacheer_kalvi',
      gradeLevel: 10,
    },
  });

  const section = await prisma.section.create({
    data: { institutionId, classId: klass.id, name: 'A' },
  });

  const subject = await prisma.subject.create({
    data: { institutionId, name: 'Mathematics', code: `MATH-${key}` },
  });

  await prisma.student.create({
    data: {
      institutionId,
      userId: studentId,
      admissionNo: `STD-${key}`,
      classId: klass.id,
      sectionId: section.id,
      status: 'ACTIVE',
    },
  });

  const inviteCode = `TST-${key}-10A-MATH`;
  const classroom = await prisma.classroom.create({
    data: {
      institutionId,
      academicYearId: academicYear.id,
      classId: klass.id,
      sectionId: section.id,
      subjectId: subject.id,
      teacherId,
      name: `Grade 10 · A · Mathematics (${key})`,
      inviteCode,
      status: 'ACTIVE',
    },
  });

  // student joins as a member of THEIR OWN institution's classroom
  await prisma.classroomMember.create({
    data: {
      institutionId,
      classroomId: classroom.id,
      userId: studentId,
      role: UserRole.STUDENT,
      status: 'ACTIVE',
    },
  });

  const note = await prisma.note.create({
    data: {
      institutionId,
      classroomId: classroom.id,
      teacherId,
      title: `Photosynthesis board notes (${key})`,
      description: 'Published note used for cross-tenant read tests.',
      fileUrl: `${institutionId}/notes/seed/board.jpg`,
      fileType: 'image/jpeg',
      tags: ['IMPORTANT'],
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });

  const syllabus = await prisma.syllabusDocument.create({
    data: {
      institutionId,
      classId: klass.id,
      subjectId: subject.id,
      boardType: 'samacheer_kalvi',
      name: `Samacheer Class 10 Maths (${key})`,
      fileUrl: `${institutionId}/syllabus/seed/syllabus.pdf`,
      version: 'v1',
      status: 'AI_READY',
      isActive: true,
    },
  });

  const chatbot = await prisma.aiChatbot.create({
    data: {
      institutionId,
      classroomId: classroom.id,
      syllabusId: syllabus.id,
      status: 'AI_READY',
      enabledForStudents: false,
    },
  });

  const session = await prisma.aiChatSession.create({
    data: {
      institutionId,
      chatbotId: chatbot.id,
      classroomId: classroom.id,
      teacherId,
      title: `Lesson planning chat (${key})`,
    },
  });

  const message = await prisma.aiChatMessage.create({
    data: {
      institutionId,
      sessionId: session.id,
      role: 'user',
      content: `Confidential teacher question for institution ${key}.`,
    },
  });

  // --- Disposable own-tenant targets for WRITE positive controls ------------
  const disposableUser = await prisma.user.create({
    data: {
      id: randomUUID(),
      institutionId,
      name: `Disposable ${key}`,
      email: `disposable.${key.toLowerCase()}@test-isolation.local`,
      role: UserRole.STUDENT,
      status: 'ACTIVE',
    },
  });

  const disposableNote = await prisma.note.create({
    data: {
      institutionId,
      classroomId: classroom.id,
      teacherId,
      title: `Disposable note (${key})`,
      tags: ['HOMEWORK'],
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });

  const disposableSyllabus = await prisma.syllabusDocument.create({
    data: {
      institutionId,
      name: `Disposable syllabus (${key})`,
      fileUrl: `${institutionId}/syllabus/disposable/syllabus.pdf`,
      version: 'v1',
      status: 'AI_READY',
      isActive: false,
    },
  });

  return {
    key,
    institutionId,
    adminId,
    teacherId,
    studentId,
    academicYearId: academicYear.id,
    classId: klass.id,
    sectionId: section.id,
    subjectId: subject.id,
    classroomId: classroom.id,
    noteId: note.id,
    syllabusId: syllabus.id,
    chatbotId: chatbot.id,
    sessionId: session.id,
    messageId: message.id,
    inviteCode,
    disposableNoteId: disposableNote.id,
    disposableUserId: disposableUser.id,
    disposableSyllabusId: disposableSyllabus.id,
  };
}

export async function cleanupTestInstitutions(
  prisma: PrismaClient,
): Promise<void> {
  // Cascade FKs clear every descendant row.
  await prisma.institution.deleteMany({
    where: { name: { in: [...TEST_INSTITUTION_NAMES] } },
  });
}

export async function seedTwoInstitutions(
  prisma: PrismaClient,
): Promise<SeedResult> {
  await cleanupTestInstitutions(prisma);
  const A = await seedOne(prisma, 'A');
  const B = await seedOne(prisma, 'B');
  return { A, B };
}
