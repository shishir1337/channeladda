import {
  ExternalLinkIcon,
  LockIcon,
  ReceiptTextIcon,
  SlidersHorizontalIcon,
  WalletIcon,
  WorkflowIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  AccountRecovery,
  DangerZone,
  KycControl,
  UserControls,
} from "@/components/admin/user-controls";
import {
  DealModeBadge,
  OrderStatusBadge,
  ROLE_VARIANT,
} from "@/components/admin/vocab";
import {
  Amount,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  Fact,
  Facts,
  Meter,
  PageHeader,
  Reference,
  Section,
  Stat,
  StatGrid,
  TableCard,
  Td,
  Th,
  Tr,
} from "@/components/app/kit";
import { Avatar } from "@/components/app/user-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import type {
  KycStatus,
  LedgerKind,
  UserRole,
  WithdrawalStatus,
} from "@/generated/prisma/enums";
import { isCustodianRole, levelLabel } from "@/lib/custody-roles";
import { cn } from "@/lib/utils";
import {
  getUserDetail,
  listUserDeals,
  listUserWithdrawals,
  ROLE_BLURBS,
  ROLE_CONSEQUENCES,
  ROLE_LABELS,
  ROLES,
} from "@/server/admin-users";
import { ratingFor } from "@/server/reseller-status";
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
  BADGE_FEE: "Reseller badge",
} satisfies Record<LedgerKind, string>;

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

const KYC_VARIANT: Record<KycStatus, "neutral" | "verified" | "danger"> = {
  NOT_STARTED: "neutral",
  PENDING: "neutral",
  APPROVED: "verified",
  REJECTED: "danger",
};

/** "NOT_STARTED" → "Not started". */
function sentence(value: string) {
  const words = value.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The account's activity in one strip of figures. Hairlines between cells
 * rather than six separate cards, so it reads as one record.
 */
function Figures({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line shadow-xs sm:grid-cols-3">
      {children}
    </dl>
  );
}

function Figure({
  label,
  value,
  danger,
}: {
  label: string;
  value: number;
  /** Something worth a look: the dot and the number turn red. */
  danger?: boolean;
}) {
  return (
    <div className="bg-surface px-4 py-3.5 sm:px-5">
      <dt className="flex items-center gap-1.5 text-[0.8125rem] leading-5 text-muted">
        {danger ? (
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full bg-danger"
          />
        ) : null}
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 text-lg leading-7 font-semibold tracking-[-0.01em] tabular-nums",
          danger ? "text-danger" : value === 0 ? "text-subtle" : "text-fg",
        )}
      >
        {value.toLocaleString("en-US")}
      </dd>
    </div>
  );
}

function When({ date }: { date: Date }) {
  return (
    <time
      dateTime={date.toISOString()}
      className="text-[0.8125rem] whitespace-nowrap text-muted tabular-nums"
    >
      {date.toLocaleDateString("en-GB", DATE)}
    </time>
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

  const [deals, wallet, withdrawals, rating] = await Promise.all([
    listUserDeals(person.id),
    canSeeMoney ? getWallet(person.id) : null,
    canSeeMoney ? listUserWithdrawals(person.id) : null,
    ratingFor(person.id),
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
      <PageHeader
        back={{ href: "/admin/users", label: "All people" }}
        title={
          <span className="flex min-w-0 items-center gap-3">
            <Avatar name={person.name} className="size-9 text-[0.8125rem]" />
            <span className="min-w-0 break-words">{person.name}</span>
          </span>
        }
        description={<span className="break-all">{person.email}</span>}
        meta={
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge variant={ROLE_VARIANT[person.role]}>
              {ROLE_LABELS[person.role]}
            </Badge>
            {person.banned ? <Badge variant="danger">Suspended</Badge> : null}
          </span>
        }
        actions={
          person.slug ? (
            <Button asChild variant="secondary">
              <Link href={`/seller/${person.slug}`}>
                Their public seller page
                <ExternalLinkIcon aria-hidden="true" />
              </Link>
            </Button>
          ) : null
        }
      />

      {person.banned ? (
        <Callout
          tone="danger"
          title="This account is suspended."
          className="mb-6"
        >
          They cannot sign in and their listings are paused.
          {person.banReason ? ` Reason given: ${person.banReason}` : ""}
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0">
          <Section id="record" title="Activity">
            <Figures>
              <Figure label="Listed" value={person.listings} />
              <Figure label="Sold" value={person.sold} />
              <Figure label="Bought" value={person.bought} />
              <Figure label="Conversations open" value={person.openThreads} />
              <Figure
                label="Threads flagged"
                value={person.flaggedThreads}
                danger={person.flaggedThreads > 0}
              />
              <Figure label="Active sessions" value={person.sessions} />
            </Figures>
          </Section>

          {/* ---------------------------------------------------- money */}
          {wallet && withdrawals ? (
            <>
              <Section
                id="money"
                title="Money"
                info="Their balance as the ledger has it, what is held for payouts not yet settled, and recent movements. Read-only: the ledger is never edited from here."
                actions={
                  // The correction form refuses your own account, and a
                  // staff account unless you are superadmin; the link is
                  // drawn only where it leads somewhere that works.
                  person.id !== staff.id &&
                  (person.role === "USER" || staff.role === "SUPERADMIN") ? (
                    <Button asChild variant="secondary" size="sm">
                      <Link
                        href={`/admin/money/adjust?member=${encodeURIComponent(person.id)}`}
                      >
                        <SlidersHorizontalIcon aria-hidden="true" />
                        Correct this balance
                      </Link>
                    </Button>
                  ) : null
                }
              >
                <StatGrid columns={3}>
                  <Stat
                    label="Balance"
                    value={<Price usd={wallet.balanceUsd / 100} />}
                    info="Every ledger row, summed."
                  />
                  <Stat
                    label="Held for payouts"
                    value={<Price usd={wallet.pendingWithdrawalUsd / 100} />}
                    tone={
                      wallet.pendingWithdrawalUsd > 0 ? "primary" : "neutral"
                    }
                    info="Requested or approved, not yet sent."
                    // How much of the balance is spoken for, seen before it
                    // is read. Full when more is held than they have.
                    chip={
                      wallet.balanceUsd > 0 ? (
                        <Meter
                          value={wallet.pendingWithdrawalUsd}
                          max={wallet.balanceUsd}
                          label="Share of the balance held for payouts"
                          tone={
                            wallet.availableUsd < 0
                              ? "danger"
                              : wallet.pendingWithdrawalUsd > 0
                                ? "primary"
                                : "neutral"
                          }
                        />
                      ) : null
                    }
                  />
                  <Stat
                    label="Available"
                    value={<Price usd={wallet.availableUsd / 100} />}
                    tone={wallet.availableUsd < 0 ? "danger" : "neutral"}
                    info="What they could withdraw now."
                    // Money at risk: said on the card, never behind the (i).
                    note={
                      wallet.availableUsd < 0
                        ? "Below zero. More is held than they have — reconcile before sending anything."
                        : undefined
                    }
                  />
                </StatGrid>

                <Card className="mt-3 px-4 sm:px-5">
                  <Facts>
                    <Fact label="Payout address">
                      {wallet.payoutAddress ? (
                        <span className="block font-mono text-xs leading-5 font-normal break-all text-fg">
                          {wallet.payoutAddress.address}
                          <span className="ml-1.5 font-sans text-subtle">
                            ({wallet.payoutAddress.network})
                          </span>
                        </span>
                      ) : (
                        <span className="font-normal text-subtle">
                          None saved
                        </span>
                      )}
                    </Fact>
                  </Facts>
                </Card>

                <div className="mt-3">
                  {ledgerShown.length === 0 ? (
                    <EmptyState icon={WalletIcon} title="No money has moved" />
                  ) : (
                    <TableCard>
                      <table className="w-full min-w-[32rem] border-collapse">
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
                            <Tr key={entry.id}>
                              <Td>
                                <When date={entry.createdAt} />
                              </Td>
                              <Td className="whitespace-nowrap text-fg">
                                {LEDGER_KIND[entry.kind] ?? entry.kind}
                              </Td>
                              <Td className="text-[0.8125rem] text-muted">
                                {entry.note ?? "—"}
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
                            </Tr>
                          ))}
                        </tbody>
                      </table>
                    </TableCard>
                  )}
                  {wallet.entries.length > ledgerShown.length ? (
                    <p className="mt-2 text-xs text-subtle">
                      The latest {ledgerShown.length} of {wallet.entries.length}{" "}
                      loaded. The balance above counts every row.
                    </p>
                  ) : null}
                </div>
              </Section>

              <Section
                id="withdrawals"
                title="Payouts"
                count={withdrawals.length}
                description="Check a new request's address against those paid before."
                info="Every withdrawal they have asked for, and what became of it."
              >
                {withdrawals.length === 0 ? (
                  <EmptyState
                    icon={ReceiptTextIcon}
                    title="No payouts requested"
                  />
                ) : (
                  <TableCard>
                    <table className="w-full min-w-[40rem] border-collapse">
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
                            <Tr key={payout.id}>
                              <Td>
                                <When date={payout.requestedAt} />
                              </Td>
                              <Td>
                                <span className="block max-w-[16rem] font-mono text-xs leading-5 break-all text-fg">
                                  {payout.address}
                                </span>
                                <span className="text-xs text-subtle">
                                  {payout.network}
                                  {payout.txHash ? " · has a transaction" : ""}
                                </span>
                              </Td>
                              <Td>
                                <Badge variant={meta.variant}>
                                  {meta.label}
                                </Badge>
                                {payout.rejectNote ? (
                                  <span className="mt-1 block text-xs text-subtle">
                                    {payout.rejectNote}
                                  </span>
                                ) : null}
                              </Td>
                              <Td numeric>
                                <Amount cents={payout.amountUsd} size="sm" />
                              </Td>
                            </Tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </TableCard>
                )}
              </Section>
            </>
          ) : (
            <p className="mt-8 flex items-start gap-2 text-xs leading-relaxed text-subtle">
              <LockIcon
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
              />
              <span>
                Balance, ledger and payouts are shown to finance and superadmins
                only.
              </span>
            </p>
          )}

          {/* ---------------------------------------------------- deals */}
          <Section
            id="deals"
            title="Deals"
            count={deals.total}
            // Cut off, it says so in sight — the count beside the heading
            // is the whole total, more than the rows below.
            description={
              deals.total > deals.deals.length
                ? `The latest ${deals.deals.length} of ${deals.total}, as buyer, seller or agent.`
                : undefined
            }
            info={
              deals.total > deals.deals.length
                ? undefined
                : "Every deal they are part of, as buyer, seller or agent."
            }
          >
            {deals.deals.length === 0 ? (
              <EmptyState
                icon={WorkflowIcon}
                title="No deals"
                body="They have not bought, sold or handled a channel yet."
              />
            ) : (
              <TableCard>
                <table className="w-full min-w-[40rem] border-collapse">
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
                      <Tr key={deal.id}>
                        {/* The deal cell is the link, stretched over the
                            whole cell. */}
                        <Td className="relative">
                          <Link
                            href={`/dashboard/deals/${deal.id}`}
                            className="group/deal block min-w-0 after:absolute after:inset-0"
                          >
                            <Reference>{deal.reference}</Reference>
                            <span className="mt-1 block max-w-[18rem] truncate text-sm text-fg underline-offset-4 group-hover/deal:underline">
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
                          <When date={deal.createdAt} />
                        </Td>
                        {canSeeMoney ? (
                          <Td numeric>
                            <Amount cents={deal.totalUsd} size="sm" />
                          </Td>
                        ) : null}
                      </Tr>
                    ))}
                  </tbody>
                </table>
              </TableCard>
            )}
          </Section>
        </div>

        <div className="grid min-w-0 gap-3">
          <Card>
            <CardHeader as="h2" title="Account" />
            <Facts className="px-4 sm:px-5">
              <Fact label="Email">
                <Badge variant={person.emailVerified ? "verified" : "danger"}>
                  {person.emailVerified ? "Verified" : "Unverified"}
                </Badge>
              </Fact>
              {/* On a staff account this is not a nicety: it is the only thing
                  between a reused password and the payout screen. */}
              <Fact label="Two-factor">
                <Badge
                  variant={
                    person.twoFactorEnabled
                      ? "verified"
                      : person.role === "USER"
                        ? "neutral"
                        : "danger"
                  }
                >
                  {person.twoFactorEnabled ? "On" : "Off"}
                </Badge>
              </Fact>
              <Fact label="Identity">
                <Badge variant={KYC_VARIANT[person.kycStatus]}>
                  {sentence(person.kycStatus)}
                </Badge>
              </Fact>
              <Fact label="Rating points">
                <span className="tabular-nums">
                  {rating.points.toLocaleString("en-US")}
                </span>
              </Fact>
              <Fact label="Reseller badge">
                {rating.reseller && rating.endsAt
                  ? `Until ${rating.endsAt.toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}`
                  : "No"}
              </Fact>
              {isCustodianRole(person.role) ? (
                <Fact label="Deal level">{levelLabel(person.dealLevel)}</Fact>
              ) : null}
              {isCustodianRole(person.role) ? (
                <Fact
                  label="Channels held"
                  tone={
                    person.holds >= person.maxHolds
                      ? "danger"
                      : person.holds > 0
                        ? "verified"
                        : "neutral"
                  }
                >
                  <span className="inline-flex items-center gap-2.5">
                    <Meter
                      value={person.holds}
                      max={person.maxHolds}
                      label="Channels held against the cap"
                      // The team page's colours for the same measure: red
                      // at the cap, gold with one left, neutral otherwise.
                      tone={
                        person.holds >= person.maxHolds
                          ? "danger"
                          : person.holds === person.maxHolds - 1
                            ? "primary"
                            : "neutral"
                      }
                      className="w-14"
                    />
                    {person.holds} of {person.maxHolds}
                  </span>
                </Fact>
              ) : null}
              <Fact label="Joined">
                {person.createdAt.toLocaleDateString("en-GB", DATE)}
              </Fact>
            </Facts>
          </Card>

          <UserControls
            userId={person.id}
            currentRole={person.role}
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
            dealLevel={person.dealLevel}
          />
          {isSuperadmin || isSelf ? null : (
            <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-subtle">
              <LockIcon
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
              />
              <span>
                Only a superadmin can change what someone can reach. You can
                still suspend or restore the account.
              </span>
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
            canVerifyEmail={!isSelf}
            canEndSessions={canEndSessions}
            endSessionsBlockedBecause={
              isSelf
                ? "Sign yourself out from your own menu."
                : "Only a superadmin can sign out a staff account."
            }
          />

          <DangerZone
            userId={person.id}
            banned={person.banned}
            holds={person.holds}
            isSelf={isSelf}
            twoFactorEnabled={person.twoFactorEnabled}
            canResetTwoFactor={isSuperadmin && !isSelf}
          />
        </div>
      </div>
    </>
  );
}
