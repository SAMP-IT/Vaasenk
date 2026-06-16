import { PageShell } from '@/components/ui/page-shell';

/**
 * Chrome-less full-screen layout for distraction-free reading.
 *
 * The (viewer) route group exists separately from (dashboard) because the
 * note viewer needs the entire viewport — no sidebar, no top nav. Per the
 * Sprint 2.5 spec ("full-screen viewer" + "bottom action bar"), this
 * layout intentionally renders nothing but the children inside a `bare`
 * PageShell, so the Cream Sunrise background is preserved but the floating
 * decorative blobs are dropped (they'd compete with the document being
 * read).
 *
 * Route groups don't affect the URL, so /student/classrooms/[id]/notes/...
 * resolves correctly even though the file lives under (viewer).
 */
export default function ViewerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PageShell bare>{children}</PageShell>;
}
