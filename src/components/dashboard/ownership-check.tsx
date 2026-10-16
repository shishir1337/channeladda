"use client";

import { CheckCircle2Icon, CopyIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  checkOwnershipCode,
  issueOwnershipCode,
} from "@/server/actions/channel-lookup";

/**
 * Proving the seller controls the channel they are listing.
 *
 * This is the whole ownership check and it rests on one fact: anybody can
 * paste a link, and only the owner can edit the description behind it. So we
 * issue a code, they put it in the description, and we read it back.
 *
 * The code is issued once and re-shown rather than regenerated, because a
 * seller who has already pasted one somewhere must not be handed a different
 * one and then fail verification for ever without understanding why.
 */
export function OwnershipCheck({
  listingId,
  code: initialCode,
  verified,
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

  if (verified) {
    return (
      <section className="rounded-panel border border-verified/30 bg-verified-soft p-5 sm:p-6">
        <p className="flex items-center gap-2 text-sm font-semibold text-fg">
          <CheckCircle2Icon
            aria-hidden="true"
            className="size-4 shrink-0 text-verified"
          />
          Ownership verified
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          You can take the code out of your channel description now. Buyers see
          a verified badge on this listing.
        </p>
      </section>
    );
  }

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
