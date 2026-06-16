import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Body,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole, type User } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateInviteDto, ListInvitesDto } from './invites.dto';
import { InvitesService } from './invites.service';

/**
 * Admin-facing invite management — institution-scoped.
 * The institutionId in the URL MUST match the caller's tenant; the service
 * enforces this defensively, but we also short-circuit at the controller.
 */
@ApiTags('invites')
@Controller('institutions/:institutionId/invites')
export class InstitutionInvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({ summary: 'Issue an invite for an email + role within the institution' })
  create(
    @CurrentUser() user: User,
    @Param('institutionId', new ParseUUIDPipe()) institutionId: string,
    @Body() dto: CreateInviteDto,
  ) {
    if (user.role !== UserRole.SUPER_ADMIN && institutionId !== user.institutionId) {
      throw new ForbiddenException('Cannot invite users into another institution');
    }
    return this.invites.create(institutionId, user, dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({ summary: 'List invites for the institution (default: pending only)' })
  list(
    @CurrentUser() user: User,
    @Param('institutionId', new ParseUUIDPipe()) institutionId: string,
    @Query() query: ListInvitesDto,
  ) {
    if (user.role !== UserRole.SUPER_ADMIN && institutionId !== user.institutionId) {
      throw new ForbiddenException('Cannot list invites for another institution');
    }
    return this.invites.list(institutionId, query);
  }
}

/**
 * Top-level invite endpoints — revoke (admin) and token preview (public).
 */
@ApiTags('invites')
@Controller('invites')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Public()
  @Get('token/:token')
  @ApiOperation({
    summary: 'Preview an invite by token — used by /register?token=... to show the email + role',
    description:
      'Public endpoint by design. Returns 404 if the token does not exist, 409 if accepted/revoked/expired.',
  })
  preview(@Param('token') token: string) {
    return this.invites.previewByToken(token);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({ summary: 'Revoke a pending invite' })
  revoke(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.invites.revoke(user.institutionId, id);
  }
}
