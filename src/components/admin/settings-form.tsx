"use client";

import { CheckCircle2Icon, TriangleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type HTMLAttributes,
  type ReactNode,
  useId,
  useState,
  useTransition,
} from "react";
import { InfoTip } from "@/components/app/info-tip";
import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Dot,
  hintClass,
  inputClass,
  labelClass,
  Td,
  Th,
  Tr,
} from "@/components/app/kit";
import { FormNotice } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { formatRate, quote } from "@/lib/fees";
import { cn } from "@/lib/utils";
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

/**
 * A group of settings: its name, what it governs behind the (i), then one
 * row per figure.
 */
function Group({
  title,
  info,
  children,
}: {
  title: string;
  info: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader as="h2" title={title} info={info} />
      <div className="divide-y divide-line">{children}</div>
    </Card>
  );
}

/**
 * One setting: what it is on the left, the figure on the right — stacked on
 * a phone.
 *
 * Wired exactly like `TextField` (hint and error both in `aria-describedby`,
 * the error announced) so moving to a row layout costs a screen reader
 * nothing. The unit sits inside the field for the eye and is spoken as part
 * of the label, so the accessible name is still "Seller fee (%)".
 *
 * `hint` is for what stops a wrong figure being typed and stays in sight;
 * `tip` is the why, behind an (i) beside the label. A tip is still read out
 * with the field — a hidden copy sits in `aria-describedby` — so tucking it
 * away costs a screen reader nothing either. (The (i) is beside the label,
 * not in it: a button inside a label is invalid and steals its clicks.)
 */
function SettingRow({
  id,
  label,
  unit,
  hint,
  tip,
  error,
  ...props
}: {
  id: string;
  label: string;
  /** Shown inside the field and spoken as part of the label, e.g. "%". */
  unit?: string;
  /** Kept visible: a format or limit that prevents a mistake. */
  hint?: string;
  /** The reasoning, behind an (i) beside the label. */
  tip?: string;
  error?: string;
  name: string;
  value: string;
  inputMode: HTMLAttributes<HTMLInputElement>["inputMode"];
  onChange: (value: string) => void;
}) {
  const { onChange, ...input } = props;
  // Worked out before the markup: the React Compiler cannot lower a ternary
  // inside a logical expression in JSX, and bails out of the whole component.
  const describedBy = [
    hint ? `${id}-hint` : null,
    tip ? `${id}-tip` : null,
    error ? `${id}-error` : null,
  ].filter(Boolean);
  return (
    <div className="grid gap-x-8 gap-y-2 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-start sm:px-5">
      <div className="min-w-0 sm:pt-2">
        <div className="flex items-center gap-1.5">
          <label htmlFor={id} className={cn(labelClass, "text-sm")}>
            {label}
            {unit ? <span className="sr-only"> ({unit})</span> : null}
          </label>
          {tip ? <InfoTip label={`About ${label}`}>{tip}</InfoTip> : null}
        </div>
        {tip ? (
          <span id={`${id}-tip`} className="sr-only">
            {tip}
          </span>
        ) : null}
        {hint ? (
          <p id={`${id}-hint`} className={hintClass}>
            {hint}
          </p>
        ) : null}
      </div>
      <div className="min-w-0">
        <div className="relative">
          <input
            id={id}
            {...input}
            onChange={(e) => onChange(e.target.value)}
            required
            aria-invalid={Boolean(error)}
            aria-describedby={
              describedBy.length > 0 ? describedBy.join(" ") : undefined
            }
            className={cn(
              inputClass,
              "tabular-nums",
              unit && (unit.length > 1 ? "pr-14" : "pr-8"),
            )}
          />
          {unit ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[0.8125rem] text-subtle"
            >
              {unit}
            </span>
          ) : null}
        </div>
        {error ? (
          <p
            id={`${id}-error`}
            role="alert"
            className="mt-1.5 text-xs leading-relaxed text-danger"
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
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
    /** Cents, as stored. Shown and typed in dollars. */
    resellerPriceUsd: number;
    resellerDiscountBp: number;
    resellerPointsMultiplier: number;
    googleReviewUrl: string | null;
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
    resellerPrice: useId(),
    resellerDiscount: useId(),
    resellerMultiplier: useId(),
    googleReview: useId(),
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
  const [resellerPrice, setResellerPrice] = useState(
    String(current.resellerPriceUsd / 100),
  );
  const [resellerDiscount, setResellerDiscount] = useState(
    formatRate(current.resellerDiscountBp),
  );
  const [resellerMultiplier, setResellerMultiplier] = useState(
    String(current.resellerPointsMultiplier),
  );
  const [googleReview, setGoogleReview] = useState(
    current.googleReviewUrl ?? "",
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
    {
      label: "Reseller badge, 30 days",
      from: usd(current.resellerPriceUsd / 100),
      to: usd(Number(resellerPrice) || 0),
      changed:
        Math.round(Number(resellerPrice) * 100) !== current.resellerPriceUsd,
    },
    {
      label: "Reseller fee discount",
      from: `${formatRate(current.resellerDiscountBp)}%`,
      to: `${resellerDiscount}%`,
      changed: toBp(resellerDiscount) !== current.resellerDiscountBp,
    },
    {
      label: "Reseller points multiplier",
      from: `${current.resellerPointsMultiplier}x`,
      to: `${resellerMultiplier}x`,
      changed: Number(resellerMultiplier) !== current.resellerPointsMultiplier,
    },
    {
      label: "Google review link",
      from: current.googleReviewUrl ? "set" : "none",
      to: googleReview.trim() ? "set" : "none",
      changed: googleReview.trim() !== (current.googleReviewUrl ?? ""),
    },
  ]
    .filter((row) => row.changed)
    .map(({ label, from, to }) => ({ label, from, to }));

  const changed = pendingChanges.length > 0;

  return (
    <form
      className="flex flex-col gap-6"
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
            resellerPrice: Number(resellerPrice),
            resellerDiscountBp: toBp(resellerDiscount),
            resellerPointsMultiplier: Number(resellerMultiplier),
            googleReviewUrl: googleReview,
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
      {/* The Fees group's promise is also the callout above the form, which
          keeps it in sight; here it sits behind the (i). Of the row hints,
          only one changes what you would type — "0 requires it" — so only it
          stays visible; the rest are the why, behind each label's (i). */}
      <Group
        title="Fees"
        info="These apply to sales made from now on. Orders already placed keep the fee they were charged, so changing this never rewrites a past sale."
      >
        <SettingRow
          id={ids.safest}
          name="buyerFeeBpSafest"
          label="Buyer fee, Safest"
          unit="%"
          hint="Paid up front, and all a Safest buyer pays us: the price goes to the seller directly."
          inputMode="decimal"
          value={safest}
          onChange={setSafest}
          error={errors.buyerFeeBpSafest}
        />
        <SettingRow
          id={ids.fastest}
          name="buyerFeeBpFastest"
          label="Buyer fee, Fastest"
          unit="%"
          hint="On top of the price, which we also hold."
          inputMode="decimal"
          value={fastest}
          onChange={setFastest}
          error={errors.buyerFeeBpFastest}
        />
        <SettingRow
          id={ids.seller}
          name="sellerFeeBp"
          label="Seller fee"
          unit="%"
          hint="Taken from the price when a Fastest deal completes. Never on Safest, whose price goes to the seller directly."
          inputMode="decimal"
          value={seller}
          onChange={setSeller}
          error={errors.sellerFeeBp}
        />
      </Group>

      <Group
        title="Agent safeguards"
        info="On a Safest deal the agent genuinely owns the channel while they hold it. Google limits how many channels one account can own, and an agent account that gets locked freezes every deal it is holding."
      >
        <SettingRow
          id={ids.holds}
          name="maxHoldsPerAgent"
          label="Channels one agent may hold"
          tip="Assignment is refused past this."
          inputMode="numeric"
          value={holds}
          onChange={setHolds}
          error={errors.maxHoldsPerAgent}
        />
        <SettingRow
          id={ids.approval}
          name="secondApprovalAbove"
          label="Second approval above"
          unit="USD"
          hint="0 requires it on every handover."
          inputMode="decimal"
          value={approval}
          onChange={setApproval}
          error={errors.secondApprovalAbove}
        />
      </Group>

      <Group
        title="Offers"
        info="How long an offer stands before it lapses. Short enough that listings do not fill up with stale interest, long enough that someone in another time zone gets a fair chance to answer."
      >
        <SettingRow
          id={ids.offer}
          name="offerExpiryHours"
          label="Offers expire after"
          unit="hours"
          inputMode="numeric"
          value={offerHours}
          onChange={setOfferHours}
          error={errors.offerExpiryHours}
        />
        <SettingRow
          id={ids.paymentWindow}
          name="paymentWindowHours"
          label="Unpaid deals lapse after"
          unit="hours"
          tip="How long a buyer has to pay before the deal lapses. A change applies to unpaid deals already open too, counted from when each was opened."
          inputMode="numeric"
          value={paymentWindow}
          onChange={setPaymentWindow}
          error={errors.paymentWindowHours}
        />
      </Group>

      <Group
        title="Payouts"
        info={
          <>
            The smallest withdrawal we will send. A crypto payout pays the
            chain&rsquo;s fee whatever its size, so below some figure the seller
            loses money by collecting it. Raise this when network fees do.
          </>
        }
      >
        <SettingRow
          id={ids.minWithdrawal}
          name="minWithdrawal"
          label="Smallest withdrawal"
          unit="USD"
          inputMode="decimal"
          value={minWithdrawal}
          onChange={setMinWithdrawal}
          error={errors.minWithdrawal}
        />
      </Group>

      <Group
        title="Reseller badge"
        info="Bought 30 days at a time, from the balance or by crypto. While it lasts it shows beside the holder's name, multiplies their rating points, and takes the discount off every fee they pay. A deal keeps the fee it was opened at."
      >
        <SettingRow
          id={ids.resellerPrice}
          name="resellerPrice"
          label="Price for 30 days"
          unit="USD"
          inputMode="decimal"
          value={resellerPrice}
          onChange={setResellerPrice}
          error={errors.resellerPrice}
        />
        <SettingRow
          id={ids.resellerDiscount}
          name="resellerDiscountBp"
          label="Fee discount"
          unit="%"
          tip="Taken off the buyer fee when they buy and the seller fee when they sell."
          inputMode="decimal"
          value={resellerDiscount}
          onChange={setResellerDiscount}
          error={errors.resellerDiscountBp}
        />
        <SettingRow
          id={ids.resellerMultiplier}
          name="resellerPointsMultiplier"
          label="Points multiplier"
          unit="x"
          tip="How many times their rating points count while the badge is active. Back to once when it ends."
          inputMode="numeric"
          value={resellerMultiplier}
          onChange={setResellerMultiplier}
          error={errors.resellerPointsMultiplier}
        />
      </Group>

      <Group
        title="Reviews"
        info="After a completed deal the buyer rates the seller, then the buyer and the seller each rate Channel Adda, in the deal's chat. Google does not show stars a site collects about itself, so after four or five stars they are offered this link to say it on Google too."
      >
        <div className="px-4 py-4 sm:px-5">
          <label
            htmlFor={ids.googleReview}
            className={cn(labelClass, "text-sm")}
          >
            Google review link
          </label>
          <p id={`${ids.googleReview}-hint`} className={hintClass}>
            From your Google Business Profile: Ask for reviews, then copy the
            link. Leave it empty to not offer one.
          </p>
          <input
            id={ids.googleReview}
            name="googleReviewUrl"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://g.page/r/…/review"
            value={googleReview}
            onChange={(e) => setGoogleReview(e.target.value)}
            aria-invalid={Boolean(errors.googleReviewUrl)}
            aria-describedby={
              errors.googleReviewUrl
                ? `${ids.googleReview}-hint ${ids.googleReview}-error`
                : `${ids.googleReview}-hint`
            }
            className={cn(inputClass, "mt-2")}
          />
          {errors.googleReviewUrl ? (
            <p
              id={`${ids.googleReview}-error`}
              role="alert"
              className="mt-1.5 text-xs leading-relaxed text-danger"
            >
              {errors.googleReviewUrl}
            </p>
          ) : null}
        </div>
      </Group>

      {previewable ? (
        <Card className="overflow-hidden">
          {/* The currency stays in sight — the rest of the app shows money in
              whatever the header is set to, and these figures are not. */}
          <CardHeader
            as="h2"
            title="What that means"
            description="Figures in US dollars."
            info="Worked through at the rates typed above, on a Fastest deal — the mode where both fees apply, so it shows the full effect of a change."
            className="border-b-0"
          />
          <div className="overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[30rem] text-sm">
              <caption className="sr-only">
                Worked examples at the rates currently typed
              </caption>
              <thead>
                <tr>
                  <Th className="border-t">Listed at</Th>
                  <Th numeric className="border-t">
                    Buyer pays
                  </Th>
                  <Th numeric className="border-t">
                    Seller gets
                  </Th>
                  <Th numeric className="border-t">
                    We keep
                  </Th>
                </tr>
              </thead>
              <tbody>
                {EXAMPLES.map((price) => {
                  const q = quote(price, draft, "FASTEST");
                  return (
                    <Tr key={price}>
                      <Td className="tnum text-muted">{usd(price)}</Td>
                      <Td numeric>{usd(q.total)}</Td>
                      <Td numeric>{usd(q.payout)}</Td>
                      <Td numeric className="font-medium text-fg">
                        {usd(q.buyerFee + q.sellerFee)}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* Gold edge while something is waiting to be saved: the one thing on
          this page that is the reader's move. */}
      <Card className={cn(changed && "border-primary/40")}>
        <CardHeader
          as="h2"
          title={
            changed ? (
              <span className="inline-flex items-center gap-2">
                <Dot tone="primary" pulse />
                About to change
              </span>
            ) : (
              "Nothing has changed yet"
            )
          }
          info={
            changed
              ? undefined
              : "Edit a figure above and the difference will be listed here before you commit it."
          }
          className={changed || errors.form ? undefined : "border-b-0"}
        />
        {changed || errors.form ? (
          <CardBody>
            {errors.form ? <FormNotice>{errors.form}</FormNotice> : null}
            {changed ? (
              <>
                <ul className="divide-y divide-line">
                  {pendingChanges.map((row) => (
                    <li
                      key={row.label}
                      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2 text-sm first:pt-0"
                    >
                      <span className="text-muted">{row.label}</span>
                      <span className="inline-flex items-baseline gap-2">
                        <span className="sr-only">changed from</span>
                        <span className="tnum text-subtle line-through decoration-subtle/60">
                          {row.from}
                        </span>
                        <span aria-hidden="true" className="text-subtle">
                          →
                        </span>
                        <span className="sr-only">to</span>
                        <span className="tnum font-medium text-fg">
                          {row.to}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-muted">
                  <TriangleAlertIcon
                    aria-hidden="true"
                    className="mt-px size-3.5 shrink-0 text-primary-text"
                  />
                  <span>
                    Applies to every sale made after you save, and is recorded
                    in the change history below under your name.
                  </span>
                </p>
              </>
            ) : null}
          </CardBody>
        ) : null}
        <CardFooter className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {saved ? (
              <output className="flex items-start gap-1.5 text-[0.8125rem] leading-relaxed text-fg">
                <CheckCircle2Icon
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0 text-verified"
                />
                {saved}
              </output>
            ) : null}
          </div>
          <Button
            type="submit"
            size="md"
            className="self-end sm:self-auto"
            disabled={pending || !changed}
          >
            {/* Both labels share one cell, so the button keeps the width of
                the wider one while it saves. */}
            <span className="inline-grid">
              <span
                className={cn(
                  "col-start-1 row-start-1",
                  pending && "invisible",
                )}
              >
                Save these settings
              </span>
              <span
                className={cn(
                  "col-start-1 row-start-1",
                  !pending && "invisible",
                )}
              >
                Saving…
              </span>
            </span>
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
