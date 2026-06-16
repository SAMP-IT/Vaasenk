/**
 * Admin sub-layout. The dashboard chrome (sidebar + topbar) lives one
 * level up at apps/web/src/app/(dashboard)/layout.tsx.
 *
 * The 4px role-accent strip at the top is a subtle visual cue — the
 * Admin Royal gradient saying "you are in admin space" — without
 * competing with the page-level hero gradients below it (CLAUDE.md §4
 * "Admin Royal gradient headers"). Purely decorative, hence aria-hidden.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-role="admin">
      <div
        aria-hidden
        className="h-1 w-full bg-(image:--gradient-admin-royal)"
      />
      {children}
    </div>
  );
}
