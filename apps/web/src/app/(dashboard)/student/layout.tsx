/**
 * Student sub-layout. See AdminLayout for the design rationale — the
 * 4px Student Coral strip gives a subtle role-context cue above the
 * page hero (CLAUDE.md §4 "Student Coral headers, reading-focused").
 */
export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div data-role="student">
      <div
        aria-hidden
        className="h-1 w-full bg-(image:--gradient-student-coral)"
      />
      {children}
    </div>
  );
}
