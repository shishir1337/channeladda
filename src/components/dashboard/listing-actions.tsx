"use client";

import {
  Loader2Icon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  TrashIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { FormNotice } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import type { ListingStatus } from "@/generated/prisma/enums";
import { countOf } from "@/lib/plural";
import {
  removeListing,
  setPaused,
  withdrawFromReview,
} from "@/server/actions/listings";

/**
 * What pressing "Remove listing" does to this one, in a sentence or two.
 *
 * Said before the press, because it cannot be undone from here: a draft is
 * deleted, and anything that was ever in front of buyers leaves the
 * marketplace for good.
 */
function removalText(
  status: ListingStatus,
  deletes: boolean,
  openOffers: number,
  unpaidDeals: number,
) {
  if (deletes) return "It is deleted for good. Buyers never saw it.";
  if (status === "CODE_CHECK" || status === "ADMIN_REVIEW") {
    return "It will not go on sale, and this cannot be undone. Buyers never saw it.";
  }
  const offers =
    openOffers > 0
      ? `Its ${countOf(openOffers, "open offer")} ${openOffers === 1 ? "is" : "are"} declined.`
      : "Open offers are declined.";
  const deals =
    unpaidDeals > 0
      ? ` ${countOf(unpaidDeals, "unpaid deal")} on it ${unpaidDeals === 1 ? "closes" : "close"}.`
      : "";
  const told = openOffers + unpaidDeals > 0 ? " Every buyer is told." : "";
  return `Buyers can no longer see or buy it. ${offers}${deals}${told} This cannot be undone.`;
}

/**
 * Pause, resume, withdraw and remove: whichever apply to this status.
 *
 * Remove is red and asks once more, as cancelling a deal does, and the
 * question says what happens rather than "Are you sure?".
 */
export function ListingControls({
  listingId,
  status,
  canRemove,
  deletes,
  openOffers = 0,
  unpaidDeals = 0,
  removeBlocked,
  confirmFirst = false,
}: {
  listingId: string;
  status: ListingStatus;
  /** False while a deal holds it, or once it is sold or gone. */
  canRemove: boolean;
  /** A draft nobody has written to: removing it deletes it. */
  deletes: boolean;
  openOffers?: number;
  unpaidDeals?: number;
  /** Removing is refused for now, with this reason (a payment on its way). */
  removeBlocked?: string | null;
  /** Arrived from the list's "Remove listing": open on the question. */
  confirmFirst?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(
    confirmFirst && canRemove && !removeBlocked,
  );
  const [pending, startTransition] = useTransition();
  const [removing, setRemoving] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);

  // Arriving from the list with the question already open: bring it into
  // view on a phone, where it sits below the fold.
  useEffect(() => {
    if (confirmFirst) {
      confirmRef.current?.scrollIntoView({ block: "center" });
    }
  }, [confirmFirst]);

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

  function remove() {
    setError(null);
    setRemoving(true);
    startTransition(async () => {
      const result = await removeListing(listingId);
      if (!result.ok) {
        setError(result.errors.form ?? "It could not be removed. Try again.");
        setConfirming(false);
        setRemoving(false);
        return;
      }
      router.push("/dashboard/listings");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <FormNotice>{error}</FormNotice> : null}

      {confirming ? (
        <div
          ref={confirmRef}
          role="alertdialog"
          aria-labelledby={`${listingId}-remove-title`}
          aria-describedby={`${listingId}-remove-body`}
          className="rounded-lg border border-danger/25 bg-danger-soft/60 p-3.5"
        >
          <p
            id={`${listingId}-remove-title`}
            className="text-sm leading-5 font-semibold text-fg"
          >
            Remove this listing?
          </p>
          <p
            id={`${listingId}-remove-body`}
            className="mt-1 max-w-[62ch] text-[0.8125rem] leading-relaxed text-muted"
          >
            {removalText(status, deletes, openOffers, unpaidDeals)}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="danger"
              size="md"
              className="w-full sm:w-auto"
              disabled={pending}
              onClick={remove}
            >
              {removing ? (
                <Loader2Icon aria-hidden="true" className="animate-spin" />
              ) : (
                <TrashIcon aria-hidden="true" />
              )}
              {removing ? "Removing…" : "Yes, remove it"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="md"
              className="w-full sm:w-auto"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Keep it
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {status === "LIVE" ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => run(() => setPaused(listingId, true))}
            >
              <PauseIcon aria-hidden="true" />
              Pause listing
            </Button>
          ) : null}

          {status === "PAUSED" ? (
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => run(() => setPaused(listingId, false))}
            >
              <PlayIcon aria-hidden="true" />
              Put it back up
            </Button>
          ) : null}

          {status === "ADMIN_REVIEW" ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => run(() => withdrawFromReview(listingId))}
            >
              <PencilIcon aria-hidden="true" />
              Pull it back to edit
            </Button>
          ) : null}

          {canRemove ? (
            <Button
              type="button"
              variant="danger-outline"
              size="sm"
              disabled={pending || Boolean(removeBlocked)}
              onClick={() => setConfirming(true)}
            >
              <TrashIcon aria-hidden="true" />
              Remove listing
            </Button>
          ) : null}
        </div>
      )}

      {removeBlocked && canRemove ? (
        <p className="text-[0.8125rem] leading-relaxed text-muted">
          {removeBlocked}
        </p>
      ) : null}
    </div>
  );
}
