import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Academic structure read endpoints.
 *
 * The institution setup wizard (POST /institutions/:id/setup) CREATES classes,
 * sections, subjects and the academic year, but until now nothing could READ
 * them back as a list — the only window was a counts-only setup-status. The
 * classroom-creation UI needs to populate class / section / subject / year
 * selectors, so these institution-scoped read endpoints exist.
 *
 * Multi-tenancy (CLAUDE.md §3): every query carries `institutionId` derived
 * from the JWT actor — never from path/body/query. These are deliberately
 * single-institution-scoped even for a SUPER_ADMIN (whose JWT pins them to one
 * institutionId); the consumer is a classroom-create form scoped to the admin's
 * own institution, so cross-tenant reach would be wrong here.
 *
 * Reference lists for dropdowns — an institution has tens of these, not
 * thousands — so they return the full set with a generous `take` cap as a
 * DoS floor rather than offering pagination.
 */
@Injectable()
export class AcademicService {
  constructor(private readonly prisma: PrismaService) {}

  /** Classes for the institution, each with its sections nested. */
  async listClasses(institutionId: string) {
    const classes = await this.prisma.class.findMany({
      where: { institutionId },
      take: 500,
      orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        boardType: true,
        gradeLevel: true,
        sections: {
          where: { institutionId },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        },
      },
    });
    return { data: classes };
  }

  /** Subjects for the institution. */
  async listSubjects(institutionId: string) {
    const subjects = await this.prisma.subject.findMany({
      where: { institutionId },
      take: 500,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true },
    });
    return { data: subjects };
  }

  /** Academic years for the institution, newest first, active flagged. */
  async listAcademicYears(institutionId: string) {
    const years = await this.prisma.academicYear.findMany({
      where: { institutionId },
      take: 200,
      orderBy: { startDate: 'desc' },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        isActive: true,
      },
    });
    return { data: years };
  }
}
