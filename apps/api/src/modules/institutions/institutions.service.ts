import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole, type Institution, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateInstitutionDto,
  SetupInstitutionDto,
  UpdateInstitutionDto,
} from './institutions.dto';

/**
 * View model returned to clients. We expose the full Institution row (no
 * secrets live here) plus a lightweight `setupStatus` summary.
 */
export type InstitutionView = Institution & {
  setupStatus: SetupStatus;
};

export type SetupStatus = {
  isComplete: boolean;
  steps: {
    profile: { complete: boolean };
    academicYear: { complete: boolean; count: number };
    classes: { complete: boolean; count: number; sectionsCount: number };
    subjects: { complete: boolean; count: number };
  };
};

@Injectable()
export class InstitutionsService {
  private readonly logger = new Logger(InstitutionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Create — SUPER_ADMIN only (enforced by controller @Roles)
  // ---------------------------------------------------------------------------

  async create(
    actor: User,
    dto: CreateInstitutionDto,
  ): Promise<{ institution: InstitutionView }> {
    const institution = await this.prisma.institution.create({
      data: {
        name: dto.name.trim(),
        type: dto.type.trim(),
        ...(dto.boardType !== undefined && { boardType: dto.boardType }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.contactPerson !== undefined && { contactPerson: dto.contactPerson }),
        ...(dto.contactEmail !== undefined && { contactEmail: dto.contactEmail }),
        ...(dto.contactPhone !== undefined && { contactPhone: dto.contactPhone }),
        ...(dto.websiteUrl !== undefined && { websiteUrl: dto.websiteUrl }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.locale !== undefined && { locale: dto.locale }),
        ...(dto.timezone !== undefined && { timezone: dto.timezone }),
        ...(dto.subscriptionPlan !== undefined && { subscriptionPlan: dto.subscriptionPlan }),
      },
    });
    this.logger.log(`Institution ${institution.id} created by ${actor.id}`);
    return { institution: await this.attachSetupStatus(institution) };
  }

  // ---------------------------------------------------------------------------
  // Get + Update — tenant-scoped (controller verifies the path id matches)
  // ---------------------------------------------------------------------------

  async findOne(
    actor: User,
    id: string,
  ): Promise<{ institution: InstitutionView }> {
    this.assertCanReach(actor, id);
    const institution = await this.prisma.institution.findUnique({ where: { id } });
    if (!institution) {
      throw new NotFoundException('Institution not found');
    }
    return { institution: await this.attachSetupStatus(institution) };
  }

  async update(
    actor: User,
    id: string,
    dto: UpdateInstitutionDto,
  ): Promise<{ institution: InstitutionView }> {
    this.assertCanReach(actor, id);
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('No fields supplied for update');
    }

    const institution = await this.prisma.institution
      .update({ where: { id }, data: dto })
      .catch((err: unknown) => {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2025'
        ) {
          throw new NotFoundException('Institution not found');
        }
        throw err;
      });
    return { institution: await this.attachSetupStatus(institution) };
  }

  // ---------------------------------------------------------------------------
  // Setup — transactional create of academic_year + classes + sections + subjects
  // ---------------------------------------------------------------------------

  async setup(
    actor: User,
    id: string,
    dto: SetupInstitutionDto,
  ): Promise<{
    setupStatus: SetupStatus;
    created: { academicYearId: string; classIds: string[]; sectionIds: string[]; subjectIds: string[] };
  }> {
    this.assertCanReach(actor, id);

    // Reject if already set up — re-running would silently duplicate rows.
    const existingYears = await this.prisma.academicYear.count({
      where: { institutionId: id },
    });
    if (existingYears > 0) {
      throw new ConflictException(
        'Institution is already set up. Use PATCH endpoints to amend the structure.',
      );
    }

    // Validate date range
    const startDate = new Date(dto.academicYear.startDate);
    const endDate = new Date(dto.academicYear.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('Academic year dates are not valid ISO strings');
    }
    if (endDate <= startDate) {
      throw new BadRequestException('Academic year end date must be after start date');
    }

    // Validate unique class names + unique section names within each class.
    const classNameSet = new Set<string>();
    for (const cls of dto.classes) {
      const key = cls.name.toLowerCase().trim();
      if (classNameSet.has(key)) {
        throw new BadRequestException(`Duplicate class name: ${cls.name}`);
      }
      classNameSet.add(key);

      const sectionNameSet = new Set<string>();
      for (const sec of cls.sections) {
        const skey = sec.name.toLowerCase().trim();
        if (sectionNameSet.has(skey)) {
          throw new BadRequestException(
            `Duplicate section name "${sec.name}" within class ${cls.name}`,
          );
        }
        sectionNameSet.add(skey);
      }
    }

    // Validate unique subject names.
    const subjectNameSet = new Set<string>();
    for (const sub of dto.subjects) {
      const key = sub.name.toLowerCase().trim();
      if (subjectNameSet.has(key)) {
        throw new BadRequestException(`Duplicate subject name: ${sub.name}`);
      }
      subjectNameSet.add(key);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      // 1. Deactivate any other active academic year (only one active at a time).
      if (dto.academicYear.isActive !== false) {
        await tx.academicYear.updateMany({
          where: { institutionId: id, isActive: true },
          data: { isActive: false },
        });
      }

      // 2. Academic year
      const academicYear = await tx.academicYear.create({
        data: {
          institutionId: id,
          name: dto.academicYear.name.trim(),
          startDate,
          endDate,
          isActive: dto.academicYear.isActive ?? true,
        },
      });

      // 3. Classes + nested sections (sequential — Prisma can't batch nested creates with returned IDs)
      const classIds: string[] = [];
      const sectionIds: string[] = [];
      for (const cls of dto.classes) {
        const created = await tx.class.create({
          data: {
            institutionId: id,
            name: cls.name.trim(),
            ...(cls.boardType !== undefined && { boardType: cls.boardType }),
            ...(cls.gradeLevel !== undefined && { gradeLevel: cls.gradeLevel }),
            sections: {
              create: cls.sections.map((sec) => ({
                institutionId: id,
                name: sec.name.trim(),
              })),
            },
          },
          include: { sections: { select: { id: true } } },
        });
        classIds.push(created.id);
        sectionIds.push(...created.sections.map((s) => s.id));
      }

      // 4. Subjects — `createManyAndReturn` (Prisma 6+) returns the inserted
      // rows directly, avoiding the previous "createMany + findMany ordered by
      // createdAt desc" recovery dance that could surface the wrong rows if
      // the table had any prior subjects with colliding timestamps.
      const subjects = await tx.subject.createManyAndReturn({
        data: dto.subjects.map((sub) => ({
          institutionId: id,
          name: sub.name.trim(),
          ...(sub.code !== undefined && { code: sub.code }),
        })),
        select: { id: true },
      });

      return {
        academicYearId: academicYear.id,
        classIds,
        sectionIds,
        subjectIds: subjects.map((s) => s.id),
      };
    });

    this.logger.log(
      `Institution ${id} setup completed by ${actor.id}: ` +
        `${created.classIds.length} class(es), ${created.sectionIds.length} section(s), ${created.subjectIds.length} subject(s)`,
    );

    const setupStatus = await this.computeSetupStatus(id);
    return { setupStatus, created };
  }

  // ---------------------------------------------------------------------------
  // Setup status (used by the wizard + dashboard)
  // ---------------------------------------------------------------------------

  async getSetupStatus(actor: User, id: string): Promise<{ setupStatus: SetupStatus }> {
    this.assertCanReach(actor, id);
    return { setupStatus: await this.computeSetupStatus(id) };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Enforces tenant isolation: any non-SUPER_ADMIN must be acting on their
   * own institution. SUPER_ADMIN bypasses (cross-tenant platform role).
   * Returns 404 (not 403) for the cross-tenant case to avoid leaking that
   * the institution exists — CLAUDE.md §3 defense-in-depth.
   */
  private assertCanReach(actor: User, institutionId: string): void {
    if (actor.role === UserRole.SUPER_ADMIN) return;
    if (actor.institutionId === institutionId) return;
    throw new NotFoundException('Institution not found');
  }

  private async computeSetupStatus(institutionId: string): Promise<SetupStatus> {
    const [institution, academicYearCount, classGroups, sectionsCount, subjectsCount] =
      await this.prisma.$transaction([
        this.prisma.institution.findUnique({
          where: { id: institutionId },
          select: { contactPerson: true, contactEmail: true, contactPhone: true, address: true },
        }),
        this.prisma.academicYear.count({ where: { institutionId } }),
        this.prisma.class.findMany({
          where: { institutionId },
          select: { id: true },
        }),
        this.prisma.section.count({ where: { institutionId } }),
        this.prisma.subject.count({ where: { institutionId } }),
      ]);

    const profileComplete = Boolean(
      institution?.contactPerson &&
        (institution?.contactEmail || institution?.contactPhone),
    );
    const academicYearComplete = academicYearCount > 0;
    const classesComplete = classGroups.length > 0 && sectionsCount > 0;
    const subjectsComplete = subjectsCount > 0;

    return {
      isComplete:
        profileComplete && academicYearComplete && classesComplete && subjectsComplete,
      steps: {
        profile: { complete: profileComplete },
        academicYear: { complete: academicYearComplete, count: academicYearCount },
        classes: {
          complete: classesComplete,
          count: classGroups.length,
          sectionsCount,
        },
        subjects: { complete: subjectsComplete, count: subjectsCount },
      },
    };
  }

  private async attachSetupStatus(institution: Institution): Promise<InstitutionView> {
    const setupStatus = await this.computeSetupStatus(institution.id);
    return { ...institution, setupStatus };
  }
}
