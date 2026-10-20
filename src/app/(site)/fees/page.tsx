import { CheckIcon, InfoIcon, XIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Price } from "@/components/ui/price";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { buyerTotal, formatRate, sellerPayout } from "@/lib/fees";
import { getFeeSettings, getSettings } from "@/server/settings";

export async function generateMetadata(): Promise<Metadata> {
  const fees = await getFeeSettings();
  return {
    title: "Pricing & fees",
    description: `Buyers pay ${formatRate(fees.buyerFeeBpSafest)}% on top of the listing price. ${fees.sellerFeeBp > 0 ? `Sellers pay ${formatRate(fees.sellerFeeBp)}% when a Fastest sale is paid out.` : "Sellers pay nothing."} No listing fee and no monthly cost.`,
    alternates: { canonical: "/fees" },
  };
}

const EXAMPLES = [8_900, 42_500, 74_000];

const included = [
  "An agent on every deal",
  "Ownership verification before listing",
  "Platform-specific transfer checklists",
  "Order-linked chat and proof storage",
  "Dispute review by a moderator",
  "Crypto payouts via Cryptomus",
];

const notCharged = [
  "Creating an account",
  "Publishing a listing",
  "Editing or pausing a listing",
  "Messaging or making offers",
  "A deal that falls through before our agent takes custody",
];

export default async function FeesPage() {
  const [fees, badge] = await Promise.all([getFeeSettings(), getSettings()]);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Fees" }]}
        title="Two fees, both stated up front"
        description="There is no listing fee and no required subscription. The buyer's fee is charged when a deal opens and refunded in full if it falls through before our agent takes custody of the account."
      />

      <Section>
        <Container>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-panel border border-line bg-surface p-6 sm:p-8">
              <p className="text-[0.8125rem] font-medium text-subtle">
                Buyer fee
              </p>
              <p className="tnum mt-2 text-5xl font-semibold tracking-[-0.03em] text-fg">
                {formatRate(fees.buyerFeeBpSafest)}%
              </p>
              <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted">
                Added on top of the listing price and shown in full on the
                listing page, long before checkout. Refunded with the purchase
                if a deal is refunded.
              </p>
            </div>

            <div className="rounded-panel border border-line bg-surface p-6 sm:p-8">
              <p className="text-[0.8125rem] font-medium text-subtle">
                Seller fee
              </p>
              <p className="tnum mt-2 text-5xl font-semibold tracking-[-0.03em] text-fg">
                {formatRate(fees.sellerFeeBp)}%
              </p>
              <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted">
                {fees.sellerFeeBp > 0
                  ? "Deducted from the sale price when a Fastest sale is paid out. A Safest buyer pays you directly, so there is nothing to deduct it from."
                  : "Sellers pay nothing: a Fastest seller receives the full sale price, and a Safest buyer pays you directly."}{" "}
                Free to list, free to edit, and nothing owed if the account does
                not sell.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      <Section className="border-y border-line bg-bg-subtle">
        <Container>
          <SectionHeading
            title="What both sides see on a real deal"
            description="Every figure below follows the currency switcher in the header."
          />

          <div className="mt-8 flex flex-col gap-8 sm:mt-10">
            <ModeTable
              mode="FASTEST"
              fees={fees}
              title="Fastest — the money passes through us"
              note="You pay Channel Adda the price and the fee together. We pay the seller once our agent holds the account, and our agent then makes you primary owner."
              columns={[
                "Sale price",
                "Buyer fee",
                "Buyer pays us",
                "Seller fee",
                "Seller receives",
                "Channel Adda earns",
              ]}
            />
            <ModeTable
              mode="SAFEST"
              fees={fees}
              title="Safest — the account passes through us, the money does not"
              note="You pay Channel Adda only the fee. The price you pay the seller directly, once our agent holds the account — and the account comes to you once the seller confirms it arrived."
              columns={[
                "Sale price",
                "Our fee",
                "Buyer pays us",
                "Seller fee",
                "Buyer pays the seller",
                "Channel Adda earns",
              ]}
            />
            <p className="max-w-2xl text-sm leading-relaxed text-muted">
              <span className="font-semibold text-fg">
                Reseller badge holders pay{" "}
                {formatRate(badge.resellerDiscountBp)}% less.
              </span>{" "}
              The badge costs $
              {(badge.resellerPriceUsd / 100).toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              for 30 days, from your wallet, and takes the discount off every
              fee you pay while it lasts
              {badge.sellerFeeBp > 0 ? " — buying or selling" : ""}.{" "}
              <Link
                href="/help/rating-points-and-the-reseller-badge"
                className="font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg"
              >
                How it works
              </Link>
            </p>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-card border border-line bg-surface p-6">
              <h2 className="text-base font-semibold text-fg">
                What the fee covers
              </h2>
              <ul className="mt-4 flex flex-col gap-2.5">
                {included.map((item) => (
                  <li
                    key={item}
                    className="flex gap-2.5 text-sm leading-relaxed text-muted"
                  >
                    <CheckIcon
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-fg"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-card border border-line bg-surface p-6">
              <h2 className="text-base font-semibold text-fg">
                What we never charge for
              </h2>
              <ul className="mt-4 flex flex-col gap-2.5">
                {notCharged.map((item) => (
                  <li
                    key={item}
                    className="flex gap-2.5 text-sm leading-relaxed text-muted"
                  >
                    <XIcon
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-subtle"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="mt-3 flex items-start gap-2.5 rounded-card border border-info/20 bg-info-soft/70 p-4 text-sm leading-relaxed text-muted">
            <InfoIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-info"
            />
            <span>
              Network fees on a crypto withdrawal are set by the blockchain, not
              by us, and are deducted from the amount you withdraw. Cryptomus
              shows the exact figure before you confirm.
            </span>
          </p>

          <div className="mt-10 flex flex-col items-start gap-4 rounded-panel border border-line bg-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <h2 className="max-w-lg text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
              No listing fee. Nothing to lose by trying.
            </h2>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/sell">Start selling</Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="/browse">Browse accounts</Link>
              </Button>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}

/**
 * One worked example table per mode.
 *
 * It used to be a single table that took the buyer's figures from a Safest
 * deal and the seller's from a Fastest one, so no row described a deal that
 * could actually happen: at the shipped rates the first row read "$8,900
 * channel, buyer pays $267". Two tables, each internally consistent.
 */
function ModeTable({
  mode,
  fees,
  title,
  note,
  columns,
}: {
  mode: "SAFEST" | "FASTEST";
  fees: Awaited<ReturnType<typeof getFeeSettings>>;
  title: string;
  note: string;
  columns: string[];
}) {
  return (
    <div>
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
        {note}
      </p>

      <div className="mt-4 overflow-x-auto rounded-card border border-line bg-surface">
        <table className="tnum w-full min-w-[38rem] text-sm">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="border-b border-line bg-surface-2">
              {columns.map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="px-4 py-2.5 text-left text-[0.8125rem] font-medium whitespace-nowrap text-subtle"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EXAMPLES.map((price) => {
              const b = buyerTotal(price, fees, mode);
              const s = sellerPayout(price, fees, mode);
              return (
                <tr
                  key={price}
                  className="border-b border-line last:border-b-0"
                >
                  <th scope="row" className="px-4 py-4 text-left font-semibold">
                    <Price usd={price} />
                  </th>
                  <td className="px-4 py-4 text-muted">
                    <Price usd={b.fee} />
                  </td>
                  <td className="px-4 py-4 font-medium">
                    {/* Safest: the fee alone; the price goes to the seller. */}
                    <Price usd={b.total} />
                  </td>
                  <td className="px-4 py-4 text-muted">
                    <Price usd={s.fee} />
                  </td>
                  <td className="px-4 py-4 font-medium text-fg">
                    <Price usd={s.payout} />
                  </td>
                  <td className="px-4 py-4 font-semibold text-fg">
                    <Price usd={b.fee + s.fee} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
