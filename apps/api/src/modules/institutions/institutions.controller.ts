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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole, type User } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CreateInstitutionDto,
  SetupInstitutionDto,
  UpdateInstitutionDto,
} from './institutions.dto';
import { InstitutionsService } from './institutions.service';

@ApiTags('institutions')
@Controller('institutions')
export class InstitutionsController {
  constructor(private readonly institutions: InstitutionsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({ summary: 'Create a new institution (SUPER_ADMIN platform action)' })
  create(@CurrentUser() user: User, @Body() dto: CreateInstitutionDto) {
    return this.institutions.create(user, dto);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({ summary: 'Get institution details + setup status' })
  detail(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.institutions.findOne(user, id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({ summary: 'Update institution profile (admin of that institution)' })
  update(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateInstitutionDto,
  ) {
    return this.institutions.update(user, id, dto);
  }

  @Post(':id/setup')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary:
      'Step-based academic setup: creates academic_year, classes, sections, and subjects in one transaction. Idempotency-guarded — rejects if the institution already has an academic year.',
  })
  setup(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetupInstitutionDto,
  ) {
    return this.institutions.setup(user, id, dto);
  }

  @Get(':id/setup-status')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({ summary: 'Get the setup checklist (used by the admin wizard)' })
  setupStatus(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.institutions.getSetupStatus(user, id);
  }
}
