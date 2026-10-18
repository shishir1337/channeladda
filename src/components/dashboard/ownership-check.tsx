"use client";

import {
  CheckIcon,
  CircleAlertIcon,
  CopyIcon,
  LinkIcon,
  Loader2Icon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useState, useTransition } from "react";
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
      className="rounded-card border border-line bg-surface shadow-xs"
    >
      <div className="border-b border-line px-4 py-3 sm:px-5">
        <h3 id={headingId} className="text-sm leading-6 font-semibold text-fg">
          Prove the {meta.name} account is yours
        </h3>
        <p className="max-w-[68ch] text-[0.8125rem] leading-relaxed text-muted">
          Anyone can paste a link. Only the owner can edit {how.place} — so put
          this code there and{" "}
          {how.automatic
            ? "we will read it back"
            : "a moderator will look for it"}
          . It can come out again once the listing is approved.
        </p>
      </div>

      <div className="p-4 sm:p-5">
        {code ? (
          <>
            {/* The code and its copy button share one well, so there is no
                doubt which string the button copies. */}
            <div className="flex max-w-md items-center gap-3 rounded-lg border border-line bg-surface-2 py-1.5 pr-1.5 pl-3.5">
              <code className="min-w-0 flex-1 font-mono text-[0.9375rem] leading-6 font-semibold tracking-wider break-all text-fg select-all">
                {code}
              </code>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="min-w-[6.5rem]"
                aria-describedby={stepsId}
                onClick={() => void copy(code)}
              >
                {copied ? (
                  <>
                    <CheckIcon aria-hidden="true" className="text-verified" />
                    Copied
                  </>
                ) : (
                  <>
                    <CopyIcon aria-hidden="true" />
                    Copy code
                  </>
                )}
              </Button>
            </div>

            <ol id={stepsId} className="mt-5 flex flex-col gap-3">
              {how.steps.map((step, i) => (
                <Step key={step} n={i + 1}>
                  {step}
                </Step>
              ))}
              <Step n={how.steps.length + 1}>
                {how.automatic
                  ? "Come back and press check. It is usually instant."
                  : "Come back here and tell us it is there."}
              </Step>
            </ol>
          </>
        ) : (
          <Button
            type="button"
            size="md"
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
            {busy === "issue" ? (
              <>
                <Loader2Icon aria-hidden="true" className="animate-spin" />
                Getting a code…
              </>
            ) : (
              "Get my code"
            )}
          </Button>
        )}

        {!how.automatic && code ? (
          <p className="mt-5 flex items-start gap-2.5 rounded-lg border border-info/20 bg-info-soft/70 px-3 py-2.5 text-[0.8125rem] leading-relaxed text-fg">
            <LinkIcon
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-info"
            />
            <span>
              {meta.name} has no public way for us to read {how.place}{" "}
              automatically, so a moderator opens the account and checks it by
              hand — usually within a few hours of you sending it.
            </span>
          </p>
        ) : null}

        {waitingOnSeller && code && !hasProof ? (
          <p className="mt-4 flex items-start gap-2 text-[0.8125rem] leading-relaxed text-danger">
            <CircleAlertIcon
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0"
            />
            You will also need at least one screenshot from inside the account
            before this can go for review.
          </p>
        ) : null}

        {inReview ? (
          <p className="mt-4 text-[0.8125rem] leading-relaxed text-muted">
            A moderator is looking. Leave the code where it is until this
            clears.
          </p>
        ) : status === "REJECTED" ? (
          <p className="mt-4 text-[0.8125rem] leading-relaxed text-muted">
            Make the change the moderator asked for and save the listing below.
            The code is checked again once it is back with us, so leave it in
            place.
          </p>
        ) : null}

        {code && waitingOnSeller ? (
          <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:flex-wrap">
            {canCheck ? (
              <Button
                type="button"
                size="md"
                className="max-sm:whitespace-normal"
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
                {busy === "check" ? (
                  <>
                    <Loader2Icon aria-hidden="true" className="animate-spin" />
                    Checking…
                  </>
                ) : (
                  "I have added it — check now"
                )}
              </Button>
            ) : null}

            {waitingOnSeller ? (
              <Button
                type="button"
                size="md"
                variant={how.automatic ? "secondary" : "primary"}
                className="max-sm:whitespace-normal"
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
                {busy === "send" ? (
                  <>
                    <Loader2Icon aria-hidden="true" className="animate-spin" />
                    Sending…
                  </>
                ) : how.automatic ? (
                  "The check cannot see it — ask a moderator"
                ) : (
                  "The code is live — send for review"
                )}
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
              "mt-3 text-[0.8125rem] leading-relaxed",
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
      </div>
    </section>
  );
}

/** One numbered instruction. The number is drawn; the list already counts. */
function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-sm leading-relaxed text-fg">
      <span
        aria-hidden="true"
        className="mt-px inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-xs font-medium text-muted tabular-nums"
      >
        {n}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}
