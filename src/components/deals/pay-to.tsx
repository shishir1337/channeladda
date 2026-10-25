"use client";

import {
  CheckIcon,
  CopyIcon,
  LockIcon,
  ShieldAlertIcon,
  WalletIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useState, useTransition } from "react";
import { Callout, Card, textareaClass } from "@/components/app/kit";
import { FormNotice } from "@/components/auth/fields";
import { BusyLabel } from "@/components/deals/deal-timeline";
import { Button } from "@/components/ui/button";
import { iconText } from "@/components/ui/icon-hue";
import { MAX_PAY_TO } from "@/lib/pay-to";
import { cn } from "@/lib/utils";
import { savePayTo } from "@/server/actions/deals";
import type { DealView } from "@/server/deals";

function when(date: Date) {
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Where a Safest buyer pays the seller.
 *
 * The chat removes bKash numbers and bank details, so the seller writes them
 * here, any time until the buyer has recorded paying; the
 * buyer sees it once it is their turn to pay, with a copy button and — when
 * it changed after they could first see it — a warning to check it in the
 * conversation first, because a quietly re-pointed payment is how a hijacked
 * seller account takes the money. Nothing on a Fastest deal: there the
 * platform pays the seller.
 */
export function PayToCard({ deal }: { deal: DealView }) {
  if (deal.mode !== "SAFEST") return null;
  if (deal.viewerRole === "seller") return <SellerEditor deal={deal} />;
  if (deal.viewerRole === "buyer") return <BuyerView deal={deal} />;
  // The agent and staff see what the seller said, to settle a disagreement.
  if (!deal.sellerPayTo) return null;
  return (
    <Frame title="Where the buyer pays the seller">
      <Details text={deal.sellerPayTo} />
    </Frame>
  );
}

/** The card, its heading, and a column of whatever goes in it. */
function Frame({ title, children }: { title: ReactNode; children: ReactNode }) {
  const headingId = useId();
  return (
    <Card>
      <section aria-labelledby={headingId}>
        <div className="flex items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
          <WalletIcon
            aria-hidden="true"
            className={`size-4 shrink-0 ${iconText(WalletIcon)}`}
          />
          <h2
            id={headingId}
            className="min-w-0 text-sm leading-6 font-semibold text-fg"
          >
            {title}
          </h2>
        </div>
        <div className="flex flex-col gap-3 p-4 sm:p-5">{children}</div>
      </section>
    </Card>
  );
}

function Details({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start gap-1 rounded-lg border border-line bg-surface-2/60 py-1 pr-1 pl-3">
      {/* Breaks inside a word only when one is too long for the line, an
          account number or an address; break-all split names ("Nadi / a"). */}
      <p className="min-w-0 flex-1 py-1.5 font-mono text-[0.8125rem] leading-relaxed whitespace-pre-wrap wrap-anywhere text-fg select-all">
        {text}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2_000);
          } catch {
            // Clipboard refused (an insecure context, a denied permission):
            // the text is selectable, so it can still be copied by hand.
          }
        }}
        aria-label="Copy the payment details"
      >
        {copied ? (
          <CheckIcon aria-hidden="true" className="size-4 text-verified" />
        ) : (
          <CopyIcon aria-hidden="true" className="size-4" />
        )}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </div>
  );
}

function BuyerView({ deal }: { deal: DealView }) {
  // Before their turn there is nothing to show, and nothing to say.
  if (!deal.buyerPayStepReached) return null;

  if (!deal.sellerPayTo) {
    return (
      <Frame title={`Where to pay ${deal.sellerName}`}>
        <Callout tone="warning" title={`${deal.sellerName} has not said yet.`}>
          We have reminded them; ask in the conversation too. Do not send money
          to details given anywhere else.
        </Callout>
      </Frame>
    );
  }

  return (
    <Frame title={`Pay ${deal.sellerName} here`}>
      {deal.payToChangedWhileVisible && deal.sellerPayToAt ? (
        <Callout
          tone="danger"
          icon={ShieldAlertIcon}
          title={`Changed ${when(new Date(deal.sellerPayToAt))}.`}
        >
          Check it with {deal.sellerName} here in the conversation before you
          pay.
        </Callout>
      ) : null}
      <Details text={deal.sellerPayTo} />
      <Callout tone="warning" title="Pay only these details.">
        If anyone sends others — in a message, an email, anywhere — stop and
        raise it with Channel Adda.
      </Callout>
    </Frame>
  );
}

function SellerEditor({ deal }: { deal: DealView }) {
  const router = useRouter();
  const fieldId = useId();
  const [text, setText] = useState(deal.sellerPayTo ?? "");
  const [editing, setEditing] = useState(!deal.sellerPayTo);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const locked = deal.buyerPaidAt !== null;
  const over = text.length > MAX_PAY_TO;

  return (
    <Frame title={`Where ${deal.buyerName} should pay you`}>
      {locked ? (
        <>
          {deal.sellerPayTo ? <Details text={deal.sellerPayTo} /> : null}
          <p className="flex items-center gap-1.5 text-xs text-subtle">
            <LockIcon aria-hidden="true" className="size-3.5 shrink-0" />
            Locked: the buyer has recorded paying you.
          </p>
        </>
      ) : editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await savePayTo(deal.id, text);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setEditing(false);
              router.refresh();
            });
          }}
        >
          {error ? <FormNotice>{error}</FormNotice> : null}
          <label
            htmlFor={fieldId}
            className="block max-w-[62ch] text-[0.8125rem] leading-relaxed text-muted"
          >
            A bKash or Nagad number, a wallet address and its network, or bank
            details. {deal.buyerName} sees this only when it is their turn to
            pay you, and is warned if it changes after that.
          </label>
          <textarea
            id={fieldId}
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="bKash 01XXXXXXXXX (personal), or USDT (TRC20): T…"
            aria-invalid={over}
            className={cn(textareaClass, "mt-2 font-mono")}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={pending || !text.trim() || over}
            >
              <BusyLabel busy={pending} busyText="Saving…">
                Save
              </BusyLabel>
            </Button>
            {deal.sellerPayTo ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setText(deal.sellerPayTo ?? "");
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            ) : null}
            {over ? (
              <span className="text-xs font-medium text-danger tabular-nums">
                {(text.length - MAX_PAY_TO).toLocaleString("en-US")} characters
                too many
              </span>
            ) : null}
          </div>
        </form>
      ) : (
        <>
          {deal.sellerPayTo ? <Details text={deal.sellerPayTo} /> : null}
          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setEditing(true)}
            >
              Change
            </Button>
          </div>
          {deal.buyerPayStepReached ? (
            <p className="text-xs leading-relaxed text-subtle">
              {deal.buyerName} can see these now. Changing them warns them.
            </p>
          ) : null}
        </>
      )}
    </Frame>
  );
}
