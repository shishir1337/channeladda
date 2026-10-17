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
import { FormNotice } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { MAX_PAY_TO } from "@/lib/pay-to";
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
 * The seller writes it, any time until the buyer has recorded paying; the
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
    <section className="rounded-panel border border-line bg-surface p-5 sm:p-6">
      <Heading>Where the buyer pays the seller</Heading>
      <Details text={deal.sellerPayTo} />
    </section>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 font-display text-base font-bold text-fg">
      <WalletIcon aria-hidden="true" className="size-4 shrink-0" />
      {children}
    </h2>
  );
}

function Details({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 flex items-start gap-2 rounded-card border border-line bg-surface-2 p-3">
      <p className="min-w-0 flex-1 font-mono text-sm break-all whitespace-pre-wrap text-fg select-all">
        {text}
      </p>
      <button
        type="button"
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
        className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-subtle transition-colors duration-200 hover:bg-surface hover:text-fg"
      >
        {copied ? (
          <CheckIcon aria-hidden="true" className="size-4" />
        ) : (
          <CopyIcon aria-hidden="true" className="size-4" />
        )}
      </button>
    </div>
  );
}

function BuyerView({ deal }: { deal: DealView }) {
  // Before their turn there is nothing to show, and nothing to say.
  if (!deal.buyerPayStepReached) return null;

  if (!deal.sellerPayTo) {
    return (
      <section className="rounded-panel border border-line bg-surface p-5 sm:p-6">
        <Heading>Where to pay {deal.sellerName}</Heading>
        <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-muted">
          {deal.sellerName} has not said yet. We have reminded them; ask in the
          conversation too. Do not send money to details given anywhere else.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-panel border border-line bg-surface p-5 sm:p-6">
      <Heading>Pay {deal.sellerName} here</Heading>
      {deal.payToChangedWhileVisible && deal.sellerPayToAt ? (
        <p className="mt-3 flex items-start gap-2 rounded-card border border-danger/30 bg-danger-soft px-3.5 py-3 text-sm leading-relaxed text-fg">
          <ShieldAlertIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-danger"
          />
          <span>
            <strong className="font-semibold">
              Changed {when(new Date(deal.sellerPayToAt))}.
            </strong>{" "}
            Check it with {deal.sellerName} here in the conversation before you
            pay.
          </span>
        </p>
      ) : null}
      <Details text={deal.sellerPayTo} />
      <p className="mt-2.5 text-xs leading-relaxed text-subtle">
        Pay only these details. If anyone sends others — in a message, an email,
        anywhere — stop and raise it with Channel Adda.
      </p>
    </section>
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
    <section className="rounded-panel border border-line bg-surface p-5 sm:p-6">
      <Heading>Where {deal.buyerName} should pay you</Heading>

      {locked ? (
        <>
          {deal.sellerPayTo ? <Details text={deal.sellerPayTo} /> : null}
          <p className="mt-2.5 flex items-center gap-1.5 text-xs text-subtle">
            <LockIcon aria-hidden="true" className="size-3.5" />
            Locked: the buyer has recorded paying you.
          </p>
        </>
      ) : editing ? (
        <form
          className="mt-3"
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
          <label htmlFor={fieldId} className="block text-sm text-muted">
            A wallet address and its network, or bank details. {deal.buyerName}{" "}
            sees this only when it is their turn to pay you, and is warned if it
            changes after that.
          </label>
          <textarea
            id={fieldId}
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="USDT (TRC20): T…"
            aria-invalid={over}
            className="mt-2 w-full rounded-xl border border-line bg-surface-2 p-3 font-mono text-sm text-fg placeholder:text-subtle focus:border-primary/60 focus:outline-none"
          />
          <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
            <Button
              type="submit"
              size="sm"
              disabled={pending || !text.trim() || over}
            >
              {pending ? "Saving…" : "Save"}
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
              <span className="text-xs font-medium text-danger">
                {(text.length - MAX_PAY_TO).toLocaleString("en-US")} characters
                too many
              </span>
            ) : null}
          </div>
        </form>
      ) : (
        <>
          {deal.sellerPayTo ? <Details text={deal.sellerPayTo} /> : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => setEditing(true)}
          >
            Change
          </Button>
          {deal.buyerPayStepReached ? (
            <p className="mt-2.5 text-xs leading-relaxed text-subtle">
              {deal.buyerName} can see these now. Changing them warns them.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
