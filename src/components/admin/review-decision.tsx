"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { FormNotice } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import {
  approveListing,
  rejectListing,
  removeListing,
} from "@/server/actions/admin";

const MIN_REASON = 10;

/**
 * Approve, or send it back with a reason.
 *
 * Rejecting deliberately cannot be done in one click. The seller reads what is
 * typed here and has to act on it, so a bare "no" is not on offer.
 */
export function ReviewDecision({ listingId }: { listingId: string }) {
  const router = useRouter();
  const reasonId = useId();
  const [mode, setMode] = useState<"idle" | "rejecting">("idle");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "That did not work. Try again.");
        return;
      }
      router.push("/admin/listings");
      router.refresh();
    });
  }

  return (
    <div className="rounded-panel border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold text-fg">Your decision</h2>

      {error ? (
        <div className="mt-4">
          <FormNotice>{error}</FormNotice>
        </div>
      ) : null}

      {mode === "idle" ? (
        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            type="button"
            size="md"
            disabled={pending}
            onClick={() => act(() => approveListing(listingId))}
          >
            {pending ? "Working…" : "Approve and publish"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={pending}
            onClick={() => setMode("rejecting")}
          >
            Send back to the seller
          </Button>
        </div>
      ) : (
        <div className="mt-5">
          <label
            htmlFor={reasonId}
            className="block text-sm font-medium text-fg"
          >
            What needs changing?
          </label>
          <p className="mt-1 text-xs text-subtle">
            The seller sees this word for word. Be specific enough to act on.
          </p>
          <textarea
            id={reasonId}
            name="reason"
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="The revenue screenshot is from a different channel than the one in the listing."
            className="mt-2 w-full rounded-xl border border-line bg-surface-2 p-3.5 text-base text-fg placeholder:text-subtle focus:border-primary/60 focus:outline-none sm:text-[0.9375rem]"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="md"
              disabled={pending || reason.trim().length < MIN_REASON}
              onClick={() => act(() => rejectListing(listingId, reason))}
            >
              {pending ? "Sending…" : "Send it back"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="md"
              disabled={pending}
              onClick={() => {
                setMode("idle");
                setError(null);
              }}
            >
              Cancel
            </Button>
            {reason.trim().length > 0 && reason.trim().length < MIN_REASON ? (
              <span className="text-xs text-subtle">
                A few more words — this is the whole message.
              </span>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/** Taking a live listing down. Separate because it is not part of review. */
export function RemoveListing({ listingId }: { listingId: string }) {
  const router = useRouter();
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-line px-4 text-sm text-muted transition-colors hover:border-danger/50 hover:text-danger"
      >
        Take this listing down
      </button>
    );
  }

  return (
    <div className="rounded-panel border border-danger/30 bg-danger-soft p-5">
      {error ? <FormNotice>{error}</FormNotice> : null}
      <label htmlFor={reasonId} className="block text-sm font-medium text-fg">
        Why is this coming down?
      </label>
      <p className="mt-1 text-xs text-muted">
        Recorded against your name in the audit trail.
      </p>
      <textarea
        id={reasonId}
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="mt-2 w-full rounded-xl border border-line bg-surface p-3.5 text-base text-fg focus:border-danger/60 focus:outline-none sm:text-[0.9375rem]"
      />
      <div className="mt-3 flex flex-wrap gap-3">
        <Button
          type="button"
          size="md"
          disabled={pending || reason.trim().length < MIN_REASON}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await removeListing(listingId, reason);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              router.push("/admin/listings");
              router.refresh();
            });
          }}
        >
          {pending ? "Removing…" : "Take it down"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="md"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
