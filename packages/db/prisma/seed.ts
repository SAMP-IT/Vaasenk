/**
 * Vaasenk demo seed.
 *
 * Creates one "Demo School" tenant with:
 *   • 1 admin user, 1 teacher user, 1 student user (with role profiles)
 *   • 1 academic year (active)
 *   • 1 class "Grade 10" with sections A and B (the colloquial "10-A" and
 *     "10-B" in the seed brief)
 *   • 3 subjects (Mathematics, Science, English)
 *   • 1 classroom: Grade 10 / Section A · Mathematics, with the teacher
 *     assigned and the student joined as a member
 *
 * Idempotent — deletes any existing "Demo School" first; cascade FKs handle
 * the descendants. Safe to re-run.
 *
 * AUTH INTEGRATION (Sprint 1):
 * When SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are real (not placeholder),
 * the seed also mirrors each demo user into Supabase Auth via
 * `supabase.auth.admin.createUser()`, deletes any prior auth user with the
 * same email first, and reuses the returned Supabase UID as our `User.id`.
 * That keeps the JWT lookup in JwtAuthGuard pointing at the right row.
 *
 * When the env is still placeholder (no real Supabase project), the seed
 * falls back to generating client-side UUIDs — same behavior as Sprint 0,
 * so local dev without auth keeps working.
 */

import { randomUUID } from 'node:crypto';
import { PrismaClient, UserRole } from '@prisma/client';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

const prisma = new PrismaClient();

// Predictable demo passwords. NOT for production — only used to mirror seed
// accounts into Supabase Auth so QA can log in via /api/v1/auth/login.
const DEMO_PASSWORDS = {
  admin: 'Demo-Admin-Pass!1',
  teacher: 'Demo-Teacher-Pass!1',
  student: 'Demo-Student-Pass!1',
} as const;

// -----------------------------------------------------------------------------
// Supabase Auth helpers
// -----------------------------------------------------------------------------

const SUPABASE_URL = process.env['SUPABASE_URL'] ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

function isSupabaseConfigured(): boolean {
  return (
    !!SUPABASE_URL &&
    !!SUPABASE_SERVICE_ROLE_KEY &&
    !SUPABASE_URL.includes('placeholder') &&
    !SUPABASE_URL.includes('your-project')
  );
}

let supabaseAdmin: SupabaseClient | null = null;
function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (supabaseAdmin) return supabaseAdmin;
  supabaseAdmin = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return supabaseAdmin;
}

type AuthUserSpec = {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  institutionId: string;
};

/**
 * Returns a UUID to use as the new User.id. When Supabase is configured this
 * is the Supabase Auth user id; otherwise it's a freshly minted UUID.
 *
 * Idempotency: deletes any existing Supabase auth user with the same email
 * before recreating so re-running the seed never collides.
 */
async function provisionAuthUser(spec: AuthUserSpec): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) {
    return randomUUID();
  }

  // Wipe any prior auth user with this email. Supabase has no "find by email"
  // — we list and filter the first page (200 records is plenty for seed).
  const { data: list, error: listError } = await supabase.auth.admin.listUsers({
    perPage: 200,
  });
  if (listError) {
    throw new Error(
      `Failed to list Supabase auth users while seeding ${spec.email}: ${listError.message}`,
    );
  }
  const existing = list.users.find((u) => u.email?.toLowerCase() === spec.email.toLowerCase());
  if (existing) {
    const { error: deleteError } = await supabase.auth.admin.deleteUser(existing.id);
    if (deleteError) {
      throw new Error(
        `Failed to delete prior Supabase auth user ${spec.email}: ${deleteError.message}`,
      );
    }
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: spec.email,
    password: spec.password,
    email_confirm: true,
    user_metadata: { name: spec.name },
    app_metadata: { role: spec.role, institution_id: spec.institutionId },
  });
  if (error || !data.user) {
    throw new Error(
      `Failed to create Supabase auth user ${spec.email}: ${error?.message ?? 'unknown error'}`,
    );
  }
  return data.user.id;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('🌱 Seeding Vaasenk demo data…');
  console.log(
    isSupabaseConfigured()
      ? '   (Supabase Auth integration: ON — mirroring users into auth.users)'
      : '   (Supabase Auth integration: OFF — placeholder env, generating local UUIDs)',
  );

  // Idempotency: wipe the demo tenant and let cascade FKs clear children.
  // This is faster and safer than per-table upserts because every relation
  // hangs off the institution.
  const deleted = await prisma.institution.deleteMany({
    where: { name: 'Demo School' },
  });
  if (deleted.count > 0) {
    console.log(`  · removed ${deleted.count} previous Demo School tenant(s)`);
  }

  // -------------------------------------------------------------------------
  // Tenant
  // -------------------------------------------------------------------------
  const institution = await prisma.institution.create({
    data: {
      name: 'Demo School',
      type: 'school',
      boardType: 'samacheer_kalvi',
      address: 'No 1, Demo Street, Chennai, Tamil Nadu, India',
      contactPerson: 'Mrs. Priya Iyer (Principal)',
      contactEmail: 'principal@demo.school',
      contactPhone: '+91-90000-00000',
      locale: 'en-IN',
      timezone: 'Asia/Kolkata',
      subscriptionPlan: 'GROWTH',
      status: 'ACTIVE',
    },
  });

  // -------------------------------------------------------------------------
  // Users (Supabase Auth mirror + Prisma profile rows)
  // -------------------------------------------------------------------------
  const adminId = await provisionAuthUser({
    email: 'admin@demo.school',
    password: DEMO_PASSWORDS.admin,
    name: 'Demo Admin',
    role: UserRole.ADMIN,
    institutionId: institution.id,
  });
  const admin = await prisma.user.create({
    data: {
      id: adminId,
      institutionId: institution.id,
      name: 'Demo Admin',
      email: 'admin@demo.school',
      phone: '+91-90000-00001',
      role: UserRole.ADMIN,
      status: 'ACTIVE',
    },
  });

  const teacherId = await provisionAuthUser({
    email: 'teacher@demo.school',
    password: DEMO_PASSWORDS.teacher,
    name: 'Demo Teacher',
    role: UserRole.TEACHER,
    institutionId: institution.id,
  });
  const teacher = await prisma.user.create({
    data: {
      id: teacherId,
      institutionId: institution.id,
      name: 'Demo Teacher',
      email: 'teacher@demo.school',
      phone: '+91-90000-00002',
      role: UserRole.TEACHER,
      status: 'ACTIVE',
      teacherProfile: {
        create: {
          institutionId: institution.id,
          employeeCode: 'TCHR-0001',
          department: 'Mathematics',
          subjects: ['Mathematics', 'Science'],
          bio: 'Demo teacher seeded for local development.',
          status: 'ACTIVE',
        },
      },
    },
  });

  const studentId = await provisionAuthUser({
    email: 'student@demo.school',
    password: DEMO_PASSWORDS.student,
    name: 'Demo Student',
    role: UserRole.STUDENT,
    institutionId: institution.id,
  });
  const student = await prisma.user.create({
    data: {
      id: studentId,
      institutionId: institution.id,
      name: 'Demo Student',
      email: 'student@demo.school',
      phone: '+91-90000-00003',
      role: UserRole.STUDENT,
      status: 'ACTIVE',
    },
  });

  // -------------------------------------------------------------------------
  // Academic structure
  // -------------------------------------------------------------------------
  const academicYear = await prisma.academicYear.create({
    data: {
      institutionId: institution.id,
      name: '2025-2026',
      startDate: new Date('2025-06-01'),
      endDate: new Date('2026-04-30'),
      isActive: true,
    },
  });

  const grade10 = await prisma.class.create({
    data: {
      institutionId: institution.id,
      name: 'Grade 10',
      boardType: 'samacheer_kalvi',
      gradeLevel: 10,
    },
  });

  const [sectionA, sectionB] = await Promise.all([
    prisma.section.create({
      data: { institutionId: institution.id, classId: grade10.id, name: 'A' },
    }),
    prisma.section.create({
      data: { institutionId: institution.id, classId: grade10.id, name: 'B' },
    }),
  ]);

  const [mathematics, science, english] = await Promise.all([
    prisma.subject.create({
      data: { institutionId: institution.id, name: 'Mathematics', code: 'MATH' },
    }),
    prisma.subject.create({
      data: { institutionId: institution.id, name: 'Science', code: 'SCI' },
    }),
    prisma.subject.create({
      data: { institutionId: institution.id, name: 'English', code: 'ENG' },
    }),
  ]);

  // Finalize the student profile now that we have classId/sectionId.
  await prisma.student.create({
    data: {
      institutionId: institution.id,
      userId: student.id,
      admissionNo: 'STD-0001',
      classId: grade10.id,
      sectionId: sectionA.id,
      rollNo: '10',
      parentName: 'Demo Parent',
      parentPhone: '+91-90000-00004',
      status: 'ACTIVE',
    },
  });

  // -------------------------------------------------------------------------
  // Classroom: Grade 10 / Section A · Mathematics
  // -------------------------------------------------------------------------
  const classroom = await prisma.classroom.create({
    data: {
      institutionId: institution.id,
      academicYearId: academicYear.id,
      classId: grade10.id,
      sectionId: sectionA.id,
      subjectId: mathematics.id,
      teacherId: teacher.id,
      name: 'Grade 10 · Section A · Mathematics',
      inviteCode: 'VSK-DEMO-10A-MATH',
      status: 'ACTIVE',
    },
  });

  // Student joins as a classroom member.
  await prisma.classroomMember.create({
    data: {
      institutionId: institution.id,
      classroomId: classroom.id,
      userId: student.id,
      role: UserRole.STUDENT,
      status: 'ACTIVE',
    },
  });

  // -------------------------------------------------------------------------
  // Subscription history row so /admin can render plan state in Sprint 1.
  // -------------------------------------------------------------------------
  await prisma.subscription.create({
    data: {
      institutionId: institution.id,
      plan: 'GROWTH',
      status: 'ACTIVE',
      billingCycle: 'yearly',
      priceInr: 49999.0,
      startedAt: new Date(),
      aiCreditsMonthly: 250_000,
      aiCreditsUsed: 0,
    },
  });

  console.log('\n✓ Seed complete.\n');
  console.log('  Institution:    ', institution.name);
  console.log('  Institution ID: ', institution.id);
  console.log('');
  console.log('  Admin user:     ', admin.email, ' →', admin.id);
  console.log('  Teacher user:   ', teacher.email, ' →', teacher.id);
  console.log('  Student user:   ', student.email, ' →', student.id);
  console.log('');
  console.log('  Academic year:  ', academicYear.name, ' →', academicYear.id);
  console.log('  Class:          ', grade10.name, ' →', grade10.id);
  console.log('  Sections:       ', sectionA.name, '→', sectionA.id, '/', sectionB.name, '→', sectionB.id);
  console.log('  Subjects:       ', mathematics.name, ',', science.name, ',', english.name);
  console.log('');
  console.log('  Classroom:      ', classroom.name);
  console.log('  Classroom ID:   ', classroom.id);
  console.log('  Invite code:    ', classroom.inviteCode);

  if (isSupabaseConfigured()) {
    console.log('');
    console.log('  Demo credentials (Supabase Auth):');
    console.log(`    admin@demo.school   / ${DEMO_PASSWORDS.admin}`);
    console.log(`    teacher@demo.school / ${DEMO_PASSWORDS.teacher}`);
    console.log(`    student@demo.school / ${DEMO_PASSWORDS.student}`);
  } else {
    console.log('');
    console.log('  ⚠ Supabase Auth not configured — these users cannot log in yet.');
    console.log('    Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in packages/db/.env');
    console.log('    and re-run `npm run db:seed` to provision auth credentials.');
  }
}

main()
  .catch((err) => {
    console.error('\n❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
