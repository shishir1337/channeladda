import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Not found",
  robots: { index: false, follow: false },
};

/**
 * Also what someone without the right role gets. `requireRole` sends them here
 * rather than to a "forbidden" page: that an admin route exists is not
 * information they have any use for.
 */
export default function AdminNotFound() {
  return (
    <div className="mx-auto w-full max-w-[40rem] px-4 py-20 text-center sm:px-6">
      <h1 className="font-display text-2xl font-black tracking-tight text-fg">
        Nothing here
      </h1>
      <p className="mt-3 text-muted">
        That page does not exist, or is not open to your account.
      </p>
      <Link
        href="/admin"
        className="mt-6 inline-flex min-h-11 items-center rounded-xl border border-line px-5 text-sm text-fg transition-colors hover:bg-surface-2"
      >
        Back to the overview
      </Link>
    </div>
  );
}
