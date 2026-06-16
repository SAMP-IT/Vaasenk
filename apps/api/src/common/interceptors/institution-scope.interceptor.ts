import {
  CallHandler,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedRequest } from '../types/authenticated-request';

/**
 * Defense-in-depth for CLAUDE.md §3 (Multi-Tenancy Rules).
 *
 * The JWT guard is responsible for attaching `req.institutionId` from the
 * authenticated user. This interceptor guarantees the field is present on
 * every non-@Public() request before any controller logic runs — if it's
 * missing, that's a bug in the auth pipeline and we refuse to serve.
 *
 * It also re-syncs `req.institutionId` from `req.user.institutionId` if a
 * downstream handler accidentally cleared one but not the other.
 */
@Injectable()
export class InstitutionScopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (req.user && !req.institutionId) {
      req.institutionId = req.user.institutionId;
    }

    if (!req.institutionId) {
      throw new InternalServerErrorException(
        'Tenant scope (institutionId) is missing on an authenticated request. ' +
          'Check that JwtAuthGuard ran before InstitutionScopeInterceptor.',
      );
    }

    return next.handle();
  }
}
