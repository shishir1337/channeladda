"use client";

import { CheckIcon, CopyIcon, LinkIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { platforms } from "@/data/platforms";
import type { ListingStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import {
  checkOwnershipCode,
  issueOwnershipCode,
} from "@/server/actions/channel-lookup";
import { submitForReview, withdrawFromReview } from "@/server/actions/listings";

/**
 * Proving the seller controls the account they are listing.
 *
 * The whole check rests on one fact: anybody can paste a link, and only the
 * owner can edit the profile behind it. So we issue a code, they put it on the
 * profile, and it is read back — by us on YouTube, where there is an API for
 * it, and by a moderator everywhere else.
 *
 * One panel. A listing waiting on its code used to show two — this one and a
 * second underneath — each with its own heading, its own copy of the code and
 * its own copy button, and both telling an Instagram, Telegram, Facebook or
 * website seller to open YouTube Studio. Where the code goes now comes from
 * the platform's own entry in `data/platforms`, next to everything else that
 * differs per platform, and the two ways forward are two buttons in one place.
 *
 * The code is issued once and re-shown rather than regenerated, because a
 * seller who has already pasted one somewhere must not be handed a different
 * one and then fail verification for ever without understanding why.
 *
 * Verified listings never reach this: the page shows its own "verified" panel
 * instead, so there is no verified branch in here to keep in step with it.
 */

type Busy = "issue" | "check" | "send" | "draft";
type Notice = { text: string; tone: "ok" | "info" | "bad" };

/** For a platform id this build does not know: say nothing wrong. */
const UNKNOWN = {
  name: "the platform",
  ownershipCheck: {
    place: "a public part of the profile",
    steps: [
      "Open the account’s public profile settings.",
      "Paste the code anywhere public, such as the bio or description, and save.",
    ],
    automatic: false,
  },
};

export function OwnershipPanel({
  listingId,
  code: initialCode,
  platform,
  status,
  hasProof,
}: {
  listingId: string;
  code: string | null;
  /** The lower-case platform id, as the seller's listing read returns it. */
  platform: string;
  status: ListingStatus;
  /** At least one proof screenshot is attached, which review requires. */
  hasProof: boolean;
}) {
  const router = useRouter();
  const headingId = useId();
  const stepsId = useId();
  const [code, setCode] = useState(initialCode);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [pending, startTransition] = useTransition();

  const meta = platforms.find((p) => p.id === platform) ?? UNKNOWN;
  const how = meta.ownershipCheck;
  const waitingOnSeller = status === "CODE_CHECK";
  const inReview = status === "ADMIN_REVIEW";
  // Checking moves the listing: to review when the code is found, and to
  // CODE_CHECK whenever it cannot be read automatically — from any status. So
  // it is only offered where CODE_CHECK is where the listing already is. From
  // review it could pull a listing out of the moderator's queue, and from a
  // rejected one it would skip the edit the moderator asked for.
  const canCheck = how.automatic && waitingOnSeller;

  function run(which: Busy, fn: () => Promise<Notice | null>) {
    setNotice(null);
    setBusy(which);
    startTransition(async () => {
      const result = await fn();
      setNotice(result);
      setBusy(null);
    });
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the code is on screen anyway.
      setNotice({
        tone: "bad",
        text: "Could not copy it — select the code and copy it by hand.",
      });
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "rounded-panel border p-5 sm:p-6",
        waitingOnSeller
          ? "border-primary/30 bg-primary-soft"
          : "border-line bg-surface",
      )}
    >
      <h2 id={headingId} className="font-display text-lg font-bold text-fg">
        Prove the {meta.name} account is yours
      </h2>
      <p className="mt-1.5 max-w-[60ch] text-sm leading-relaxed text-muted">
        Anyone can paste a link. Only the owner can edit {how.place} — so put
        this code there and{" "}
        {how.automatic
          ? "we will read it back"
          : "a moderator will look for it"}
        . It can come out again once the listing is approved.
      </p>

      {code ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <code className="rounded-xl border border-line-strong bg-surface px-4 py-3 font-mono text-base font-semibold tracking-wider break-all text-fg select-all">
              {code}
            </code>
            <Button
              type="button"
              variant="secondary"
              size="md"
              aria-describedby={stepsId}
              onClick={() => void copy(code)}
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

          <ol
            id={stepsId}
            className="mt-4 flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted"
          >
            {how.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
            <li>
              {how.automatic
                ? "Come back and press check. It is usually instant."
                : "Come back here and tell us it is there."}
            </li>
          </ol>
        </>
      ) : (
        <Button
          type="button"
          size="md"
          className="mt-4"
          disabled={pending}
          onClick={() =>
            run("issue", async () => {
              const result = await issueOwnershipCode(listingId);
              if (!result.ok) return { tone: "bad", text: result.error };
              setCode(result.code);
              return null;
            })
          }
        >
          {busy === "issue" ? "Getting a code…" : "Get my code"}
        </Button>
      )}

      {!how.automatic && code ? (
        <p className="mt-4 flex items-start gap-2.5 rounded-card border border-info/30 bg-info-soft p-3.5 text-sm leading-relaxed text-fg">
          <LinkIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-info"
          />
          <span>
            {meta.name} has no public way for us to read {how.place}{" "}
            automatically, so a moderator opens the account and checks it by
            hand — usually within a few hours of you sending it.
          </span>
        </p>
      ) : null}

      {waitingOnSeller && code && !hasProof ? (
        <p className="mt-4 text-sm text-danger">
          You will also need at least one screenshot from inside the account
          before this can go for review.
        </p>
      ) : null}

      {inReview ? (
        <p className="mt-4 text-sm leading-relaxed text-muted">
          A moderator is looking. Leave the code where it is until this clears.
        </p>
      ) : status === "REJECTED" ? (
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Make the change the moderator asked for and save the listing below.
          The code is checked again once it is back with us, so leave it in
          place.
        </p>
      ) : null}

      {code && waitingOnSeller ? (
        <div className="mt-5 flex flex-wrap gap-3">
          {canCheck ? (
            <Button
              type="button"
              size="md"
              disabled={pending}
              onClick={() =>
                run("check", async () => {
                  const result = await checkOwnershipCode(listingId);
                  if (result.ok) {
                    router.refresh();
                    return { tone: "ok", text: result.message };
                  }
                  // "A moderator will look" is a route, not a failure.
                  if (result.manual) router.refresh();
                  return {
                    tone: result.manual ? "info" : "bad",
                    text: result.error,
                  };
                })
              }
            >
              {busy === "check" ? "Checking…" : "I have added it — check now"}
            </Button>
          ) : null}

          {waitingOnSeller ? (
            <Button
              type="button"
              size="md"
              variant={how.automatic ? "secondary" : "primary"}
              disabled={pending}
              onClick={() =>
                run("send", async () => {
                  const result = await submitForReview(listingId);
                  if (!result.ok) {
                    return {
                      tone: "bad",
                      text:
                        result.errors.form ?? "That did not work. Try again.",
                    };
                  }
                  router.refresh();
                  return null;
                })
              }
            >
              {busy === "send"
                ? "Sending…"
                : how.automatic
                  ? "The check cannot see it — ask a moderator"
                  : "The code is live — send for review"}
            </Button>
          ) : null}

          {waitingOnSeller ? (
            <Button
              type="button"
              size="md"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                run("draft", async () => {
                  const result = await withdrawFromReview(listingId);
                  if (!result.ok) {
                    return {
                      tone: "bad",
                      text:
                        result.errors.form ?? "That did not work. Try again.",
                    };
                  }
                  router.refresh();
                  return null;
                })
              }
            >
              {busy === "draft" ? "Working…" : "Back to draft"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {notice ? (
        <p
          role={notice.tone === "bad" ? "alert" : "status"}
          className={cn(
            "mt-3 text-sm leading-relaxed",
            notice.tone === "bad"
              ? "text-danger"
              : notice.tone === "ok"
                ? "text-verified"
                : "text-muted",
          )}
        >
          {notice.text}
        </p>
      ) : null}
    </section>
  );
}

/**
 * @deprecated The seller listing page still renders this, and `OwnershipStep`
 * beside it, until it switches to `OwnershipPanel` — which is both of them in
 * one, with the instructions for the listing's own platform. Delete this and
 * `OwnershipStep` in the same change as that switch.
 *
 * `verified` is ignored: the page only renders this for an unverified listing,
 * so the branch that read it could never run, and it has gone.
 */
export function OwnershipCheck({
  listingId,
  code: initialCode,
}: {
  listingId: string;
  code: string | null;
  verified: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [message, setMessage] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-panel border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold text-fg">
        Prove you control the channel
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        Anyone can paste a link. Only you can edit your own description — so put
        this code in it, and we will read it back. It comes out again as soon as
        you are verified.
      </p>

      {code ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <code className="rounded-card border border-line bg-surface-2 px-4 py-2.5 font-mono text-base tracking-wider text-fg">
              {code}
            </code>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                navigator.clipboard
                  ?.writeText(code)
                  .then(() => setCopied(true))
                  .catch(() => {});
              }}
            >
              <CopyIcon aria-hidden="true" className="size-4" />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>

          <ol className="mt-4 flex list-decimal flex-col gap-1.5 pl-5 text-sm text-muted">
            <li>Open YouTube Studio, then Customisation and Basic info.</li>
            <li>Paste the code anywhere in the description and save.</li>
            <li>Come back and press check. It is usually instant.</li>
          </ol>

          <Button
            type="button"
            size="md"
            className="mt-4"
            disabled={pending}
            onClick={() => {
              setMessage(null);
              startTransition(async () => {
                const result = await checkOwnershipCode(listingId);
                setBad(!result.ok && !result.manual);
                setMessage(result.ok ? result.message : result.error);
                if (result.ok) router.refresh();
              });
            }}
          >
            {pending ? "Checking…" : "I have added it — check now"}
          </Button>
        </>
      ) : (
        <Button
          type="button"
          size="md"
          className="mt-4"
          disabled={pending}
          onClick={() => {
            setMessage(null);
            startTransition(async () => {
              const result = await issueOwnershipCode(listingId);
              if (!result.ok) {
                setBad(true);
                setMessage(result.error);
                return;
              }
              setCode(result.code);
              setBad(false);
              setMessage(result.message);
            });
          }}
        >
          {pending ? "Getting a code…" : "Get my code"}
        </Button>
      )}

      {message ? (
        <p
          role={bad ? "alert" : "status"}
          className={`mt-3 text-sm leading-relaxed ${bad ? "text-danger" : "text-muted"}`}
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
