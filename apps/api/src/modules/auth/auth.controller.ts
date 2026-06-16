import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole, type User } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthService } from './auth.service';
import {
  AcceptInviteDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
} from './auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiResponse({ status: 200, description: 'Returns { user, accessToken, refreshToken, expiresAt }' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary:
      'Provision a new user under an institution. Admin or super-admin only.',
  })
  @ApiResponse({ status: 201, description: 'Returns { user }' })
  @ApiResponse({ status: 400, description: 'Validation error or missing institution' })
  @ApiResponse({ status: 403, description: 'Caller is not ADMIN/SUPER_ADMIN' })
  @ApiResponse({ status: 409, description: 'Email already exists in this institution' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('invite/accept')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Accept an invitation token and create the linked account',
    description:
      'Stubbed until the Invite model lands in a follow-up Sprint 1 session.',
  })
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.authService.acceptInvite(dto);
  }

  @Get('me')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Return the currently authenticated user and their institution',
  })
  @ApiResponse({ status: 200, description: 'Returns { user }' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  me(@CurrentUser() user: User) {
    return this.authService.me(user.id);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Sign out; revokes the refresh token on Supabase (best effort)',
  })
  logout(@Headers('authorization') authHeader?: string) {
    const token = this.extractBearer(authHeader);
    return this.authService.logout(token);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Request a Supabase password reset email',
    description:
      'Always responds 202 to avoid disclosing whether the email exists.',
  })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  private extractBearer(header: string | undefined): string | null {
    if (!header) return null;
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
    return token.trim();
  }
}
