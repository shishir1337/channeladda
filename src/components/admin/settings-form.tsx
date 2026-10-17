"use client";

import { CheckCircle2Icon, TriangleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Panel, TableScroller, Td, Th } from "@/components/admin/console";
import { FormNotice, TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { formatRate, quote } from "@/lib/fees";
import { saveSettings } from "@/server/actions/settings";

const EXAMPLES = [99, 4_500, 42_500];

function usd(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

/** A percentage typed by a person -> basis points. "2.75" -> 275. */
function toBp(value: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Number.NaN;
  return Math.round(n * 100);
}

export function SettingsForm({
  current,
}: {
  current: {
    buyerFeeBpSafest: number;
    buyerFeeBpFastest: number;
    sellerFeeBp: number;
    maxHoldsPerAgent: number;
    /** Cents, as stored. Shown and typed in dollars. */
    secondApprovalAboveUsd: number;
    offerExpiryHours: number;
    /** Cents, as stored. Shown and typed in dollars. */
    minWithdrawalUsd: number;
    paymentWindowHours: number;
  };
}) {
  const router = useRouter();
  const ids = {
    safest: useId(),
    fastest: useId(),
    seller: useId(),
    holds: useId(),
    approval: useId(),
    offer: useId(),
    minWithdrawal: useId(),
    paymentWindow: useId(),
  };

  const [safest, setSafest] = useState(formatRate(current.buyerFeeBpSafest));
  const [fastest, setFastest] = useState(formatRate(current.buyerFeeBpFastest));
  const [seller, setSeller] = useState(formatRate(current.sellerFeeBp));
  const [holds, setHolds] = useState(String(current.maxHoldsPerAgent));
  const [approval, setApproval] = useState(
    String(current.secondApprovalAboveUsd / 100),
  );
  const [offerHours, setOfferHours] = useState(
    String(current.offerExpiryHours),
  );
  const [paymentWindow, setPaymentWindow] = useState(
    String(current.paymentWindowHours),
  );
  const [minWithdrawal, setMinWithdrawal] = useState(
    String(current.minWithdrawalUsd / 100),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Preview against what is typed, not what is saved, so the effect of a
  // change is visible before it is committed.
  const draft = {
    buyerFeeBpSafest: toBp(safest),
    buyerFeeBpFastest: toBp(fastest),
    sellerFeeBp: toBp(seller),
  };
  const previewable =
    Number.isFinite(draft.buyerFeeBpSafest) &&
    Number.isFinite(draft.buyerFeeBpFastest) &&
    Number.isFinite(draft.sellerFeeBp);

  /**
   * What is about to change, in words.
   *
   * These numbers decide what every future buyer and seller is charged, so
   * the save button is not allowed to be the only thing that says a change is
   * pending: the differences are listed next to it first.
   */
  const pendingChanges: { label: string; from: string; to: string }[] = [
    {
      label: "Buyer fee, Safest",
      from: `${formatRate(current.buyerFeeBpSafest)}%`,
      to: `${safest}%`,
      changed: draft.buyerFeeBpSafest !== current.buyerFeeBpSafest,
    },
    {
      label: "Buyer fee, Fastest",
      from: `${formatRate(current.buyerFeeBpFastest)}%`,
      to: `${fastest}%`,
      changed: draft.buyerFeeBpFastest !== current.buyerFeeBpFastest,
    },
    {
      label: "Seller fee",
      from: `${formatRate(current.sellerFeeBp)}%`,
      to: `${seller}%`,
      changed: draft.sellerFeeBp !== current.sellerFeeBp,
    },
    {
      label: "Channels one agent may hold",
      from: String(current.maxHoldsPerAgent),
      to: holds,
      changed: Number(holds) !== current.maxHoldsPerAgent,
    },
    {
      label: "Second approval above",
      from: usd(current.secondApprovalAboveUsd / 100),
      to: usd(Number(approval) || 0),
      changed:
        Math.round(Number(approval) * 100) !== current.secondApprovalAboveUsd,
    },
    {
      label: "Offers expire after",
      from: `${current.offerExpiryHours}h`,
      to: `${offerHours}h`,
      changed: Number(offerHours) !== current.offerExpiryHours,
    },
    {
      label: "Smallest withdrawal",
      from: usd(current.minWithdrawalUsd / 100),
      to: usd(Number(minWithdrawal) || 0),
      changed:
        Math.round(Number(minWithdrawal) * 100) !== current.minWithdrawalUsd ||
    Number(paymentWindow) !== current.paymentWindowHours,
    },
  ]
    .filter((row) => row.changed)
    .map(({ label, from, to }) => ({ label, from, to }));

  const changed = pendingChanges.length > 0;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        setSaved(null);
        startTransition(async () => {
          const result = await saveSettings({
            buyerFeeBpSafest: toBp(safest),
            buyerFeeBpFastest: toBp(fastest),
            sellerFeeBp: toBp(seller),
            maxHoldsPerAgent: Number(holds),
            secondApprovalAbove: Number(approval),
            offerExpiryHours: Number(offerHours),
            minWithdrawal: Number(minWithdrawal),
            paymentWindowHours: Number(paymentWindow),
          });
          if (!result.ok) {
            setErrors(result.errors);
            return;
          }
          setSaved(result.message);
          router.refresh();
        });
      }}
    >
      {errors.form ? <FormNotice>{errors.form}</FormNotice> : null}
      {saved ? (
        <output className="flex items-start gap-2 rounded-card border border-verified/30 bg-verified-soft px-4 py-3 text-sm text-fg">
          <CheckCircle2Icon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-verified"
          />
          {saved}
        </output>
      ) : null}

      <Panel>
        <h2 className="font-display text-base font-bold text-fg">Fees</h2>
        <p className="mt-1.5 max-w-[72ch] text-sm leading-relaxed text-muted">
          These apply to sales made from now on. Orders already placed keep the
          fee they were charged, so changing this never rewrites a past sale.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField
            id={ids.safest}
            name="buyerFeeBpSafest"
            label="Buyer fee, Safest (%)"
            hint="The only thing a Safest buyer pays us."
            inputMode="decimal"
            value={safest}
            onChange={(e) => setSafest(e.target.value)}
            error={errors.buyerFeeBpSafest}
            required
          />
          <TextField
            id={ids.fastest}
            name="buyerFeeBpFastest"
            label="Buyer fee, Fastest (%)"
            hint="On top of the price, which we also hold."
            inputMode="decimal"
            value={fastest}
            onChange={(e) => setFastest(e.target.value)}
            error={errors.buyerFeeBpFastest}
            required
          />
          <TextField
            id={ids.seller}
            name="sellerFeeBp"
            label="Seller fee (%)"
            hint="Fastest only — a Safest price never reaches us."
            inputMode="decimal"
            value={seller}
            onChange={(e) => setSeller(e.target.value)}
            error={errors.sellerFeeBp}
            required
          />
        </div>
      </Panel>

      <Panel>
        <h2 className="font-display text-base font-bold text-fg">
          Agent safeguards
        </h2>
        <p className="mt-1.5 max-w-[72ch] text-sm leading-relaxed text-muted">
          On a Safest deal the agent genuinely owns the channel while they hold
          it. Google limits how many channels one account can own, and an agent
          account that gets locked freezes every deal it is holding.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField
            id={ids.holds}
            name="maxHoldsPerAgent"
            label="Channels one agent may hold"
            hint="Assignment is refused past this."
            inputMode="numeric"
            value={holds}
            onChange={(e) => setHolds(e.target.value)}
            error={errors.maxHoldsPerAgent}
            required
          />
          <TextField
            id={ids.approval}
            name="secondApprovalAbove"
            label="Second approval above (USD)"
            hint="0 requires it on every handover."
            inputMode="decimal"
            value={approval}
            onChange={(e) => setApproval(e.target.value)}
            error={errors.secondApprovalAbove}
            required
          />
        </div>
      </Panel>

      <Panel>
        <h2 className="font-display text-base font-bold text-fg">Offers</h2>
        <p className="mt-1.5 max-w-[72ch] text-sm leading-relaxed text-muted">
          How long an offer stands before it lapses. Short enough that listings
          do not fill up with stale interest, long enough that someone in
          another time zone gets a fair chance to answer.
        </p>
        <TextField
          id={ids.offer}
          name="offerExpiryHours"
          label="Offers expire after (hours)"
          inputMode="numeric"
          value={offerHours}
          onChange={(e) => setOfferHours(e.target.value)}
          error={errors.offerExpiryHours}
          className="mt-4 max-w-xs"
          required
        />
        <TextField
          id={ids.paymentWindow}
          name="paymentWindowHours"
          label="Unpaid deals lapse after (hours)"
          hint="How long a buyer has to pay before the listing goes back on sale. A buyer who walks away holds it off the market this long."
          inputMode="numeric"
          value={paymentWindow}
          onChange={(e) => setPaymentWindow(e.target.value)}
          error={errors.paymentWindowHours}
          className="mt-4 max-w-xs"
          required
        />
      </Panel>

      <Panel>
        <h2 className="font-display text-base font-bold text-fg">Payouts</h2>
        <p className="mt-1.5 max-w-[72ch] text-sm leading-relaxed text-muted">
          The smallest withdrawal we will send. A crypto payout pays the
          chain&rsquo;s fee whatever its size, so below some figure the seller
          loses money by collecting it. Raise this when network fees do.
        </p>
        <TextField
          id={ids.minWithdrawal}
          name="minWithdrawal"
          label="Smallest withdrawal (USD)"
          inputMode="decimal"
          value={minWithdrawal}
          onChange={(e) => setMinWithdrawal(e.target.value)}
          error={errors.minWithdrawal}
          className="mt-4 max-w-xs"
          required
        />
      </Panel>

      {previewable ? (
        <Panel>
          <h2 className="font-display text-base font-bold text-fg">
            What that means
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            Worked through at the rates typed above, on a Fastest deal — the
            mode where both fees apply, so it shows the full effect of a change.
            Figures in US dollars.
          </p>
          <TableScroller className="mt-4">
            <table className="w-full min-w-[30rem] text-sm">
              <caption className="sr-only">
                Worked examples at the rates currently typed
              </caption>
              <thead>
                <tr>
                  <Th>Listed at</Th>
                  <Th numeric>Buyer pays</Th>
                  <Th numeric>Seller gets</Th>
                  <Th numeric>We keep</Th>
                </tr>
              </thead>
              <tbody>
                {EXAMPLES.map((price) => {
                  const q = quote(price, draft, "FASTEST");
                  return (
                    <tr key={price} className="border-t border-line">
                      <Td className="tnum">{usd(price)}</Td>
                      <Td numeric>{usd(q.total)}</Td>
                      <Td numeric className="text-verified">
                        {usd(q.payout)}
                      </Td>
                      <Td numeric className="font-medium text-primary-text">
                        {usd(q.buyerFee + q.sellerFee)}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroller>
        </Panel>
      ) : null}

      <Panel tone={changed ? "primary" : "neutral"}>
        <h2 className="font-display text-base font-bold text-fg">
          {changed ? "About to change" : "Nothing has changed yet"}
        </h2>
        {changed ? (
          <>
            <ul className="mt-3 flex flex-col gap-1.5 text-sm">
              {pendingChanges.map((row) => (
                <li key={row.label} className="flex flex-wrap gap-x-2">
                  <span className="text-muted">{row.label}</span>
                  <span className="tnum text-subtle line-through">
                    {row.from}
                  </span>
                  <span aria-hidden="true" className="text-subtle">
                    →
                  </span>
                  <span className="tnum font-semibold text-fg">{row.to}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-muted">
              <TriangleAlertIcon
                aria-hidden="true"
                className="mt-px size-3.5 shrink-0 text-primary"
              />
              <span>
                Applies to every sale made after you save, and is recorded in
                the change history below under your name.
              </span>
            </p>
          </>
        ) : (
          <p className="mt-1.5 text-sm text-muted">
            Edit a figure above and the difference will be listed here before
            you commit it.
          </p>
        )}
        <Button
          type="submit"
          size="md"
          className="mt-4"
          disabled={pending || !changed}
        >
          {pending ? "Saving…" : "Save these settings"}
        </Button>
      </Panel>
    </form>
  );
}
