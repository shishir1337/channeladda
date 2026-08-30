import { CheckIcon, InfoIcon, XIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Price } from "@/components/ui/price";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { buyerTotal, formatRate, sellerPayout } from "@/lib/fees";
import { getFeeSettings } from "@/server/settings";

export async function generateMetadata(): Promise<Metadata> {
  const fees = await getFeeSettings();
  return {
    title: "Pricing & fees",
    description: `Buyers pay ${formatRate(fees.buyerFeeBp)}% on top of the listing price. Sellers pay ${formatRate(fees.sellerFeeBp)}% only when a deal completes. No listing fee, no monthly cost, no charge for a deal that falls through.`,
    alternates: { canonical: "/fees" },
  };
}

const EXAMPLES = [8_900, 42_500, 74_000];

const included = [
  "Escrow on every order",
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
  "A deal that falls through",
];

export default async function FeesPage() {
  const fees = await getFeeSettings();

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Fees" }]}
        eyebrow="Pricing"
        title="Two fees, both stated up front"
        description="We only earn when a deal completes. There is no listing fee, no subscription, and nothing to pay if a sale falls through."
      />

      <Section>
        <Container>
          <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
            <div className="rounded-panel border border-line bg-surface p-6 sm:p-8">
              <p className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
                Buyer fee
              </p>
              <p className="tnum mt-3 font-display text-5xl font-bold text-primary-text">
                {formatRate(fees.buyerFeeBp)}%
              </p>
              <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted">
                Added on top of the listing price and shown in full on the
                listing page, long before checkout. Refunded with the purchase
                if a deal is refunded.
              </p>
            </div>

            <div className="rounded-panel border-2 border-primary bg-surface p-6 sm:p-8">
              <p className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
                Seller fee
              </p>
              <p className="tnum mt-3 font-display text-5xl font-bold text-primary-text">
                {formatRate(fees.sellerFeeBp)}%
              </p>
              <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted">
                Deducted from the sale price when the deal completes. Free to
                list, free to edit, and nothing owed if the account does not
                sell.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      <Section className="border-y border-line bg-bg-subtle">
        <Container>
          <SectionHeading
            eyebrow="Worked examples"
            title="What both sides see on a real deal"
            description="Every figure below follows the currency switcher in the header."
          />

          <div className="mt-9 overflow-x-auto rounded-card border border-line bg-surface sm:mt-12">
            <table className="w-full min-w-[38rem] text-sm">
              <caption className="sr-only">
                Buyer total and seller payout at three sale prices
              </caption>
              <thead>
                <tr className="border-b border-line bg-surface-2">
                  {[
                    "Sale price",
                    "Buyer fee",
                    "Buyer pays",
                    "Seller fee",
                    "Seller receives",
                    "Channel Adda earns",
                  ].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-4 py-3 text-left text-[0.6875rem] font-medium tracking-wide text-subtle uppercase whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {EXAMPLES.map((price) => {
                  const b = buyerTotal(price, fees);
                  const s = sellerPayout(price, fees);
                  return (
                    <tr
                      key={price}
                      className="border-b border-line last:border-b-0"
                    >
                      <th
                        scope="row"
                        className="px-4 py-4 text-left font-semibold"
                      >
                        <Price usd={price} />
                      </th>
                      <td className="px-4 py-4 text-muted">
                        <Price usd={b.fee} />
                      </td>
                      <td className="px-4 py-4 font-medium">
                        <Price usd={b.total} />
                      </td>
                      <td className="px-4 py-4 text-muted">
                        <Price usd={s.fee} />
                      </td>
                      <td className="px-4 py-4 font-medium text-verified">
                        <Price usd={s.payout} />
                      </td>
                      <td className="px-4 py-4 font-semibold text-primary-text">
                        <Price usd={b.fee + s.fee} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
            <div className="rounded-card border border-line bg-surface p-6">
              <h2 className="font-display text-lg font-semibold">
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
                      className="mt-0.5 size-4 shrink-0 text-verified"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-card border border-line bg-surface p-6">
              <h2 className="font-display text-lg font-semibold">
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

          <p className="mt-6 flex items-start gap-2.5 rounded-card border border-line bg-surface-2 p-5 text-sm leading-relaxed text-muted">
            <InfoIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-primary-text"
            />
            <span>
              Network fees on a crypto withdrawal are set by the blockchain, not
              by us, and are deducted from the amount you withdraw. Cryptomus
              shows the exact figure before you confirm.
            </span>
          </p>

          <div className="mt-10 flex flex-col items-start gap-4 rounded-panel border border-line bg-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <h2 className="max-w-lg font-display text-xl font-bold sm:text-2xl">
              No listing fee. Nothing to lose by trying.
            </h2>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/sell">Start selling</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/browse">Browse accounts</Link>
              </Button>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
