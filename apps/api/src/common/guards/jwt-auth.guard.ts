import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import type { AuthenticatedRequest } from '../types/authenticated-request';

/**
 * Global authentication guard. For every request that is NOT marked
 * @Public(), it:
 *   1. Extracts the Bearer token from the Authorization header.
 *   2. Verifies the token with Supabase Auth (auth.getUser).
 *   3. Looks up the local Prisma User row keyed by the Supabase user id.
 *   4. Rejects soft-deleted or non-existent users.
 *   5. Attaches `req.user` and `req.institutionId` for downstream handlers.
 *
 * Production note: this currently does an HTTP round-trip to Supabase per
 * request. A follow-up Sprint should switch to JWKS-based signature
 * verification (passport-jwt + jwks-rsa) and cache user lookups.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly supabase: SupabaseService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(req.headers['authorization']);
    if (!token) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }

    const { data, error } = await this.supabase.admin.auth.getUser(token);
    if (error || !data?.user) {
      this.logger.debug(`Supabase token rejected: ${error?.message ?? 'no user'}`);
      throw new UnauthorizedException('Invalid or expired token');
    }

    const supabaseUserId = data.user.id;
    // Defensive: a non-UUID id would make the Prisma lookup throw a UUID-parse
    // error (HTTP 500) instead of failing closed. Reject it cleanly as 401.
    if (!isUUID(supabaseUserId)) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: supabaseUserId },
    });

    if (!user) {
      throw new UnauthorizedException('User profile is not provisioned');
    }
    if (user.deletedAt) {
      throw new UnauthorizedException('User account has been deactivated');
    }

    req.user = user;
    req.institutionId = user.institutionId;
    return true;
  }

  private extractBearerToken(header: string | string[] | undefined): string | null {
    if (!header || Array.isArray(header)) {
      return null;
    }
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return null;
    }
    return token.trim();
  }
}
