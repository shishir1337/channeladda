"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
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

  const changed =
    draft.buyerFeeBpSafest !== current.buyerFeeBpSafest ||
    draft.buyerFeeBpFastest !== current.buyerFeeBpFastest ||
    draft.sellerFeeBp !== current.sellerFeeBp ||
    Number(holds) !== current.maxHoldsPerAgent ||
    Math.round(Number(approval) * 100) !== current.secondApprovalAboveUsd ||
    Number(offerHours) !== current.offerExpiryHours;

  return (
    <form
      className="flex flex-col gap-5"
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
        <output className="rounded-xl border border-verified/30 bg-verified-soft px-4 py-3 text-sm text-fg">
          {saved}
        </output>
      ) : null}

      <section className="rounded-panel border border-line bg-surface p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold text-fg">Fees</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          These apply to sales made from now on. Orders already placed keep the
          fee they were charged, so changing this never rewrites a past sale.
        </p>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
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
            hint="Fastest only - a Safest price never reaches us."
            inputMode="decimal"
            value={seller}
            onChange={(e) => setSeller(e.target.value)}
            error={errors.sellerFeeBp}
            required
          />
        </div>
      </section>

      <section className="rounded-panel border border-line bg-surface p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold text-fg">
          Agent safeguards
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          On a Safest deal the agent genuinely owns the channel while they hold
          it. Google limits how many channels one account can own, and an agent
          account that gets locked freezes every deal it is holding.
        </p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
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
      </section>

      <section className="rounded-panel border border-line bg-surface p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold text-fg">Offers</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
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
          className="mt-5 max-w-xs"
          required
        />
      </section>

      {previewable ? (
        <section className="rounded-panel border border-line bg-surface p-5 sm:p-6">
          <h2 className="font-display text-lg font-bold text-fg">
            What that means
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            Worked through at the rates typed above.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-subtle uppercase">
                  <th className="py-2 pr-4 font-semibold">Listed at</th>
                  <th className="py-2 pr-4 font-semibold">Buyer pays</th>
                  <th className="py-2 pr-4 font-semibold">Seller gets</th>
                  <th className="py-2 font-semibold">We keep</th>
                </tr>
              </thead>
              <tbody>
                {EXAMPLES.map((price) => {
                  // FASTEST, because it is the mode where both fees apply
                  // and so the one that shows the full effect of a change.
                  const q = quote(price, draft, "FASTEST");
                  return (
                    <tr key={price} className="border-b border-line-soft">
                      <td className="py-3 pr-4 tabular-nums">{usd(price)}</td>
                      <td className="py-3 pr-4 tabular-nums">{usd(q.total)}</td>
                      <td className="py-3 pr-4 tabular-nums text-verified">
                        {usd(q.payout)}
                      </td>
                      <td className="py-3 font-medium tabular-nums text-primary-text">
                        {usd(q.buyerFee + q.sellerFee)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="md" disabled={pending || !changed}>
          {pending ? "Saving…" : "Save fees"}
        </Button>
        {!changed && !saved ? (
          <span className="text-sm text-subtle">Nothing has changed yet.</span>
        ) : null}
      </div>
    </form>
  );
}
