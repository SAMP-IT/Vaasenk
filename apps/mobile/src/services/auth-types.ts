/**
 * Vaasenk Mobile — Auth view types.
 *
 * Mirrors the backend `AuthUserView` shape from apps/api/src/modules/auth/
 * without coupling to the Prisma types (mobile doesn't have Prisma; the
 * backend ships a clean DTO over the wire). When @vaasenk/shared-types
 * grows a Zod schema for AuthUserView, swap this file for an import.
 */

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'TEACHER' | 'STUDENT';
export type UserStatus = 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'ARCHIVED';

export type AuthInstitution = {
  id: string;
  name: string;
  status: UserStatus;
  subscriptionPlan: string;
};

export type AuthUserView = {
  id: string;
  institutionId: string;
  email: string;
  name: string;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  avatarUrl: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  institution: AuthInstitution;
};

export type LoginResponse = {
  user: AuthUserView;
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
};

export type MeResponse = {
  user: AuthUserView;
};
