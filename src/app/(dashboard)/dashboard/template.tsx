/**
 * Re-mounted whenever you move to another section, so each one arrives with
 * a short fade instead of snapping in. Within a section (one thread to the
 * next, a deal to its detail) it stays put, so nothing flickers.
 */
export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="animate-app-in">{children}</div>;
}
