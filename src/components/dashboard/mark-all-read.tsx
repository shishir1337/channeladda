"use client";

import { CheckCheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { readAll } from "@/server/actions/notifications";

/** One button, so the page it sits on can stay a server component. */
export function MarkAllRead() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="md"
      variant="secondary"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await readAll();
          router.refresh();
        })
      }
    >
      <CheckCheckIcon aria-hidden="true" className="size-4" />
      {pending ? "Marking…" : "Mark all read"}
    </Button>
  );
}
