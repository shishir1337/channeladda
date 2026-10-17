import { CoinsIcon, LockIcon, TriangleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AllClear,
  ConsoleHeader,
  ConsoleSection,
  MetaItem,
  Metric,
  MetricGrid,
  RowItem,
  Rows,
} from "@/components/admin/console";
import { PayoutDecision } from "@/components/admin/payout-decision";
import { Waited } from "@/components/admin/vocab";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/ui/price";
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
 */
export default async function AdminPayoutsPage() {
  const staff = await requireRole("FINANCE");
  const pending = await listPendingWithdrawals();

  const total = pending.reduce((sum, payout) => sum + payout.amountUsd, 0);
  const oldest = pending.at(0)?.requestedAt;
  const largest = pending.reduce(
    (max, payout) => Math.max(max, payout.amountUsd),
    0,
  );

  return (
    <>
      <ConsoleHeader
        eyebrow="Money"
        title="Payouts"
        description="Each amount is already held against the seller's balance, so nothing here can be spent twice while you decide. Sending is irreversible — read the address against what the seller saved before you do."
        meta={
          <>
            <MetaItem label="Signed in as">{staff.name}</MetaItem>
            <MetaItem label="Desk">
              {staff.role.toLowerCase().replace("_", " ")}
            </MetaItem>
            <MetaItem label="Read">
              {new Date().toLocaleString("en-GB")}
            </MetaItem>
          </>
        }
      />

      <MetricGrid className="mt-6 lg:grid-cols-3">
        <Metric
          label="Requests to settle"
          value={pending.length}
          icon={CoinsIcon}
          tone={pending.length > 0 ? "primary" : "neutral"}
          chip={
            oldest ? (
              <Waited since={oldest} prefix="oldest" lateAfter={48} />
            ) : null
          }
          note="Oldest first, same as every other queue."
        />
        <Metric
          label="Held in total"
          value={<Price usd={total / 100} className="text-[1.4rem]" />}
          icon={LockIcon}
          note="Already deducted from balances. Not yet sent."
        />
        <Metric
          label="Largest single"
          value={<Price usd={largest / 100} className="text-[1.4rem]" />}
          icon={TriangleAlertIcon}
          tone={largest > 0 ? "danger" : "neutral"}
          note="Check this one against the seller's history."
        />
      </MetricGrid>

      <ConsoleSection
        id="queue"
        title="Waiting to be sent"
        count={pending.length}
        tone={pending.length > 0 ? "primary" : "neutral"}
        description="Send the funds on-chain, then record the hash here. The hash is the only answer to a seller who says the money never arrived."
      >
        {pending.length === 0 ? (
          <AllClear
            title="Nothing waiting to be sent"
            body="Every requested payout has been settled or refused. Requests land here as sellers make them."
          />
        ) : (
          <Rows>
            {pending.map((payout) => (
              <RowItem key={payout.id} flag="primary">
                <div className="p-4 pl-5 sm:p-5 sm:pl-6">
                  <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2">
                    <div className="min-w-0">
                      <p className="font-display text-2xl font-black text-fg">
                        <Price usd={payout.amountUsd / 100} />
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        <Link
                          href={`/admin/users/${payout.user.id}`}
                          className="font-medium text-primary-text underline-offset-4 hover:underline"
                        >
                          {payout.user.name}
                        </Link>
                        <span className="text-subtle"> · </span>
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

                  <div className="mt-3.5">
                    <p className="font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-subtle uppercase">
                      Destination address
                    </p>
                    <p className="mt-1.5 rounded-card border border-line-strong bg-surface-2 p-3 font-mono text-xs leading-relaxed break-all text-fg select-all">
                      {payout.address}
                    </p>
                    <p className="mt-1.5 text-xs text-subtle">
                      Read it in full. A single wrong character sends{" "}
                      <Price
                        usd={payout.amountUsd / 100}
                        className="text-muted"
                      />{" "}
                      somewhere nobody can recover it from.
                    </p>
                  </div>

                  <PayoutDecision
                    withdrawalId={payout.id}
                    amountCents={payout.amountUsd}
                  />
                </div>
              </RowItem>
            ))}
          </Rows>
        )}
      </ConsoleSection>

      <p className="mt-7 flex items-start gap-2 text-xs leading-relaxed text-subtle">
        <LockIcon aria-hidden="true" className="mt-px size-3.5 shrink-0" />
        <span>
          Every decision here is written to the audit trail under your name,
          with the hash or the refusal reason attached. Amounts are stored as
          integer cents and shown in whichever currency the header is set to.
        </span>
      </p>
    </>
  );
}
