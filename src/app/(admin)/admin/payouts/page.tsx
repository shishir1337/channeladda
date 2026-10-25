import { CoinsIcon, LockIcon, TriangleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { linkClass, MoneyMetric } from "@/components/admin/money-parts";
import { PayoutDecision } from "@/components/admin/payout-decision";
import { Waited } from "@/components/admin/vocab";
import {
  AllClear,
  Callout,
  List,
  ListItem,
  MetaItem,
  PageHeader,
  Section,
  Sep,
  Stat,
  StatGrid,
} from "@/components/app/kit";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/ui/price";
import { dayAndTime } from "@/lib/when";
import { requireRole } from "@/server/session";
import { listPendingWithdrawals } from "@/server/wallet";

export const metadata: Metadata = {
  title: "Payouts",
  robots: { index: false, follow: false },
};

/**
 * The payout queue.
 *
 * FINANCE only — not moderators, not agents. This is the desk that sends real
 * money to an address somebody typed, and the one irreversible action in the
 * product, so the address is shown in full and in a monospaced face rather
 * than truncated to fit a column, the amount is the largest thing on the row,
 * and settling asks twice.
 *
 * Each request is one row in two parts, always stacked: what is being sent
 * and where, then the decision on a quieter band beneath it. Never side by
 * side — the confirmation tells finance to check "the address above", and
 * the eye should pass the address on its way to the button.
 *
 * The page explains itself behind (i)s, but the warning that sending cannot
 * be undone sits in plain sight above everything, and so does every line on
 * a row that is about getting the address right.
 */
export default async function AdminPayoutsPage() {
  await requireRole("FINANCE");
  const pending = await listPendingWithdrawals();

  const total = pending.reduce((sum, payout) => sum + payout.amountUsd, 0);
  const oldest = pending.at(0)?.requestedAt;
  const largest = pending.reduce(
    (max, payout) => Math.max(max, payout.amountUsd),
    0,
  );

  return (
    <>
      <PageHeader
        title="Payouts"
        description="Every decision here is written to the audit trail under your name."
        info="Every decision here is written to the audit trail under your name, with the hash or the refusal reason attached. Amounts are stored as integer cents and shown in whichever currency the header is set to."
        meta={<MetaItem label="Read">{dayAndTime(new Date())}</MetaItem>}
      />

      {/* The page's one warning, word for word and in sight: this is the
          desk where money leaves for good. */}
      <Callout
        tone="warning"
        className="mb-6"
        title="Sending is irreversible — read the address against what the seller saved before you do."
      >
        Each amount is already held against the seller&rsquo;s balance, so
        nothing here can be spent twice while you decide.
      </Callout>

      <StatGrid columns={3} className="grid-cols-1 sm:grid-cols-3">
        <Stat
          label="Requests to settle"
          value={pending.length}
          icon={CoinsIcon}
          tone={pending.length > 0 ? "primary" : "neutral"}
          chip={
            oldest ? (
              <Waited since={oldest} prefix="oldest" lateAfter={48} />
            ) : null
          }
          info="Oldest first, same as every other queue."
        />
        <MoneyMetric
          label="Held in total"
          cents={total}
          icon={LockIcon}
          info="Held against the sellers’ available balances, so it cannot be spent twice. Debited only when you send it."
        />
        <MoneyMetric
          label="Largest single"
          cents={largest}
          icon={TriangleAlertIcon}
          note="Check this one against the seller's history."
        />
      </StatGrid>

      <Section
        id="queue"
        title="Waiting to be sent"
        count={pending.length}
        tone={pending.length > 0 ? "primary" : "neutral"}
        info="Send the funds on-chain, then record the hash here. The hash is the only answer to a seller who says the money never arrived."
      >
        {pending.length === 0 ? (
          <AllClear
            title="Nothing waiting to be sent"
            body="Requests land here as sellers make them."
          />
        ) : (
          <List>
            {pending.map((payout) => (
              <ListItem key={payout.id} padded={false}>
                <div className="px-4 py-4 sm:px-5 sm:py-5">
                  <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                    <div className="min-w-0">
                      {/* Once, to the cent: the amount that will leave. */}
                      <p className="text-2xl leading-8 font-semibold tracking-[-0.02em] text-fg tabular-nums">
                        <Price usd={payout.amountUsd / 100} exact />
                      </p>
                      <p className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.8125rem] text-muted">
                        <Link
                          href={`/admin/users/${payout.user.id}`}
                          className={linkClass}
                        >
                          {payout.user.name}
                        </Link>
                        <Sep />
                        <span className="break-all">{payout.user.email}</span>
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <Badge variant="neutral">{payout.network}</Badge>
                      <Waited
                        since={payout.requestedAt}
                        prefix="requested"
                        lateAfter={48}
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs font-medium text-muted">
                      Destination address
                    </p>
                    <p className="mt-1.5 rounded-lg border border-line-strong bg-surface-2 px-3 py-2.5 font-mono text-[0.8125rem] leading-relaxed break-all text-fg select-all">
                      {payout.address}
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-subtle">
                      Read it in full. A single wrong character sends{" "}
                      <Price
                        usd={payout.amountUsd / 100}
                        exact
                        className="text-muted"
                      />{" "}
                      somewhere nobody can recover it from.
                    </p>
                  </div>
                </div>

                <div className="border-t border-line bg-surface-2/40 px-4 py-4 sm:px-5">
                  <PayoutDecision
                    withdrawalId={payout.id}
                    amountCents={payout.amountUsd}
                    network={payout.network}
                  />
                </div>
              </ListItem>
            ))}
          </List>
        )}
      </Section>
    </>
  );
}
