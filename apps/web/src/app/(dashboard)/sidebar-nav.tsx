'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  ClipboardList,
  CreditCard,
  FileText,
  GraduationCap,
  LayoutDashboard,
  School,
  Settings,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Sidebar nav for the (dashboard) layout. Client component so we can read
 * the active pathname for the visual "current route" highlight.
 *
 * Icon references are passed as STRING KEYS (not function references) from
 * the server-component layout — server → client boundaries cannot serialize
 * raw component identifiers. The lookup table `ICONS` below resolves a key
 * back to a Lucide component on the client.
 *
 * Active state is computed via prefix match — `/admin/teachers/123` still
 * highlights "Teachers". Index-like routes use strict equality so they
 * don't capture every sub-route.
 *
 * Each item can be flagged `comingSoon` to render a small "v2" badge — the
 * link still navigates (the destination renders a polite placeholder page)
 * but it visually signals the route isn't a fully-built feature yet.
 */

export type IconKey =
  | 'dashboard'
  | 'school'
  | 'users'
  | 'graduation-cap'
  | 'file-text'
  | 'clipboard-list'
  | 'book-open'
  | 'credit-card'
  | 'settings'
  | 'sparkles';

const ICONS: Record<IconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  school: School,
  users: Users,
  'graduation-cap': GraduationCap,
  'file-text': FileText,
  'clipboard-list': ClipboardList,
  'book-open': BookOpen,
  'credit-card': CreditCard,
  settings: Settings,
  sparkles: Sparkles,
};

export type NavItem = {
  href: string;
  label: string;
  iconKey: IconKey;
  comingSoon?: boolean;
};

export type ComingSoonItem = {
  label: string;
  iconKey: IconKey;
};

export function DashboardSidebarNav({
  items,
  groupLabel,
  comingSoon,
}: {
  items: ReadonlyArray<NavItem>;
  groupLabel: string;
  comingSoon?: ReadonlyArray<ComingSoonItem>;
}) {
  const pathname = usePathname() ?? '';

  function isActive(href: string): boolean {
    // Strict equality for index-like routes (e.g. /admin/dashboard),
    // prefix-match for sectional routes (e.g. /admin/teachers/123).
    if (href === pathname) return true;
    return pathname.startsWith(`${href}/`);
  }

  return (
    <nav className="flex flex-col gap-1" aria-label={groupLabel}>
      <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-(--vaasenk-subtle)">
        {groupLabel}
      </p>
      {items.map(({ href, label, iconKey, comingSoon: itemComingSoon }) => {
        const Icon = ICONS[iconKey];
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
              active
                ? 'bg-(--vaasenk-rose-wash) text-(--vaasenk-red)'
                : 'text-(--vaasenk-deep-maroon) hover:bg-(--vaasenk-rose-wash) hover:text-(--vaasenk-red)',
            )}
          >
            <Icon
              className={cn(
                'size-4 transition-opacity',
                active ? 'opacity-100' : 'opacity-80 group-hover:opacity-100',
              )}
            />
            <span className="flex-1 truncate">{label}</span>
            {itemComingSoon ? (
              <span
                className="rounded-full bg-(--vaasenk-peach-wash) px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-(--vaasenk-deep-maroon)"
                aria-label="Coming in v2"
              >
                v2
              </span>
            ) : null}
          </Link>
        );
      })}

      {comingSoon && comingSoon.length > 0 ? (
        <>
          <p className="mt-6 px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-(--vaasenk-subtle)">
            Coming soon
          </p>
          {comingSoon.map(({ label, iconKey }) => {
            const Icon = ICONS[iconKey];
            return (
              <span
                key={label}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-(--vaasenk-subtle)"
              >
                <Icon className="size-4 opacity-60" />
                {label}
              </span>
            );
          })}
        </>
      ) : null}
    </nav>
  );
}
