/**
 * Teacher sub-layout. See AdminLayout for the design rationale — the
 * 4px Teacher Orange strip gives a subtle role-context cue above the
 * page hero (CLAUDE.md §4 "Teacher Orange headers, action-first").
 */
export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div data-role="teacher">
      <div
        aria-hidden
        className="h-1 w-full bg-(image:--gradient-teacher-orange)"
      />
      {children}
    </div>
  );
}
