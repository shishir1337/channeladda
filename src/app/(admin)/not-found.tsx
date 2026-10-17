import { ShieldAlertIcon } from "lucide-react";
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
    <div className="mx-auto w-full max-w-[34rem] px-4 py-16 text-center sm:px-6 sm:py-24">
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-subtle">
        <ShieldAlertIcon aria-hidden="true" className="size-6" />
      </span>
      <h1 className="mt-5 font-display text-2xl font-black tracking-tight text-fg">
        Nothing here
      </h1>
      <p className="mx-auto mt-2.5 max-w-[42ch] text-sm leading-relaxed text-muted">
        That page does not exist, or is not open to your account. Desks are kept
        apart on purpose — moderation, money and transfers each answer to a
        different role.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2.5">
        <Link
          href="/admin"
          className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-fg shadow-soft transition-opacity hover:opacity-90"
        >
          Back to the overview
        </Link>
        <Link
          href="/admin/deals"
          className="inline-flex min-h-11 items-center rounded-xl border border-line px-5 text-sm font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
        >
          Deal desk
        </Link>
      </div>
    </div>
  );
}
