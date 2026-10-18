import { ShieldAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { IconTile } from "@/components/app/kit";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Not found",
  robots: { index: false, follow: false },
};

/**
 * Also what someone without the right role gets. `requireRole` sends them here
 * rather than to a "forbidden" page: that an admin route exists is not
 * information they have any use for.
 *
 * Drawn like the kit's `EmptyState`, but by hand, because this is the whole
 * page and its title has to be the page's `h1`.
 */
export default function AdminNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-[34rem] flex-col items-center px-4 py-16 text-center sm:py-24">
      <IconTile icon={ShieldAlertIcon} size="lg" />
      <h1 className="mt-4 text-[0.9375rem] leading-6 font-semibold text-fg">
        Nothing here
      </h1>
      <p className="mt-1 max-w-[46ch] text-[0.8125rem] leading-relaxed text-muted">
        That page does not exist, or is not open to your account. Each desk
        answers to a different role.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button asChild size="md">
          <Link href="/admin">Back to the staff overview</Link>
        </Button>
        <Button asChild variant="outline" size="md">
          <Link href="/admin/deals">Deal desk</Link>
        </Button>
      </div>
    </div>
  );
}
