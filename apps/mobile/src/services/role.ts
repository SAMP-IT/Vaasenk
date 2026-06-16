/**
 * Vaasenk Mobile — Role helpers.
 *
 * Centralises the mapping between backend roles and which navigator stack
 * to mount. Keeps navigation code free of string comparisons against role
 * literals so we don't have to grep when a new role lands.
 */

import type { MeResponse, UserRole } from './auth-types';

export type AppStackKey = 'student' | 'teacher' | 'admin-blocked';

/**
 * Map a backend role onto the mobile navigator key. Per the mobile PRD,
 * ADMIN and SUPER_ADMIN are web-only — the mobile app surfaces a polite
 * "Please use the web dashboard" screen rather than rendering a half-built
 * admin tab.
 */
export function stackForRole(role: UserRole): AppStackKey {
  switch (role) {
    case 'STUDENT':
      return 'student';
    case 'TEACHER':
      return 'teacher';
    case 'ADMIN':
    case 'SUPER_ADMIN':
    default:
      return 'admin-blocked';
  }
}

export function getRoleFromMe(me: MeResponse): UserRole {
  return me.user.role;
}
