import type { User } from '@prisma/client';
import type { Request } from 'express';

/**
 * An incoming HTTP request that has passed the JWT auth guard.
 *
 * The guard populates `user` (the Prisma User row) and `institutionId`
 * (denormalized for fast access from interceptors and services without
 * re-reading the user object).
 *
 * Public routes annotated with @Public() may NOT have these fields set.
 */
export interface AuthenticatedRequest extends Request {
  user?: User;
  institutionId?: string;
}
