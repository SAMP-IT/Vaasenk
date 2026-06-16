import {
  ExecutionContext,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import type { AuthenticatedRequest } from '../types/authenticated-request';

/**
 * Controller-method parameter decorator that yields the authenticated Prisma
 * User row attached by the JWT guard. Throws 401 if used on a route the
 * guard did not authenticate.
 *
 * Optional sub-field access:
 *   @CurrentUser() user: User
 *   @CurrentUser('id') userId: string
 */
export const CurrentUser = createParamDecorator(
  (data: keyof User | undefined, ctx: ExecutionContext): User | User[keyof User] => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('No authenticated user on request');
    }
    return data ? user[data] : user;
  },
);
