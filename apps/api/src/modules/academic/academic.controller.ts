import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole, type User } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AcademicService } from './academic.service';

/**
 * Read-only views of the institution's academic structure, used by the
 * classroom-creation UI to populate its class / section / subject / year
 * selectors. Admin-only — these are setup-management surfaces.
 *
 * Routes are top-level (`/api/v1/classes`, `/subjects`, `/academic-years`)
 * per the CLAUDE.md §7 resource convention. Scoping is by `user.institutionId`
 * (CLAUDE.md §3) — never from path/body/query.
 */
@ApiTags('academic')
@Controller()
export class AcademicController {
  constructor(private readonly academic: AcademicService) {}

  @Get('classes')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'List the institution’s classes, each with their sections',
  })
  classes(@CurrentUser() user: User) {
    return this.academic.listClasses(user.institutionId);
  }

  @Get('subjects')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({ summary: 'List the institution’s subjects' })
  subjects(@CurrentUser() user: User) {
    return this.academic.listSubjects(user.institutionId);
  }

  @Get('academic-years')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'List the institution’s academic years (active flagged)',
  })
  academicYears(@CurrentUser() user: User) {
    return this.academic.listAcademicYears(user.institutionId);
  }
}
