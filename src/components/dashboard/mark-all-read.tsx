"use client";

import { CheckCheckIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { readAll } from "@/server/actions/notifications";

/** One button, so the page it sits on can stay a server component. */
export function MarkAllRead() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await readAll();
          router.refresh();
        })
      }
    >
      {/* Both labels share one grid cell and only one is visible, so the
          button keeps its width while it works instead of shrinking. */}
      <span className="grid">
        <span
          className={cn(
            "col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5",
            pending && "invisible",
          )}
        >
          <CheckCheckIcon aria-hidden="true" />
          Mark all read
        </span>
        <span
          className={cn(
            "col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5",
            !pending && "invisible",
          )}
        >
          <Loader2Icon aria-hidden="true" className="animate-spin" />
          Marking…
        </span>
      </span>
    </Button>
  );
}
