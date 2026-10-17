"use client";

import {
  CheckCircle2Icon,
  RotateCcwIcon,
  StarIcon,
  StarOffIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Panel } from "@/components/admin/console";
import { FormNotice, TextArea } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import {
  approveListing,
  rejectListing,
  removeListing,
  reopenListing,
  setListingFeatured,
} from "@/server/actions/admin";

const MIN_REASON = 10;

/**
 * Approve, or send it back with a reason.
 *
 * Rejecting deliberately cannot be done in one click. The seller reads what is
 * typed here and has to act on it, so a bare "no" is not on offer.
 *
 * Approving is one click, and says what that click does: the listing becomes
 * public and buyers can open a deal on it immediately.
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
    <Panel className="border-primary/35">
      <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2">
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold text-fg">
            Your decision
          </h2>
          <p className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-muted">
            Recorded against your name in the audit trail either way. Approving
            publishes the listing to the marketplace at once and lets buyers
            open a deal on it.
          </p>
        </div>
        <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[0.6875rem] font-semibold text-muted">
          Logged
        </span>
      </div>

      {error ? (
        <div className="mt-4">
          <FormNotice>{error}</FormNotice>
        </div>
      ) : null}

      {mode === "idle" ? (
        <div className="mt-4 flex flex-wrap gap-3">
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
        <div className="mt-4">
          <TextArea
            id={reasonId}
            name="reason"
            label="What needs changing?"
            hint="The seller sees this word for word. Be specific enough to act on."
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="The revenue screenshot is from a different channel than the one in the listing."
            required
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
    </Panel>
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
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium text-muted transition-colors hover:border-danger/50 hover:text-danger"
        >
          <TriangleAlertIcon aria-hidden="true" className="size-4" />
          Take this listing down
        </button>
      </div>
    );
  }

  return (
    <Panel tone="danger">
      <h2 className="font-display text-base font-bold text-fg">
        Take this listing down
      </h2>
      <p className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-muted">
        It disappears from the marketplace and from search. Open offers and
        deals on it are not undone by this — end those on the deal desk.
      </p>
      {error ? (
        <div className="mt-4">
          <FormNotice>{error}</FormNotice>
        </div>
      ) : null}
      <TextArea
        id={reasonId}
        name="reason"
        label="Why is this coming down?"
        hint="Recorded against your name in the audit trail."
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="mt-4"
        required
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="md"
          variant="danger"
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
          disabled={pending}
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
        {reason.trim().length > 0 && reason.trim().length < MIN_REASON ? (
          <span className="text-xs text-subtle">
            A few more words — this is the record.
          </span>
        ) : null}
      </div>
    </Panel>
  );
}

/**
 * Undoing a takedown that should not have happened.
 *
 * It goes back to the review queue rather than straight to the marketplace, so
 * a moderator still approves it the normal way. Nothing about that is
 * irreversible — it can be taken down again — so there is a reason to give
 * and no second confirmation.
 */
export function ReopenListing({ listingId }: { listingId: string }) {
  const router = useRouter();
  const reasonId = useId();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-controls={panelId}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
        >
          <RotateCcwIcon aria-hidden="true" className="size-4" />
          Send it back to review
        </button>
      </div>
    );
  }

  return (
    <div id={panelId}>
      <Panel>
        <h2 className="font-display text-base font-bold text-fg">
          Send it back to review
        </h2>
        <p className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-muted">
          For a listing that came down in error. It goes into the review queue,
          not onto the marketplace — somebody still approves it there, or sends
          it back to the seller. The seller is told, and sees your reason.
        </p>
        {error ? (
          <div className="mt-4">
            <FormNotice>{error}</FormNotice>
          </div>
        ) : null}
        <TextArea
          id={reasonId}
          name="reason"
          label="Why is it coming back?"
          hint="The seller sees this word for word, and it is recorded against your name in the audit trail."
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="The report was about a different channel with a similar name."
          className="mt-4"
          required
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="md"
            disabled={pending || reason.trim().length < MIN_REASON}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await reopenListing(listingId, reason);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                router.push("/admin/listings");
                router.refresh();
              });
            }}
          >
            {pending ? "Sending…" : "Send it to the review queue"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="md"
            disabled={pending}
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
          >
            Cancel
          </Button>
          {reason.trim().length > 0 && reason.trim().length < MIN_REASON ? (
            <span className="text-xs text-subtle">
              A few more words — this is the record.
            </span>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}

/**
 * The homepage showcase, by hand.
 *
 * One press either way and reversible, so no confirmation — but it says what
 * the press does, because "featured" is a word for a badge and the real effect
 * is the top of the homepage.
 */
export function FeatureListing({
  listingId,
  featured,
}: {
  listingId: string;
  featured: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-fg">
            <StarIcon
              aria-hidden="true"
              className={
                featured
                  ? "size-4 shrink-0 fill-current text-primary-text"
                  : "size-4 shrink-0 text-subtle"
              }
            />
            {featured ? "Featured on the homepage" : "Not featured"}
          </h2>
          <p className="mt-1.5 max-w-[58ch] text-sm leading-relaxed text-muted">
            Featured listings lead the homepage showcase and carry the Featured
            badge everywhere they appear. Recorded in the audit trail.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={featured ? "secondary" : "primary"}
          disabled={pending}
          aria-pressed={featured}
          onClick={() => {
            setMessage(null);
            startTransition(async () => {
              const result = await setListingFeatured(listingId, !featured);
              setOk(result.ok);
              setMessage(result.ok ? result.message : result.error);
              if (result.ok) router.refresh();
            });
          }}
        >
          {featured ? (
            <StarOffIcon aria-hidden="true" className="size-4" />
          ) : (
            <StarIcon aria-hidden="true" className="size-4" />
          )}
          {pending ? "Saving…" : featured ? "Stop featuring it" : "Feature it"}
        </Button>
      </div>
      {message ? (
        <p
          role={ok ? "status" : "alert"}
          className={
            ok
              ? "mt-3 flex items-start gap-1.5 text-sm text-verified"
              : "mt-3 flex items-start gap-1.5 text-sm text-danger"
          }
        >
          {ok ? (
            <CheckCircle2Icon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
          ) : (
            <TriangleAlertIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
          )}
          <span>{message}</span>
        </p>
      ) : null}
    </Panel>
  );
}
