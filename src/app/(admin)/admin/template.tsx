/**
 * Re-mounted whenever you move to another desk, so each one arrives with a
 * short fade instead of snapping in. Within a desk it stays put.
 */
export default function AdminTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="animate-app-in">{children}</div>;
}
