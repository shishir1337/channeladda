import {
  ArrowLeftIcon,
  SearchIcon,
  ShieldAlertIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AllClear,
  Amount,
  ConsoleHeader,
  ConsoleSection,
  Fact,
  Facts,
  MetaItem,
  Nothing,
  Panel,
  TableScroller,
  Td,
  Th,
} from "@/components/admin/console";
import { MoneyAdjustForm } from "@/components/admin/money-adjust-form";
import { exactUsd } from "@/components/admin/money-parts";
import { elapsed } from "@/components/admin/vocab";
import { Badge } from "@/components/ui/badge";
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
};

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
      <ConsoleHeader
        eyebrow="Money"
        title="Correct a balance"
        description="For when we owe somebody money, or credited them by mistake. Every correction is two ledger rows — one on the member, the opposite one on Channel Adda — so the books still balance, and both go on the audit trail under your name."
        actions={
          <Link
            href="/admin/money"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary-text underline-offset-4 hover:underline"
          >
            <ArrowLeftIcon aria-hidden="true" className="size-4" />
            Money desk
          </Link>
        }
        meta={
          <>
            <MetaItem label="Signed in as">{staff.name}</MetaItem>
            <MetaItem label="Desk">
              {staff.role.toLowerCase().replace("_", " ")}
            </MetaItem>
          </>
        }
      />

      <ConsoleSection
        id="rules"
        title="The rules"
        description="The server enforces every one of these, whatever the form says."
      >
        <Panel padded={false} className="px-4 sm:px-5">
          <Facts>
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
            <Fact label="Reason">
              {MIN_REASON_LENGTH}+ characters, shown to the member
            </Fact>
            <Fact label="Staff accounts, or your own">
              Superadmin only · never your own
            </Fact>
          </Facts>
        </Panel>
        <p className="mt-2.5 max-w-[78ch] text-xs leading-relaxed text-subtle">
          A correction is for money we already owe or already over-credited. A
          top-up the processor took but never credited is not one — it would
          book the money as ours rather than as the member&rsquo;s deposit. That
          belongs on the money desk&rsquo;s &ldquo;paid, not applied&rdquo;
          list.
        </p>
      </ConsoleSection>

      <ConsoleSection
        id="member"
        title="Whose balance"
        description="The member's email address, exactly, or their account id from the People page."
      >
        <search className="block">
          <form
            method="get"
            action="/admin/money/adjust"
            className="flex flex-wrap items-stretch gap-2"
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
                className="h-12 w-full rounded-xl border border-line bg-surface pr-3 pl-9 text-base text-fg placeholder:text-subtle focus:border-primary/60 focus:outline-none sm:text-sm"
              />
            </div>
            <button
              type="submit"
              className="h-12 shrink-0 cursor-pointer rounded-xl bg-primary px-5 text-sm font-medium text-primary-fg shadow-soft transition-opacity hover:opacity-90"
            >
              Find
            </button>
          </form>
        </search>

        {query && !member ? (
          <div className="mt-3">
            <Nothing
              title="Nobody with that email or id"
              body="This is an exact match, so check the spelling. Partial searches are on the People page."
              action={
                <Link
                  href={`/admin/users?q=${encodeURIComponent(query)}`}
                  className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
                >
                  Search People instead
                </Link>
              }
            />
          </div>
        ) : null}

        {member ? (
          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,20rem)_1fr]">
            <Panel>
              <p className="text-sm font-semibold text-fg">
                <Link
                  href={`/admin/users/${member.id}`}
                  className="text-primary-text underline-offset-4 hover:underline"
                >
                  {member.name}
                </Link>
              </p>
              <p className="mt-0.5 text-xs break-all text-subtle">
                {member.email}
              </p>
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
              <Facts columns={1} className="mt-3">
                <Fact label="Balance">
                  <span className="tnum">
                    {exactUsd(member.wallet.balanceUsd)}
                  </span>
                </Fact>
                <Fact
                  label="Promised to payouts"
                  tone={
                    member.wallet.pendingWithdrawalUsd > 0
                      ? "primary"
                      : "neutral"
                  }
                >
                  <span className="tnum">
                    {exactUsd(member.wallet.pendingWithdrawalUsd)}
                  </span>
                </Fact>
                <Fact label="Available">
                  <span className="tnum">
                    {exactUsd(member.wallet.availableUsd)}
                  </span>
                </Fact>
              </Facts>

              {member.wallet.entries.length > 0 ? (
                <div className="mt-4">
                  <p className="font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-subtle uppercase">
                    Last movements
                  </p>
                  <ul className="mt-2 grid gap-1.5">
                    {member.wallet.entries.slice(0, 6).map((entry) => (
                      <li
                        key={entry.id}
                        className="flex items-baseline justify-between gap-3 text-xs"
                      >
                        <span className="min-w-0 truncate text-muted">
                          {KIND_LABEL[entry.kind] ?? entry.kind}
                          <span className="text-subtle">
                            {" "}
                            · {elapsed(entry.createdAt).label}
                          </span>
                        </span>
                        <span
                          className={
                            entry.amountUsd < 0
                              ? "tnum shrink-0 text-danger"
                              : "tnum shrink-0 text-fg"
                          }
                        >
                          {entry.amountUsd > 0 ? "+" : ""}
                          {exactUsd(entry.amountUsd)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-3 text-xs text-subtle">
                  No money has moved on this account yet.
                </p>
              )}
            </Panel>

            {blocked ? (
              <Panel tone="danger">
                <p className="flex items-center gap-2 font-display text-sm font-bold text-fg">
                  <ShieldAlertIcon
                    aria-hidden="true"
                    className="size-4 text-danger"
                  />
                  {isSelf
                    ? "This is your own account"
                    : "This is a staff account"}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  {isSelf
                    ? "Nobody corrects their own balance. Ask a colleague on the finance desk, or a superadmin."
                    : "Only a superadmin can correct a staff member's balance, so two people on the same desk cannot top each other up."}
                </p>
              </Panel>
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
      </ConsoleSection>

      <ConsoleSection
        id="recent"
        title="Recent corrections"
        count={recent.length}
        description="The last 25, newest first, across every member. The reason is exactly what the member sees."
      >
        {recent.length === 0 ? (
          <AllClear
            icon={SlidersHorizontalIcon}
            title="No balance has been corrected"
            body="Every correction shows here with who made it and why."
          />
        ) : (
          <TableScroller>
            <table className="w-full min-w-[40rem] text-sm">
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
                  <tr key={row.id} className="border-t border-line align-top">
                    <Td className="whitespace-nowrap">
                      <time
                        dateTime={row.createdAt.toISOString()}
                        title={row.createdAt.toLocaleString("en-GB")}
                        className="tnum text-xs text-subtle"
                      >
                        {elapsed(row.createdAt).label}
                      </time>
                    </Td>
                    <Td>
                      <Link
                        href={`/admin/money/adjust?member=${encodeURIComponent(row.member.email)}`}
                        className="text-xs font-medium text-primary-text underline-offset-4 hover:underline"
                      >
                        {row.member.name}
                      </Link>
                      <span className="block text-[0.6875rem] break-all text-subtle">
                        {row.member.email}
                      </span>
                    </Td>
                    <Td numeric>
                      <Amount
                        cents={row.amountUsd}
                        caption={exactUsd(row.amountUsd)}
                        tone={row.amountUsd < 0 ? "danger" : "verified"}
                      />
                    </Td>
                    <Td className="max-w-[22rem] text-xs leading-relaxed text-muted">
                      {row.reason}
                    </Td>
                    <Td className="text-xs whitespace-nowrap text-subtle">
                      {row.byName ?? "Unknown"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroller>
        )}
      </ConsoleSection>
    </>
  );
}
