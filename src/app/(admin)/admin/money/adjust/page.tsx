import {
  SearchIcon,
  ShieldAlertIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MoneyAdjustForm } from "@/components/admin/money-adjust-form";
import { exactUsd, linkClass } from "@/components/admin/money-parts";
import { elapsed } from "@/components/admin/vocab";
import {
  Amount,
  Callout,
  Card,
  EmptyState,
  Fact,
  Facts,
  inputClass,
  PageHeader,
  Section,
  TableCard,
  Td,
  Th,
  Tr,
} from "@/components/app/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LedgerKind } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import {
  CREDIT_WINDOW_HOURS,
  FINANCE_CREDIT_CAP_USD,
  findMember,
  listRecentAdjustments,
  MAX_ADJUSTMENT_USD,
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
} from "@/server/adjustments";
import { requireRole } from "@/server/session";

export const metadata: Metadata = {
  title: "Correct a balance",
  robots: { index: false, follow: false },
};

/** How the wallet page names each kind, so staff read the member's words. */
const KIND_LABEL: Record<string, string> = {
  DEPOSIT: "Added funds",
  ESCROW_HOLD: "Paid into a deal",
  ESCROW_RELEASE: "Sale paid out",
  SELLER_FEE: "Seller fee",
  BUYER_FEE: "Buyer fee",
  REFUND: "Refund",
  WITHDRAWAL: "Payout sent",
  ADJUSTMENT: "Correction",
  BADGE_FEE: "Reseller badge",
} satisfies Record<LedgerKind, string>;

/**
 * Correcting a member's balance by hand.
 *
 * FINANCE and SUPERADMIN only. Finding the member is a separate, exact
 * lookup — by email address or account id — so a correction lands on the
 * person somebody meant rather than on the first of several partial matches.
 */
export default async function AdminAdjustPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireRole("FINANCE");
  const params = await searchParams;
  const query = typeof params.member === "string" ? params.member.trim() : "";
  const isSuperadmin = staff.role === "SUPERADMIN";

  const [member, recent] = await Promise.all([
    query ? findMember(query) : Promise.resolve(null),
    listRecentAdjustments(25),
  ]);

  const isSelf = member?.id === staff.id;
  const isStaffAccount = member !== null && member.role !== "USER";
  const blocked = isSelf || (isStaffAccount && !isSuperadmin);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/money", label: "Money desk" }}
        title="Correct a balance"
        description="For when we owe somebody money, or credited them by mistake."
      />

      {/* The limits themselves and the callout under them stay in sight:
          they are the rules money moves by. Only why they hold goes behind
          the (i). */}
      <Section
        id="rules"
        title="The rules"
        info="The server enforces every one of these, whatever the form says."
      >
        <Card className="px-4 sm:px-5">
          <Facts className="lg:grid-cols-2">
            <Fact label="Finance can add, per member">
              {exactUsd(FINANCE_CREDIT_CAP_USD)} in {CREDIT_WINDOW_HOURS}h
            </Fact>
            <Fact label="Over that">A superadmin</Fact>
            <Fact label="Taking money">
              Never below what is promised to a payout
            </Fact>
            <Fact label="Largest single correction">
              {exactUsd(MAX_ADJUSTMENT_USD)}
            </Fact>
            {/* The bottom-left cell when the rules sit in two columns. */}
            <Fact label="Reason" className="lg:border-b-0">
              {MIN_REASON_LENGTH}+ characters, shown to the member
            </Fact>
            <Fact label="Staff accounts, or your own">
              Superadmin only · never your own
            </Fact>
          </Facts>
        </Card>
        <Callout
          tone="warning"
          className="mt-3"
          title="A correction is for money we already owe or already over-credited."
        >
          A top-up the processor took but never credited is not one — it would
          book the money as ours rather than as the member&rsquo;s deposit. That
          belongs on the money desk&rsquo;s &ldquo;paid, not applied&rdquo;
          list.
        </Callout>
      </Section>

      <Section
        id="member"
        title="Whose balance"
        description="The member's email address, exactly, or their account id from the People page."
      >
        <search className="block">
          <form
            method="get"
            action="/admin/money/adjust"
            className="flex flex-wrap items-center gap-2 sm:max-w-xl"
          >
            <div className="relative min-w-56 flex-1">
              <SearchIcon
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
              />
              <label htmlFor="member" className="sr-only">
                Member email address or account id
              </label>
              <input
                id="member"
                name="member"
                type="search"
                defaultValue={query}
                autoComplete="off"
                placeholder="name@example.com"
                className={cn(inputClass, "pr-3 pl-9")}
              />
            </div>
            {/* The next step on an empty page; once somebody is found, the
                correction form below is, so this steps back. */}
            <Button type="submit" variant={member ? "secondary" : "primary"}>
              Find
            </Button>
          </form>
        </search>

        {query && !member ? (
          <EmptyState
            className="mt-3"
            title="Nobody with that email or id"
            body="This is an exact match, so check the spelling. Partial searches are on the People page."
            action={
              <Button asChild variant="secondary" size="sm">
                <Link href={`/admin/users?q=${encodeURIComponent(query)}`}>
                  Search People instead
                </Link>
              </Button>
            }
          />
        ) : null}

        {member ? (
          <div className="mt-3 grid items-start gap-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            <Card>
              <div className="px-4 pt-4 sm:px-5">
                <p className="text-sm leading-5 font-semibold text-fg">
                  <Link
                    href={`/admin/users/${member.id}`}
                    className={linkClass}
                  >
                    {member.name}
                  </Link>
                </p>
                <p className="mt-0.5 text-[0.8125rem] break-all text-muted">
                  {member.email}
                </p>
                {member.role !== "USER" || member.banned ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {member.role !== "USER" ? (
                      <Badge variant="info">
                        Staff · {member.role.toLowerCase()}
                      </Badge>
                    ) : null}
                    {member.banned ? (
                      <Badge variant="danger">Suspended</Badge>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <Facts className="mt-2 px-4 sm:px-5">
                <Fact label="Balance">
                  {exactUsd(member.wallet.balanceUsd)}
                </Fact>
                <Fact
                  label="Promised to payouts"
                  tone={
                    member.wallet.pendingWithdrawalUsd > 0
                      ? "primary"
                      : "neutral"
                  }
                >
                  {exactUsd(member.wallet.pendingWithdrawalUsd)}
                </Fact>
                <Fact label="Available">
                  {exactUsd(member.wallet.availableUsd)}
                </Fact>
              </Facts>

              <div className="border-t border-line px-4 py-3.5 sm:px-5">
                {member.wallet.entries.length > 0 ? (
                  <>
                    <p className="text-xs font-medium text-muted">
                      Last movements
                    </p>
                    <ul className="mt-2 grid gap-1.5">
                      {member.wallet.entries.slice(0, 6).map((entry) => (
                        <li
                          key={entry.id}
                          className="flex items-baseline justify-between gap-3 text-[0.8125rem]"
                        >
                          <span className="min-w-0 truncate text-muted">
                            {KIND_LABEL[entry.kind] ?? entry.kind}
                            <span className="text-subtle">
                              {" "}
                              · {elapsed(entry.createdAt).label}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "shrink-0 tabular-nums",
                              entry.amountUsd < 0 ? "text-danger" : "text-fg",
                            )}
                          >
                            {entry.amountUsd > 0 ? "+" : ""}
                            {exactUsd(entry.amountUsd)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-xs text-subtle">
                    No money has moved on this account yet.
                  </p>
                )}
              </div>
            </Card>

            {blocked ? (
              <Callout
                tone="danger"
                icon={ShieldAlertIcon}
                title={
                  isSelf
                    ? "This is your own account"
                    : "This is a staff account"
                }
              >
                {isSelf
                  ? "Nobody corrects their own balance. Ask a colleague on the finance desk, or a superadmin."
                  : "Only a superadmin can correct a staff member's balance, so two people on the same desk cannot top each other up."}
              </Callout>
            ) : (
              <MoneyAdjustForm
                // Remounted per member, so a half-typed correction never
                // carries over to the next person looked up.
                key={member.id}
                userId={member.id}
                memberName={member.name}
                balanceCents={member.wallet.balanceUsd}
                availableCents={member.wallet.availableUsd}
                pendingCents={member.wallet.pendingWithdrawalUsd}
                capCents={FINANCE_CREDIT_CAP_USD}
                capHours={CREDIT_WINDOW_HOURS}
                minReason={MIN_REASON_LENGTH}
                maxReason={MAX_REASON_LENGTH}
                isSuperadmin={isSuperadmin}
              />
            )}
          </div>
        ) : null}
      </Section>

      <Section
        id="recent"
        title="Recent corrections"
        count={recent.length}
        info="The last 25, newest first, across every member. The reason is exactly what the member sees."
      >
        {recent.length === 0 ? (
          <EmptyState
            icon={SlidersHorizontalIcon}
            title="No balance has been corrected"
            body="Every correction shows here with who made it and why."
          />
        ) : (
          <TableCard>
            <table className="w-full min-w-[44rem]">
              <caption className="sr-only">
                Recent balance corrections, newest first
              </caption>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Member</Th>
                  <Th numeric>Amount</Th>
                  <Th>Reason</Th>
                  <Th>By</Th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <Tr key={row.id}>
                    <Td className="align-top whitespace-nowrap">
                      <time
                        dateTime={row.createdAt.toISOString()}
                        title={row.createdAt.toLocaleString("en-GB")}
                        className="text-[0.8125rem] text-subtle tabular-nums"
                      >
                        {elapsed(row.createdAt).label}
                      </time>
                    </Td>
                    <Td className="align-top">
                      <Link
                        href={`/admin/money/adjust?member=${encodeURIComponent(row.member.email)}`}
                        className={cn(linkClass, "text-[0.8125rem]")}
                      >
                        {row.member.name}
                      </Link>
                      <span className="block text-xs break-all text-subtle">
                        {row.member.email}
                      </span>
                    </Td>
                    <Td numeric className="align-top">
                      <Amount
                        cents={row.amountUsd}
                        caption={exactUsd(row.amountUsd)}
                        tone={row.amountUsd < 0 ? "danger" : "verified"}
                      />
                    </Td>
                    <Td className="max-w-[22rem] align-top text-[0.8125rem] leading-relaxed text-muted">
                      {row.reason}
                    </Td>
                    <Td className="align-top text-[0.8125rem] whitespace-nowrap text-muted">
                      {row.byName ?? "Unknown"}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        )}
      </Section>
    </>
  );
}
