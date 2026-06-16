import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key honored by the global JWT and Roles guards. Endpoints
 * tagged with @Public() skip authentication and role checks entirely.
 */
export const IS_PUBLIC_KEY = 'isPublic';

export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
