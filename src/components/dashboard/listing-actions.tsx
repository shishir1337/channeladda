"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormNotice } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import type { ListingStatus } from "@/generated/prisma/enums";
import {
  deleteListing,
  setPaused,
  submitForReview,
  withdrawFromReview,
} from "@/server/actions/listings";

/**
 * The ownership code, and the step that follows it.
 *
 * The code being on the profile is what ties a real account to a Channel Adda
 * seller. Nobody but the account owner can put it there, which is the whole
 * point — the seller's word is not evidence, but their bio is.
 */
export function OwnershipStep({
  listingId,
  code,
  platformName,
  hasProof,
}: {
  listingId: string;
  code: string;
  platformName: string;
  hasProof: boolean;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-panel border border-primary/30 bg-primary-soft p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold text-fg">
        Prove the account is yours
      </h2>
      <p className="mt-2 max-w-[58ch] text-sm leading-relaxed text-muted">
        Put this code anywhere public on the {platformName} account — the bio,
        the description, the about section. A moderator will look for it. You
        can take it out once the listing is approved.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <code className="rounded-xl border border-primary/30 bg-surface px-4 py-3 font-mono text-base font-semibold tracking-wider text-fg">
          {code}
        </code>
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // Clipboard access can be refused; the code is on screen anyway.
              setError(
                "Could not copy it — select the code and copy manually.",
              );
            }
          }}
        >
          {copied ? (
            <>
              <CheckIcon aria-hidden="true" className="size-4" />
              Copied
            </>
          ) : (
            <>
              <CopyIcon aria-hidden="true" className="size-4" />
              Copy code
            </>
          )}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {!hasProof ? (
        <p className="mt-4 text-sm text-danger">
          You will also need at least one screenshot from inside the account
          before this can go for review.
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          type="button"
          size="md"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await submitForReview(listingId);
              if (!result.ok) {
                setError(result.errors.form ?? "That did not work. Try again.");
                return;
              }
              router.refresh();
            });
          }}
        >
          {pending ? "Sending…" : "The code is live — send for review"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="md"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              await withdrawFromReview(listingId);
              router.refresh();
            });
          }}
        >
          Back to draft
        </Button>
      </div>
    </div>
  );
}

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
