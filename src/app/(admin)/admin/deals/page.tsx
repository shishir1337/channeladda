import {
  ArrowLeftRightIcon,
  ReceiptIcon,
  SearchIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  UserRoundIcon,
  WalletIcon,
  ZapIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AllClear,
  Amount,
  ConsoleHeader,
  ConsoleSection,
  FilterBar,
  FilterLink,
  MetaItem,
  Metric,
  MetricGrid,
  Nothing,
  Panel,
  RowHead,
  RowItem,
  Rows,
  TableScroller,
  Td,
  Th,
} from "@/components/admin/console";
import {
  AssignAgent,
  CheckInvoice,
  ClaimDeal,
  EndDeal,
  RecordPayment,
} from "@/components/admin/deal-controls";
import { StuckDeals } from "@/components/admin/stuck-deals";
import {
  auditLabel,
  DEAL_MODE,
  DealModeBadge,
  elapsed,
  OrderStatusBadge,
  orderStatusLabel,
  Waited,
} from "@/components/admin/vocab";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import type { OrderStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import {
  type DealLookupRow,
  type DealSearch,
  describeInvoice,
  FINISHED_STATUSES,
  type FinishedDeals,
  latestInvoicesFor,
  listFinishedDeals,
  searchDeals,
} from "@/server/admin-money";
import { agentIdentity, listAssignableAgents } from "@/server/admin-users";
import {
  listDealActivity,
  listDealsForAgent,
  listDealsNeedingAgent,
  listDealsNeedingReassignment,
} from "@/server/deal-feed";
import { requireAdminArea } from "@/server/session";

export const metadata: Metadata = {
  title: "Deals",
  robots: { index: false, follow: false },
};

/**
 * One deal in a lookup list — search results and the finished view.
 *
 * Says who was on each side by email, because that is what a customer
 * writing in quotes, and links to the deal page, which staff can open for
 * any deal in any status.
 */
function LookupRow({ deal }: { deal: DealLookupRow }) {
  return (
    <RowItem>
      <Link
        href={`/dashboard/deals/${deal.id}`}
        className="block p-4 transition-colors hover:bg-surface-2"
      >
        <RowHead
          title={deal.listingTitle}
          reference={deal.reference}
          tags={
            <>
              <DealModeBadge mode={deal.mode} />
              <OrderStatusBadge status={deal.status} />
              <span className="text-xs text-subtle">{deal.listingHandle}</span>
            </>
          }
          right={
            <Amount
              cents={deal.priceUsd}
              caption={deal.mode === "SAFEST" ? "price, paid direct" : "price"}
            />
          }
        />
        <p className="mt-2 grid gap-0.5 text-xs text-muted sm:grid-cols-2 sm:gap-4">
          <span className="min-w-0 truncate">
            <span className="text-subtle">Buyer </span>
            {deal.buyerName} · {deal.buyerEmail}
          </span>
          <span className="min-w-0 truncate">
            <span className="text-subtle">Seller </span>
            {deal.sellerName} · {deal.sellerEmail}
          </span>
        </p>
        <p className="mt-1.5 text-[0.6875rem] text-subtle">
          Opened{" "}
          <time dateTime={deal.createdAt.toISOString()}>
            {deal.createdAt.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </time>
          {deal.endedAt ? (
            <>
              {" "}
              · ended{" "}
              <time dateTime={deal.endedAt.toISOString()}>
                {deal.endedAt.toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </time>
            </>
          ) : null}
        </p>
      </Link>
    </RowItem>
  );
}

/** Invoice tones, as badge variants. Same names, one place. */
const INVOICE_VARIANT = {
  neutral: "neutral",
  primary: "primary",
  verified: "verified",
  danger: "danger",
  info: "info",
} as const;

/**
 * The deal desk.
 *
 * Ordered by what blocks: a channel stranded with an agent who cannot act, then a
 * payment that has landed and is holding up every later step, then the deals
 * nobody is holding, then everything in flight, then the trail of what has
 * happened. Each queue says how many are in it and how long the oldest has
 * waited, because a count on its own does not tell you where to start.
 *
 * Agents reach this page; `requireStaff` guards every other admin page, so an
 * agent who wanders to the listing queue gets the same 404 a stranger would.
 */
export default async function AdminDealsPage({
  searchParams,
}: PageProps<"/admin/deals">) {
  const params = await searchParams;

  // Staff and agents both belong here, and the role decides what is shown.
  // The guard deliberately does not depend on the query string: an agent
  // arriving at the bare path from a bookmark or from a link in the activity
  // feed must not get a 404 for a page that is theirs.
  const viewer = await requireAdminArea();
  const isAgent = viewer.role === "AGENT" || viewer.role === "SUPERADMIN";
  const isFinance = viewer.role === "FINANCE" || viewer.role === "SUPERADMIN";
  const isStaff = viewer.role !== "AGENT";
  // An agent sees their own queue by default rather than only when the
  // query says so: the nav link cannot carry a query without the item
  // failing to highlight, and a bookmark to the bare path is the same page.
  const mineOnly = params.agent === "me" || viewer.role === "AGENT";

  // ---- Lookup. Staff only, like the activity trail below: an agent works
  // the deals they hold, and a search across every deal on the marketplace
  // is not theirs. For an agent the query is ignored, not answered.
  const query =
    isStaff && typeof params.q === "string"
      ? params.q.trim().slice(0, 120)
      : "";
  const view = isStaff && params.view === "finished" ? "finished" : "live";
  const finishedStatus =
    typeof params.status === "string" &&
    FINISHED_STATUSES.includes(params.status as OrderStatus)
      ? (params.status as OrderStatus)
      : null;

  const search = query ? await searchDeals(query) : null;
  // A reference that exists takes staff straight to the deal: when a
  // customer quotes "CA-48213", opening that deal is the whole of the job.
  // A server redirect, so the history holds the deal and not this search.
  if (search?.exact) redirect(`/dashboard/deals/${search.exact.id}`);

  if (view === "finished") {
    const finished = await listFinishedDeals({
      status: finishedStatus,
      page: Number(params.page) || 1,
    });
    return (
      <FinishedView
        viewerName={viewer.name}
        viewerRole={viewer.role}
        query={query}
        search={search}
        status={finishedStatus}
        finished={finished}
      />
    );
  }

  const [
    activity,
    needingAgent,
    needingReassignment,
    awaitingPayment,
    mine,
    identity,
    assignable,
  ] = await Promise.all([
    // Staff only, and not fetched otherwise. The platform-wide trail used
    // to be queried for everybody and then hidden from agents with a CSS
    // class, which is not access control: the rows were sitting in the
    // HTML, so an agent could read every deal on the marketplace from
    // view-source. An agent gets an empty list and no section at all.
    isStaff ? listDealActivity(50) : Promise.resolve([]),
    listDealsNeedingAgent(),
    listDealsNeedingReassignment(),
    isFinance
      ? db.order.findMany({
          where: { status: "AWAITING_PAYMENT" },
          orderBy: { createdAt: "asc" },
          take: 25,
          select: {
            id: true,
            reference: true,
            mode: true,
            totalUsd: true,
            createdAt: true,
            listing: { select: { title: true } },
          },
        })
      : Promise.resolve([]),
    mineOnly ? listDealsForAgent(viewer.id) : Promise.resolve([]),
    isAgent ? agentIdentity(viewer.id) : Promise.resolve(null),
    isStaff ? listAssignableAgents() : Promise.resolve(null),
  ]);

  const oldestUnheld = needingAgent.at(0)?.createdAt;
  const oldestUnpaid = awaitingPayment.at(0)?.createdAt;
  const owed = awaitingPayment.reduce((sum, order) => sum + order.totalUsd, 0);

  // What the processor has said about each unpaid deal, so finance is not
  // recording a payment by hand — irreversibly — on data it cannot see.
  const invoices = await latestInvoicesFor(
    awaitingPayment.map((order) => order.id),
  );

  return (
    <>
      <ConsoleHeader
        eyebrow="Transfers"
        title="Deal desk"
        description={
          isStaff
            ? "Every transfer in flight, and the controls to move or end one. An unpaid deal lapses on its own when its payment window closes; anything else that has sat for days is waiting on somebody reading this page."
            : "The deals you are holding, and the ones nobody has taken yet. Open a deal to work its steps."
        }
        meta={
          <>
            <MetaItem label="Signed in as">{viewer.name}</MetaItem>
            <MetaItem label="Desk">
              {viewer.role.toLowerCase().replace("_", " ")}
            </MetaItem>
            <MetaItem label="Read">
              {new Date().toLocaleString("en-GB")}
            </MetaItem>
          </>
        }
      />

      {isStaff ? (
        <>
          <DealSearchForm query={query} view="live" />
          <DeskViews view="live" />
          {search ? <SearchResults query={query} search={search} /> : null}
        </>
      ) : null}

      <MetricGrid className="mt-6">
        <Metric
          label="Needs an agent"
          value={needingAgent.length}
          icon={UserRoundIcon}
          tone={needingAgent.length > 0 ? "primary" : "neutral"}
          chip={
            oldestUnheld ? (
              <Waited since={oldestUnheld} prefix="oldest" lateAfter={48} />
            ) : null
          }
          note="Live deals with nobody holding them."
        />
        <Metric
          label="Agent can no longer act"
          value={needingReassignment.length}
          icon={ShieldAlertIcon}
          tone={needingReassignment.length > 0 ? "danger" : "neutral"}
          note="Channels held by an account that can no longer act."
        />
        {isFinance ? (
          <Metric
            label="Awaiting payment"
            value={awaitingPayment.length}
            icon={WalletIcon}
            tone={awaitingPayment.length > 0 ? "primary" : "neutral"}
            chip={
              oldestUnpaid ? (
                <Waited since={oldestUnpaid} prefix="oldest" lateAfter={48} />
              ) : null
            }
            note="Opening payments not yet cleared."
          />
        ) : null}
        {mineOnly ? (
          <Metric
            label="Yours"
            value={mine.length}
            icon={ArrowLeftRightIcon}
            note="Deals you are the agent of record on."
          />
        ) : null}
      </MetricGrid>

      {/* The two modes are mirror images and staff get the asymmetry wrong
          under pressure, so the difference stays on the page rather than in
          somebody's memory. */}
      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        <Panel className="flex gap-3 p-3.5" padded={false}>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted sm:size-9">
            <ShieldCheckIcon aria-hidden="true" className="size-4" />
          </span>
          <p className="min-w-0 text-xs leading-relaxed text-muted">
            <span className="font-semibold text-fg">
              {DEAL_MODE.SAFEST.label}
            </span>{" "}
            — {DEAL_MODE.SAFEST.blurb}
          </p>
        </Panel>
        <Panel className="flex gap-3 p-3.5" padded={false}>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted sm:size-9">
            <ZapIcon aria-hidden="true" className="size-4" />
          </span>
          <p className="min-w-0 text-xs leading-relaxed text-muted">
            <span className="font-semibold text-fg">
              {DEAL_MODE.FASTEST.label}
            </span>{" "}
            — {DEAL_MODE.FASTEST.blurb}
          </p>
        </Panel>
      </div>

      {needingReassignment.length > 0 ? (
        <ConsoleSection
          id="reassign"
          title="Held by an agent who can no longer act"
          count={needingReassignment.length}
          tone="danger"
          description="These channels are still owned by an agent who was suspended or moved to another role, and who can no longer act on them. Nothing moves until somebody else takes them on, or they go back to the seller."
        >
          <Rows>
            {needingReassignment.map((order) => (
              <RowItem key={order.id} flag="danger">
                <div className="p-4 pl-5">
                  <RowHead
                    title={order.listing.title}
                    reference={order.reference}
                    tags={
                      <>
                        <DealModeBadge mode="SAFEST" />
                        <OrderStatusBadge status={order.status} />
                        <span className="text-xs text-subtle">
                          was {order.agent?.name ?? "an agent"}
                        </span>
                      </>
                    }
                  />
                  {assignable ? (
                    <AssignAgent
                      orderId={order.id}
                      agents={assignable.agents}
                      currentAgentId={order.agent?.id ?? null}
                    />
                  ) : null}
                  <EndDeal
                    orderId={order.id}
                    mode="SAFEST"
                    status={order.status}
                    canMoveMoney={isFinance}
                  />
                </div>
              </RowItem>
            ))}
          </Rows>
        </ConsoleSection>
      ) : null}

      {isFinance ? (
        <ConsoleSection
          id="awaiting-payment"
          title="Waiting on payment"
          count={awaitingPayment.length}
          tone={awaitingPayment.length > 0 ? "primary" : "neutral"}
          description="Cryptomus tells us when one of these clears, and the sweep picks up anything that callback misses. Each row says what the processor last told us. Record one by hand only when the money reached us some other way — every later step of the deal unlocks behind it, and it cannot be undone."
          actions={
            awaitingPayment.length > 0 ? (
              <span className="text-xs text-subtle">
                <Amount cents={owed} caption="owed in total" size="sm" />
              </span>
            ) : null
          }
        >
          {awaitingPayment.length === 0 ? (
            <AllClear
              title="Every opening payment has cleared"
              body="Nothing is blocked on money reaching us. The sweep is still watching for callbacks that go missing."
            />
          ) : (
            <Rows>
              {awaitingPayment.map((order) => {
                const invoice = invoices.get(order.id) ?? null;
                const line = describeInvoice(invoice);
                return (
                  <RowItem
                    key={order.id}
                    flag={line.tone === "danger" ? "danger" : undefined}
                  >
                    <div className="p-4 pl-5">
                      <RowHead
                        title={order.listing.title}
                        reference={order.reference}
                        tags={
                          <>
                            <DealModeBadge mode={order.mode} />
                            <OrderStatusBadge status="AWAITING_PAYMENT" />
                            <Waited since={order.createdAt} prefix="open" />
                          </>
                        }
                        right={
                          <Amount
                            cents={order.totalUsd}
                            caption={
                              order.mode === "SAFEST"
                                ? "admin fee due"
                                : "price + fee due"
                            }
                          />
                        }
                      />
                      <div className="mt-3 flex items-start gap-2.5 rounded-card border border-line bg-surface-2 p-3">
                        <ReceiptIcon
                          aria-hidden="true"
                          className="mt-0.5 size-4 shrink-0 text-subtle"
                        />
                        <div className="min-w-0 text-xs leading-relaxed">
                          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-subtle uppercase">
                              Processor
                            </span>
                            <Badge variant={INVOICE_VARIANT[line.tone]}>
                              {line.label}
                            </Badge>
                            {invoice ? (
                              <Waited
                                since={invoice.settledAt ?? invoice.updatedAt}
                                prefix={invoice.settledAt ? "paid" : "updated"}
                                warnAfter={invoice.settledAt ? 0.25 : 12}
                                lateAfter={invoice.settledAt ? 1 : 24}
                              />
                            ) : null}
                          </p>
                          <p className="mt-1 text-muted">{line.note}</p>
                          {invoice?.externalId ? (
                            <p className="mt-1 break-all text-subtle">
                              Processor id {invoice.externalId}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      {invoice && !invoice.appliedAt ? (
                        <CheckInvoice reference={invoice.reference} />
                      ) : null}
                      <RecordPayment orderId={order.id} />
                    </div>
                  </RowItem>
                );
              })}
            </Rows>
          )}
        </ConsoleSection>
      ) : null}

      {mineOnly ? (
        <ConsoleSection
          id="mine"
          title="Your deals"
          count={mine.length}
          description="You are the agent of record on these. Open one to work its steps in order."
        >
          {mine.length === 0 ? (
            <AllClear
              title="You are not holding anything"
              body="Nothing is waiting on you. Take the next unheld deal below when you are ready."
            />
          ) : (
            <Rows>
              {mine.map((order) => (
                <RowItem key={order.id}>
                  <Link
                    href={`/dashboard/deals/${order.id}`}
                    className="block p-4 transition-colors hover:bg-surface-2"
                  >
                    <RowHead
                      title={order.listing.title}
                      reference={order.reference}
                      tags={
                        <>
                          <DealModeBadge mode={order.mode} />
                          <OrderStatusBadge status={order.status} />
                          <Waited since={order.createdAt} prefix="open" />
                        </>
                      }
                      right={
                        <Amount
                          cents={order.priceUsd}
                          caption="channel price"
                        />
                      }
                    />
                    <p className="mt-2 text-xs font-medium text-primary-text">
                      Open the deal and work the steps →
                    </p>
                  </Link>
                </RowItem>
              ))}
            </Rows>
          )}
        </ConsoleSection>
      ) : null}

      <ConsoleSection
        id="needs-agent"
        title="Needs an agent"
        count={needingAgent.length}
        tone={needingAgent.length > 0 ? "primary" : "neutral"}
        description="Live deals nobody is holding, oldest first. Until one is claimed, neither side can do anything."
      >
        {needingAgent.length === 0 ? (
          <AllClear
            title="Every live deal has somebody on it"
            body="Nothing is waiting to be claimed. New deals land here the moment their opening payment clears."
          />
        ) : (
          <Rows>
            {needingAgent.map((order) => {
              const age = elapsed(order.createdAt);
              return (
                <RowItem
                  key={order.id}
                  flag={age.hours >= 48 ? "danger" : undefined}
                >
                  <div className="p-4 pl-5">
                    <RowHead
                      title={order.listing.title}
                      reference={order.reference}
                      tags={
                        <>
                          <DealModeBadge mode={order.mode} />
                          <OrderStatusBadge status={order.status} />
                          <Waited
                            since={order.createdAt}
                            prefix="unheld"
                            lateAfter={48}
                          />
                        </>
                      }
                      right={
                        <Amount
                          cents={order.priceUsd}
                          caption="channel price"
                        />
                      }
                    />
                    {isAgent ? (
                      <ClaimDeal
                        orderId={order.id}
                        defaultEmail={identity?.email ?? viewer.email}
                        defaultBrand={
                          identity?.brand ?? "Channel Adda Transfers"
                        }
                        locked={identity !== null}
                      />
                    ) : (
                      <p className="mt-2.5 text-xs text-subtle">
                        An agent claims this from their own queue. You can still
                        end it below.
                      </p>
                    )}
                    <EndDeal
                      orderId={order.id}
                      mode={order.mode}
                      status={order.status}
                      canMoveMoney={isFinance}
                    />
                  </div>
                </RowItem>
              );
            })}
          </Rows>
        )}
      </ConsoleSection>

      {isStaff ? <StuckDeals canMoveMoney={isFinance} /> : null}

      {/* Staff only — and genuinely not rendered, rather than rendered and
          hidden. Every reference in here links somewhere an agent gets a 404
          for, and the trail is the whole marketplace's deal history. */}
      {isStaff ? (
        <ConsoleSection
          id="activity"
          title="Everything that has happened"
          count={activity.length}
          description="Read from the audit trail, so it is the same record a dispute is settled from. The fifty most recent events."
        >
          {activity.length === 0 ? (
            <AllClear
              title="No deal activity yet"
              body="Every deal event — opened, paid, assigned, stepped, ended — lands here as it happens."
            />
          ) : (
            <TableScroller>
              <table className="w-full min-w-[46rem] text-sm">
                <caption className="sr-only">
                  Deal activity from the audit trail, newest first
                </caption>
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th>What happened</Th>
                    <Th>Deal</Th>
                    <Th>Status now</Th>
                    <Th>Listing</Th>
                    <Th>By</Th>
                  </tr>
                </thead>
                <tbody>
                  {activity.map((row) => (
                    <tr key={row.id} className="border-t border-line">
                      <Td className="whitespace-nowrap">
                        <time
                          dateTime={row.createdAt.toISOString()}
                          title={row.createdAt.toLocaleString("en-GB")}
                          className="tnum text-xs text-subtle"
                        >
                          {elapsed(row.createdAt).label}
                        </time>
                      </Td>
                      <Td className="font-medium text-fg">
                        {auditLabel(row.action)}
                      </Td>
                      <Td>
                        <Link
                          href={`/dashboard/deals/${row.orderId}`}
                          className="tnum text-xs text-primary-text underline-offset-4 hover:underline"
                        >
                          {row.orderReference}
                        </Link>
                      </Td>
                      <Td>
                        <OrderStatusBadge status={row.orderStatus} />
                      </Td>
                      <Td className="max-w-[16rem]">
                        <span className="block truncate text-xs text-muted">
                          {row.listingTitle}
                        </span>
                      </Td>
                      <Td className="text-xs whitespace-nowrap text-subtle">
                        {row.actorName ?? "Channel Adda"}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroller>
          )}
        </ConsoleSection>
      ) : null}
    </>
  );
}

// ----------------------------------------------------------------- lookup

/**
 * Finding a deal from what a customer wrote.
 *
 * A plain GET form, like the People search, so a lookup has a URL and works
 * before any JavaScript arrives.
 */
function DealSearchForm({
  query,
  view,
}: {
  query: string;
  view: "live" | "finished";
}) {
  return (
    <search className="mt-5 block">
      <form
        method="get"
        action="/admin/deals"
        className="flex flex-wrap items-stretch gap-2"
      >
        <div className="relative min-w-56 flex-1">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
          />
          <label htmlFor="deal-q" className="sr-only">
            Find a deal by reference, listing handle or email address
          </label>
          <input
            id="deal-q"
            name="q"
            type="search"
            defaultValue={query}
            autoComplete="off"
            placeholder="CA-48213, @handle or an email address"
            aria-describedby="deal-q-hint"
            className="h-12 w-full rounded-xl border border-line bg-surface pr-3 pl-9 text-base text-fg placeholder:text-subtle focus:border-primary/60 focus:outline-none sm:text-sm"
          />
        </div>
        {view === "finished" ? (
          <input type="hidden" name="view" value="finished" />
        ) : null}
        <button
          type="submit"
          className="h-12 shrink-0 cursor-pointer rounded-xl bg-primary px-5 text-sm font-medium text-primary-fg shadow-soft transition-opacity hover:opacity-90"
        >
          Find
        </button>
      </form>
      <p id="deal-q-hint" className="mt-1.5 text-xs text-subtle">
        A deal reference opens that deal. Anything else lists every deal it
        matches, in any status, finished ones included.
      </p>
    </search>
  );
}

/** In flight, or finished. The live desk stays the default. */
function DeskViews({ view }: { view: "live" | "finished" }) {
  return (
    <div className="mt-3">
      <FilterBar label="Which deals">
        <FilterLink href="/admin/deals" active={view === "live"}>
          In flight
        </FilterLink>
        <FilterLink
          href="/admin/deals?view=finished"
          active={view === "finished"}
        >
          Finished
        </FilterLink>
      </FilterBar>
    </div>
  );
}

function SearchResults({
  query,
  search,
}: {
  query: string;
  search: DealSearch;
}) {
  return (
    <ConsoleSection
      id="search"
      title="Matching deals"
      count={search.total}
      tone={search.total > 0 ? "primary" : "neutral"}
      description={
        search.total > search.rows.length
          ? `The newest ${search.rows.length} of ${search.total.toLocaleString("en-US")} deals matching “${query}”. Add more of the email or handle to narrow it.`
          : `Every deal matching “${query}”, newest first.`
      }
    >
      {search.rows.length === 0 ? (
        <Nothing
          title="No deal matches that"
          body="Try the reference exactly as the customer wrote it, the channel's handle, or the buyer's or seller's email address."
          action={
            <Link
              href="/admin/deals"
              className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              Clear the search
            </Link>
          }
        />
      ) : (
        <Rows>
          {search.rows.map((deal) => (
            <LookupRow key={deal.id} deal={deal} />
          ))}
        </Rows>
      )}
    </ConsoleSection>
  );
}

/**
 * Deals that have stopped.
 *
 * The desk used to show only live statuses and the newest fifty audit
 * events, so a completed, refunded, cancelled or lapsed deal was reachable
 * only by its id. Staff only — the page guard admits agents, and this view
 * is never drawn for them.
 */
function FinishedView({
  viewerName,
  viewerRole,
  query,
  search,
  status,
  finished,
}: {
  viewerName: string;
  viewerRole: string;
  query: string;
  search: DealSearch | null;
  status: OrderStatus | null;
  finished: FinishedDeals;
}) {
  const all = FINISHED_STATUSES.reduce(
    (sum, s) => sum + (finished.counts[s] ?? 0),
    0,
  );
  const hrefFor = (next: number) => {
    const params = new URLSearchParams({ view: "finished" });
    if (status) params.set("status", status);
    if (next > 1) params.set("page", String(next));
    return `/admin/deals?${params}`;
  };

  return (
    <>
      <ConsoleHeader
        eyebrow="Transfers"
        title="Finished deals"
        description="Every deal that has stopped, most recent first: completed, refunded, cancelled, returned or lapsed. Open one for its whole record — the steps, the proof and who did what."
        meta={
          <>
            <MetaItem label="Signed in as">{viewerName}</MetaItem>
            <MetaItem label="Desk">
              {viewerRole.toLowerCase().replace("_", " ")}
            </MetaItem>
            <MetaItem label="Finished">{all.toLocaleString("en-US")}</MetaItem>
          </>
        }
      />

      <DealSearchForm query={query} view="finished" />
      <DeskViews view="finished" />
      {search ? <SearchResults query={query} search={search} /> : null}

      <div className="mt-3">
        <FilterBar label="How the deal ended">
          <FilterLink
            href="/admin/deals?view=finished"
            active={status === null}
            count={all}
          >
            All
          </FilterLink>
          {FINISHED_STATUSES.map((s) => (
            <FilterLink
              key={s}
              href={`/admin/deals?view=finished&status=${s}`}
              active={status === s}
              count={finished.counts[s] ?? 0}
            >
              {orderStatusLabel(s)}
            </FilterLink>
          ))}
        </FilterBar>
      </div>

      <ConsoleSection
        id="finished"
        title={status ? orderStatusLabel(status) : "All finished deals"}
        count={finished.total}
        description={
          finished.pages > 1
            ? `Page ${finished.page} of ${finished.pages}, most recent first.`
            : "Most recent first."
        }
      >
        {finished.rows.length === 0 ? (
          <Nothing
            title="No deal has ended this way"
            body="Deals land here the moment they complete, are refunded, cancelled, returned or lapse."
          />
        ) : (
          <>
            <Rows>
              {finished.rows.map((deal) => (
                <LookupRow key={deal.id} deal={deal} />
              ))}
            </Rows>
            <Pagination
              className="mt-4"
              page={finished.page}
              pageCount={finished.pages}
              hrefFor={hrefFor}
            />
          </>
        )}
      </ConsoleSection>
    </>
  );
}
