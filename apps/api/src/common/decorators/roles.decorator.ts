import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restrict a controller or handler to one or more UserRole values.
 *
 * Example:
 *   @Roles(UserRole.ADMIN, UserRole.TEACHER)
 *
 * Without @Roles, an authenticated user of any role is allowed (subject to
 * other guards). Pair with @Public() to make a route anonymous.
 */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
