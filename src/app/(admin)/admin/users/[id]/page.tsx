import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  LockIcon,
  SlidersHorizontalIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  Amount,
  ConsoleSection,
  Metric,
  MetricGrid,
  Nothing,
  Panel,
  Reference,
  TableScroller,
  Td,
  Th,
} from "@/components/admin/console";
import {
  AccountRecovery,
  KycControl,
  UserControls,
} from "@/components/admin/user-controls";
import {
  DealModeBadge,
  OrderStatusBadge,
  ROLE_VARIANT,
} from "@/components/admin/vocab";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/ui/price";
import type { UserRole, WithdrawalStatus } from "@/generated/prisma/enums";
import {
  getUserDetail,
  listUserDeals,
  listUserWithdrawals,
  ROLE_BLURBS,
  ROLE_CONSEQUENCES,
  ROLE_LABELS,
  ROLES,
} from "@/server/admin-users";
import { requireStaff } from "@/server/session";
import { getWallet } from "@/server/wallet";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

/** Roles whose accounts only a superadmin may act on. Mirrors the repository. */
const STAFF_ROLES: readonly UserRole[] = ["MODERATOR", "FINANCE", "SUPERADMIN"];

/**
 * Who sees money on this page: the same two roles `/admin/payouts` lets in
 * through `requireRole("FINANCE")`. Checked before anything is fetched, so a
 * moderator's page never so much as carries the figures.
 */
const MONEY_ROLES: readonly UserRole[] = ["FINANCE", "SUPERADMIN"];

const DATE: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

/** Ledger rows in the staff voice — what moved and why, not the enum. */
const LEDGER_KIND: Record<string, string> = {
  DEPOSIT: "Top-up",
  ESCROW_HOLD: "Paid into a deal",
  ESCROW_RELEASE: "Sale paid out",
  SELLER_FEE: "Seller fee",
  BUYER_FEE: "Buyer fee",
  REFUND: "Refund",
  WITHDRAWAL: "Withdrawal",
  ADJUSTMENT: "Adjusted by staff",
};

const WITHDRAWAL_STATUS: Record<
  WithdrawalStatus,
  { label: string; variant: "neutral" | "primary" | "verified" | "danger" }
> = {
  REQUESTED: { label: "Waiting for finance", variant: "primary" },
  APPROVED: { label: "Approved, not sent", variant: "primary" },
  SENT: { label: "Sent", variant: "verified" },
  REJECTED: { label: "Refused", variant: "danger" },
};

const SIDE: Record<"buyer" | "seller" | "agent", string> = {
  buyer: "Buying",
  seller: "Selling",
  agent: "Agent",
};

function Fact({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: "danger" | "verified";
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <dt className="font-mono text-[0.625rem] font-semibold tracking-[0.1em] text-subtle uppercase">
        {label}
      </dt>
      <dd
        className={`mt-1.5 text-sm font-semibold tabular-nums ${
          tone === "danger"
            ? "text-danger"
            : tone === "verified"
              ? "text-verified"
              : "text-fg"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export default async function AdminUserPage({
  params,
}: PageProps<"/admin/users/[id]">) {
  const { id } = await params;
  const staff = await requireStaff();
  const person = await getUserDetail(id);
  if (!person) notFound();

  const isSelf = staff.id === person.id;
  const isSuperadmin = staff.role === "SUPERADMIN";
  const targetIsStaff = STAFF_ROLES.includes(person.role);
  const canSeeMoney = MONEY_ROLES.includes(staff.role);

  const [deals, wallet, withdrawals] = await Promise.all([
    listUserDeals(person.id),
    canSeeMoney ? getWallet(person.id) : null,
    canSeeMoney ? listUserWithdrawals(person.id) : null,
  ]);

  // Same rules the repository enforces, worked out here only so the page can
  // say why a control is missing instead of letting the click find out.
  const canSetKyc =
    !isSelf &&
    (staff.role === "MODERATOR" || isSuperadmin) &&
    (!targetIsStaff || isSuperadmin);
  const kycBlockedBecause = isSelf
    ? "Nobody records their own identity check."
    : staff.role === "FINANCE"
      ? "Moderators and superadmins record identity checks."
      : "Only a superadmin can record a check on a staff account.";
  const canEndSessions = !isSelf && (!targetIsStaff || isSuperadmin);

  const ledgerShown = wallet?.entries.slice(0, 20) ?? [];

  return (
    <>
      <Link
        href="/admin/users"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        All people
      </Link>

      <header className="mt-2 border-b border-line pb-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-display text-[1.6rem] leading-[1.1] font-black tracking-tight text-fg sm:text-[1.9rem]">
            {person.name}
          </h1>
          <Badge variant={ROLE_VARIANT[person.role]} size="md">
            {ROLE_LABELS[person.role]}
          </Badge>
          {person.banned ? (
            <Badge variant="danger" size="md">
              Suspended
            </Badge>
          ) : null}
        </div>
        <p className="mt-1.5 text-sm break-all text-muted">{person.email}</p>
      </header>

      {person.banned ? (
        <Panel tone="danger" className="mt-5">
          <p className="flex items-start gap-2 text-sm leading-relaxed text-fg">
            <TriangleAlertIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-danger"
            />
            <span>
              <strong className="font-semibold">
                This account is suspended.
              </strong>{" "}
              They cannot sign in and their listings are paused.
              {person.banReason ? ` Reason given: ${person.banReason}` : ""}
            </span>
          </p>
        </Panel>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0">
          <h2 className="font-mono text-[0.625rem] font-semibold tracking-[0.14em] text-subtle uppercase">
            Account record
          </h2>
          <dl className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <Fact label="Listed" value={person.listings} />
            <Fact label="Sold" value={person.sold} />
            <Fact label="Bought" value={person.bought} />
            <Fact label="Conversations open" value={person.openThreads} />
            <Fact
              label="Threads flagged"
              value={person.flaggedThreads}
              tone={person.flaggedThreads > 0 ? "danger" : undefined}
            />
            <Fact label="Active sessions" value={person.sessions} />
            <Fact
              label="Email"
              value={person.emailVerified ? "Verified" : "Unverified"}
              tone={person.emailVerified ? "verified" : "danger"}
            />
            {/* On a staff account this is not a nicety: it is the only thing
                between a reused password and the payout screen. */}
            <Fact
              label="Two-factor"
              value={person.twoFactorEnabled ? "On" : "Off"}
              tone={
                person.twoFactorEnabled
                  ? "verified"
                  : person.role === "USER"
                    ? undefined
                    : "danger"
              }
            />
            {person.role === "AGENT" ? (
              <Fact
                label="Channels held"
                value={`${person.holds} of ${person.maxHolds}`}
                tone={
                  person.holds >= person.maxHolds
                    ? "danger"
                    : person.holds > 0
                      ? "verified"
                      : undefined
                }
              />
            ) : null}
            <Fact
              label="Identity"
              value={person.kycStatus.toLowerCase().replace(/_/g, " ")}
              tone={
                person.kycStatus === "APPROVED"
                  ? "verified"
                  : person.kycStatus === "REJECTED"
                    ? "danger"
                    : undefined
              }
            />
            <Fact
              label="Joined"
              value={person.createdAt.toLocaleDateString("en-GB", DATE)}
            />
          </dl>

          {person.slug ? (
            <Link
              href={`/seller/${person.slug}`}
              className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary-text underline-offset-4 hover:underline"
            >
              Their public seller page
              <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
            </Link>
          ) : null}

          {/* ---------------------------------------------------- money */}
          {wallet && withdrawals ? (
            <>
              <ConsoleSection
                id="money"
                title="Money"
                description="Their balance as the ledger has it, what is held against payouts finance has not settled, and every recent movement. Read-only: the ledger is never edited from here."
                actions={
                  // The correction form refuses your own account, and a
                  // staff account unless you are superadmin; the link is
                  // drawn only where it leads somewhere that works.
                  person.id !== staff.id &&
                  (person.role === "USER" || staff.role === "SUPERADMIN") ? (
                    <Link
                      href={`/admin/money/adjust?member=${encodeURIComponent(person.id)}`}
                      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary-text underline-offset-4 hover:underline"
                    >
                      <SlidersHorizontalIcon
                        aria-hidden="true"
                        className="size-4"
                      />
                      Correct this balance
                    </Link>
                  ) : null
                }
              >
                <MetricGrid className="lg:grid-cols-3">
                  <Metric
                    label="Balance"
                    value={
                      <Price
                        usd={wallet.balanceUsd / 100}
                        className="text-[1.4rem]"
                      />
                    }
                    note="Every ledger row, summed."
                  />
                  <Metric
                    label="Held for payouts"
                    value={
                      <Price
                        usd={wallet.pendingWithdrawalUsd / 100}
                        className="text-[1.4rem]"
                      />
                    }
                    tone={
                      wallet.pendingWithdrawalUsd > 0 ? "primary" : "neutral"
                    }
                    note="Requested or approved, not yet sent."
                  />
                  <Metric
                    label="Available"
                    value={
                      <Price
                        usd={wallet.availableUsd / 100}
                        className="text-[1.4rem]"
                      />
                    }
                    tone={wallet.availableUsd < 0 ? "danger" : "neutral"}
                    note={
                      wallet.availableUsd < 0
                        ? "Below zero. More is held than they have — reconcile before sending anything."
                        : "What they could withdraw now."
                    }
                  />
                </MetricGrid>

                <dl className="mt-3 grid gap-2.5">
                  <Fact
                    label="Payout address"
                    value={
                      wallet.payoutAddress ? (
                        <span className="block font-mono text-xs break-all">
                          {wallet.payoutAddress.address}
                          <span className="ml-1.5 font-sans text-subtle">
                            ({wallet.payoutAddress.network})
                          </span>
                        </span>
                      ) : (
                        "None saved"
                      )
                    }
                  />
                </dl>

                <div className="mt-3">
                  {ledgerShown.length === 0 ? (
                    <Nothing
                      title="No money has moved"
                      body="Nothing has been credited to or taken from this account."
                    />
                  ) : (
                    <TableScroller>
                      <table className="w-full min-w-[32rem] border-collapse text-sm">
                        <caption className="sr-only">
                          Latest ledger movements on this account, newest first.
                        </caption>
                        <thead>
                          <tr>
                            <Th>When</Th>
                            <Th>What</Th>
                            <Th>Note</Th>
                            <Th numeric>Amount</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {ledgerShown.map((entry) => (
                            <tr
                              key={entry.id}
                              className="border-t border-line first:border-t-0"
                            >
                              <Td>
                                <time
                                  dateTime={entry.createdAt.toISOString()}
                                  className="tnum text-xs whitespace-nowrap text-muted"
                                >
                                  {entry.createdAt.toLocaleDateString(
                                    "en-GB",
                                    DATE,
                                  )}
                                </time>
                              </Td>
                              <Td>
                                <span className="text-sm whitespace-nowrap text-fg">
                                  {LEDGER_KIND[entry.kind] ?? entry.kind}
                                </span>
                              </Td>
                              <Td>
                                <span className="text-xs text-subtle">
                                  {entry.note ?? "—"}
                                </span>
                              </Td>
                              <Td numeric>
                                <Amount
                                  cents={entry.amountUsd}
                                  size="sm"
                                  tone={
                                    entry.amountUsd < 0 ? "danger" : "verified"
                                  }
                                  caption={entry.amountUsd < 0 ? "out" : "in"}
                                />
                              </Td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </TableScroller>
                  )}
                  {wallet.entries.length > ledgerShown.length ? (
                    <p className="mt-2 text-xs text-subtle">
                      The latest {ledgerShown.length} of {wallet.entries.length}{" "}
                      loaded. The balance above counts every row.
                    </p>
                  ) : null}
                </div>
              </ConsoleSection>

              <ConsoleSection
                id="withdrawals"
                title="Payouts"
                count={withdrawals.length}
                description="Every withdrawal they have asked for, and what became of it. Compare the address on a new request against the ones that were paid before."
              >
                {withdrawals.length === 0 ? (
                  <Nothing
                    title="No payouts requested"
                    body="They have never asked to withdraw."
                  />
                ) : (
                  <TableScroller>
                    <table className="w-full min-w-[40rem] border-collapse text-sm">
                      <caption className="sr-only">
                        Withdrawal requests, newest first: when, where to,
                        status and amount.
                      </caption>
                      <thead>
                        <tr>
                          <Th>Requested</Th>
                          <Th>To</Th>
                          <Th>Status</Th>
                          <Th numeric>Amount</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {withdrawals.map((payout) => {
                          const meta = WITHDRAWAL_STATUS[payout.status];
                          return (
                            <tr
                              key={payout.id}
                              className="border-t border-line first:border-t-0"
                            >
                              <Td>
                                <time
                                  dateTime={payout.requestedAt.toISOString()}
                                  className="tnum text-xs whitespace-nowrap text-muted"
                                >
                                  {payout.requestedAt.toLocaleDateString(
                                    "en-GB",
                                    DATE,
                                  )}
                                </time>
                              </Td>
                              <Td>
                                <span className="block max-w-[16rem] font-mono text-xs break-all text-fg">
                                  {payout.address}
                                </span>
                                <span className="text-[0.6875rem] text-subtle">
                                  {payout.network}
                                  {payout.txHash ? " · has a transaction" : ""}
                                </span>
                              </Td>
                              <Td>
                                <Badge variant={meta.variant}>
                                  {meta.label}
                                </Badge>
                                {payout.rejectNote ? (
                                  <span className="mt-1 block text-[0.6875rem] text-subtle">
                                    {payout.rejectNote}
                                  </span>
                                ) : null}
                              </Td>
                              <Td numeric>
                                <Amount cents={payout.amountUsd} size="sm" />
                              </Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </TableScroller>
                )}
              </ConsoleSection>
            </>
          ) : (
            <p className="mt-6 flex items-start gap-1.5 text-xs leading-relaxed text-subtle">
              <LockIcon
                aria-hidden="true"
                className="mt-px size-3.5 shrink-0"
              />
              <span>
                Balance, ledger and payouts are shown to finance and superadmins
                only.
              </span>
            </p>
          )}

          {/* ---------------------------------------------------- deals */}
          <ConsoleSection
            id="deals"
            title="Deals"
            count={deals.total}
            description={
              deals.total > deals.deals.length
                ? `The latest ${deals.deals.length} of ${deals.total} — as buyer, seller or agent. Open one for its full history.`
                : "Every deal they are part of — as buyer, seller or agent. Open one for its full history."
            }
          >
            {deals.deals.length === 0 ? (
              <Nothing
                title="No deals"
                body="They have not bought, sold or handled a channel yet."
              />
            ) : (
              <TableScroller>
                <table className="w-full min-w-[40rem] border-collapse text-sm">
                  <caption className="sr-only">
                    Deals this person is part of, newest first.
                  </caption>
                  <thead>
                    <tr>
                      <Th>Deal</Th>
                      <Th>Their side</Th>
                      <Th>Status</Th>
                      <Th>Opened</Th>
                      {canSeeMoney ? <Th numeric>Total</Th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {deals.deals.map((deal) => (
                      <tr
                        key={deal.id}
                        className="border-t border-line first:border-t-0"
                      >
                        <Td>
                          <Link
                            href={`/dashboard/deals/${deal.id}`}
                            className="block min-w-0 underline-offset-4 hover:underline"
                          >
                            <Reference>{deal.reference}</Reference>
                            <span className="mt-1 block max-w-[18rem] truncate text-sm text-fg">
                              {deal.listingTitle}
                            </span>
                          </Link>
                        </Td>
                        <Td>
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm text-fg">
                              {SIDE[deal.side]}
                            </span>
                            <DealModeBadge mode={deal.mode} />
                          </span>
                        </Td>
                        <Td>
                          <OrderStatusBadge status={deal.status} />
                        </Td>
                        <Td>
                          <time
                            dateTime={deal.createdAt.toISOString()}
                            className="tnum text-xs whitespace-nowrap text-muted"
                          >
                            {deal.createdAt.toLocaleDateString("en-GB", DATE)}
                          </time>
                        </Td>
                        {canSeeMoney ? (
                          <Td numeric>
                            <Amount cents={deal.totalUsd} size="sm" />
                          </Td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroller>
            )}
          </ConsoleSection>
        </div>

        <div className="grid min-w-0 gap-3.5">
          <UserControls
            userId={person.id}
            currentRole={person.role}
            banned={person.banned}
            canSetRole={isSuperadmin}
            isSelf={isSelf}
            // From the server, so the picker cannot quietly stop offering a
            // role the platform still has. It did, for AGENT, for months.
            roles={ROLES}
            labels={ROLE_LABELS}
            blurbs={ROLE_BLURBS}
            consequences={ROLE_CONSEQUENCES}
            holds={person.holds}
            maxHolds={person.maxHolds}
            agentEmail={person.agentEmail}
            agentBrand={person.agentBrand}
          />
          {isSuperadmin || isSelf ? null : (
            <p className="text-xs leading-relaxed text-subtle">
              Only a superadmin can change what someone can reach. You can still
              suspend or restore the account.
            </p>
          )}

          <KycControl
            userId={person.id}
            current={person.kycStatus}
            canSet={canSetKyc}
            blockedBecause={canSetKyc ? undefined : kycBlockedBecause}
          />

          <AccountRecovery
            userId={person.id}
            emailVerified={person.emailVerified}
            sessions={person.sessions}
            twoFactorEnabled={person.twoFactorEnabled}
            canVerifyEmail={!isSelf}
            canEndSessions={canEndSessions}
            canResetTwoFactor={isSuperadmin && !isSelf}
            endSessionsBlockedBecause={
              isSelf
                ? "Sign yourself out from your own menu."
                : "Only a superadmin can sign out a staff account."
            }
          />
        </div>
      </div>
    </>
  );
}
