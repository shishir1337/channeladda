"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { FormNotice, TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { type FeeSettings, formatRate, quote } from "@/lib/fees";
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
  current: FeeSettings & { offerExpiryHours: number };
}) {
  const router = useRouter();
  const ids = {
    buyer: useId(),
    seller: useId(),
    escrow: useId(),
    offer: useId(),
  };

  const [buyer, setBuyer] = useState(formatRate(current.buyerFeeBp));
  const [seller, setSeller] = useState(formatRate(current.sellerFeeBp));
  const [escrow, setEscrow] = useState(String(current.escrowRequiredAbove));
  const [offerHours, setOfferHours] = useState(
    String(current.offerExpiryHours),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Preview against what is typed, not what is saved, so the effect of a
  // change is visible before it is committed.
  const draft: FeeSettings = {
    buyerFeeBp: toBp(buyer),
    sellerFeeBp: toBp(seller),
    escrowRequiredAbove: Number(escrow),
  };
  const previewable =
    Number.isFinite(draft.buyerFeeBp) && Number.isFinite(draft.sellerFeeBp);

  const changed =
    draft.buyerFeeBp !== current.buyerFeeBp ||
    draft.sellerFeeBp !== current.sellerFeeBp ||
    draft.escrowRequiredAbove !== current.escrowRequiredAbove ||
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
            buyerFeeBp: toBp(buyer),
            sellerFeeBp: toBp(seller),
            escrowRequiredAbove: Number(escrow),
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
            id={ids.buyer}
            name="buyerFeeBp"
            label="Buyer fee (%)"
            hint="Added on top of the listing price."
            inputMode="decimal"
            value={buyer}
            onChange={(e) => setBuyer(e.target.value)}
            error={errors.buyerFeeBp}
            required
          />
          <TextField
            id={ids.seller}
            name="sellerFeeBp"
            label="Seller fee (%)"
            hint="Deducted when a deal completes."
            inputMode="decimal"
            value={seller}
            onChange={(e) => setSeller(e.target.value)}
            error={errors.sellerFeeBp}
            required
          />
        </div>
      </section>

      <section className="rounded-panel border border-line bg-surface p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold text-fg">Escrow</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          At or above this price, a deal must go through full escrow. Set it to
          0 to make escrow mandatory on everything.
        </p>
        <TextField
          id={ids.escrow}
          name="escrowRequiredAbove"
          label="Escrow required at or above (USD)"
          inputMode="decimal"
          value={escrow}
          onChange={(e) => setEscrow(e.target.value)}
          error={errors.escrowRequiredAbove}
          className="mt-5 max-w-xs"
          required
        />
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
                  const q = quote(price, draft);
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
