"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormNotice } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import type { ListingStatus } from "@/generated/prisma/enums";
import {
  deleteListing,
  setPaused,
  withdrawFromReview,
} from "@/server/actions/listings";

/** Pause, resume, withdraw, delete — whichever apply to this status. */
export function ListingControls({
  listingId,
  status,
}: {
  listingId: string;
  status: ListingStatus;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(
    fn: () => Promise<{ ok: boolean; errors?: Record<string, string> }>,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.errors?.form ?? "That did not work. Try again.");
        return;
      }
      router.refresh();
    });
  }

  const canDelete = status === "DRAFT" || status === "REJECTED";

  return (
    <div className="flex flex-col gap-3">
      {error ? <FormNotice>{error}</FormNotice> : null}

      <div className="flex flex-wrap gap-3">
        {status === "LIVE" ? (
          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={pending}
            onClick={() => run(() => setPaused(listingId, true))}
          >
            Pause listing
          </Button>
        ) : null}

        {status === "PAUSED" ? (
          <Button
            type="button"
            size="md"
            disabled={pending}
            onClick={() => run(() => setPaused(listingId, false))}
          >
            Put it back up
          </Button>
        ) : null}

        {status === "ADMIN_REVIEW" ? (
          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={pending}
            onClick={() => run(() => withdrawFromReview(listingId))}
          >
            Pull it back to edit
          </Button>
        ) : null}

        {canDelete ? (
          confirmingDelete ? (
            <>
              <Button
                type="button"
                variant="secondary"
                size="md"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await deleteListing(listingId);
                    if (!result.ok) {
                      setError(result.errors.form ?? "Could not delete it.");
                      return;
                    }
                    router.push("/dashboard/listings");
                    router.refresh();
                  })
                }
              >
                {pending ? "Deleting…" : "Yes, delete it"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={() => setConfirmingDelete(false)}
              >
                Keep it
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="md"
              disabled={pending}
              onClick={() => setConfirmingDelete(true)}
            >
              Delete draft
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}
