"use client";

import {
  CheckCircle2Icon,
  CheckIcon,
  RotateCcwIcon,
  StarIcon,
  StarOffIcon,
  TriangleAlertIcon,
  UndoDotIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/app/kit";
import { FormNotice, TextArea } from "@/components/auth/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  approveListing,
  rejectListing,
  removeListing,
  reopenListing,
  setListingFeatured,
} from "@/server/actions/admin";

const MIN_REASON = 10;

/**
 * A button label that swaps for its busy form without the button changing
 * width: both are laid in the same grid cell and the one not in use is
 * hidden, so the wider of the two sets the size. `invisible` also takes the
 * hidden one out of the accessible name.
 */
function Swap({
  busy,
  idle,
  label,
}: {
  busy: boolean;
  idle: ReactNode;
  label: string;
}) {
  return (
    <span className="inline-grid">
      <span className={cn("col-start-1 row-start-1", busy && "invisible")}>
        {idle}
      </span>
      <span className={cn("col-start-1 row-start-1", !busy && "invisible")}>
        {label}
      </span>
    </span>
  );
}

/** "A few more words" — shown under a reason that is still too short to send. */
function TooShort({
  reason,
  children,
}: {
  reason: string;
  children: ReactNode;
}) {
  const length = reason.trim().length;
  if (length === 0 || length >= MIN_REASON) return null;
  return <p className="mt-2 text-xs text-subtle">{children}</p>;
}

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
    // The one card on the page waiting on the reader, so it carries the gold
    // edge; everything else on the review page stays neutral.
    <Card className="border-primary/40">
      <CardHeader
        title="Your decision"
        description="Recorded against your name in the audit trail either way."
        actions={<Badge size="sm">Logged</Badge>}
      />
      <CardBody>
        {error ? <FormNotice>{error}</FormNotice> : null}

        {mode === "idle" ? (
          <>
            <p className="text-[0.8125rem] leading-relaxed text-muted">
              Approving publishes the listing to the marketplace at once and
              lets buyers open a deal on it.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:flex-col">
              <Button
                type="button"
                size="md"
                className="w-full sm:w-auto lg:w-full"
                disabled={pending}
                onClick={() => act(() => approveListing(listingId))}
              >
                <CheckIcon aria-hidden="true" />
                <Swap
                  busy={pending}
                  idle="Approve and publish"
                  label="Working…"
                />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="md"
                className="w-full sm:w-auto lg:w-full"
                disabled={pending}
                onClick={() => setMode("rejecting")}
              >
                <UndoDotIcon aria-hidden="true" />
                Send back to the seller
              </Button>
            </div>
          </>
        ) : (
          <>
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
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="md"
                disabled={pending || reason.trim().length < MIN_REASON}
                onClick={() => act(() => rejectListing(listingId, reason))}
              >
                <Swap busy={pending} idle="Send it back" label="Sending…" />
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
            </div>
            <TooShort reason={reason}>
              A few more words — this is the whole message.
            </TooShort>
          </>
        )}
      </CardBody>
    </Card>
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
        <Button
          type="button"
          variant="outline"
          size="md"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          className="w-full text-muted hover:border-danger/40 hover:text-danger sm:w-auto lg:w-full app:hover:border-danger/40"
        >
          <TriangleAlertIcon aria-hidden="true" />
          Take this listing down
        </Button>
      </div>
    );
  }

  return (
    <Card tone="danger">
      <CardHeader
        title="Take this listing down"
        description="It disappears from the marketplace and from search. Open offers and deals on it are not undone by this — end those on the deal desk."
        className="border-danger/15"
      />
      <CardBody>
        {error ? <FormNotice>{error}</FormNotice> : null}
        <TextArea
          id={reasonId}
          name="reason"
          label="Why is this coming down?"
          hint="Recorded against your name in the audit trail."
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
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
            <Swap busy={pending} idle="Take it down" label="Removing…" />
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
        </div>
        <TooShort reason={reason}>
          A few more words — this is the record.
        </TooShort>
      </CardBody>
    </Card>
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
        <Button
          type="button"
          variant="outline"
          size="md"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-controls={panelId}
          className="w-full sm:w-auto lg:w-full"
        >
          <RotateCcwIcon aria-hidden="true" />
          Send it back to review
        </Button>
      </div>
    );
  }

  return (
    <div id={panelId}>
      <Card>
        <CardHeader title="Send it back to review" />
        <CardBody>
          <p className="text-[0.8125rem] leading-relaxed text-muted">
            For a listing that came down in error. It goes into the review
            queue, not onto the marketplace — somebody still approves it there,
            or sends it back to the seller. The seller is told, and sees your
            reason.
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
          <div className="mt-3 flex flex-wrap items-center gap-2">
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
              <Swap
                busy={pending}
                idle="Send it to the review queue"
                label="Sending…"
              />
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
          </div>
          <TooShort reason={reason}>
            A few more words — this is the record.
          </TooShort>
        </CardBody>
      </Card>
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
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <StarIcon
              aria-hidden="true"
              className={
                featured
                  ? "size-4 shrink-0 fill-current text-primary-text"
                  : "size-4 shrink-0 text-subtle"
              }
            />
            {featured ? "Featured on the homepage" : "Not featured"}
          </span>
        }
        description="Featured listings lead the homepage showcase and carry the Featured badge everywhere they appear. Recorded in the audit trail."
      />
      <CardBody className="py-3 sm:py-4">
        <Button
          type="button"
          size="sm"
          variant={featured ? "secondary" : "primary"}
          className="w-full sm:w-auto lg:w-full"
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
            <StarOffIcon aria-hidden="true" />
          ) : (
            <StarIcon aria-hidden="true" />
          )}
          <Swap
            busy={pending}
            idle={featured ? "Stop featuring it" : "Feature it"}
            label="Saving…"
          />
        </Button>
        {message ? (
          <p
            role={ok ? "status" : "alert"}
            className={cn(
              "mt-3 flex items-start gap-1.5 text-[0.8125rem] leading-relaxed",
              ok ? "text-verified" : "text-danger",
            )}
          >
            {ok ? (
              <CheckCircle2Icon
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
              />
            ) : (
              <TriangleAlertIcon
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
              />
            )}
            <span>{message}</span>
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
