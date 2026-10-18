import {
  ArrowLeftRightIcon,
  HistoryIcon,
  MessagesSquareIcon,
  ReceiptIcon,
  SearchIcon,
  SearchXIcon,
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
  DealHead,
  DealModeBadge,
  elapsed,
  ORDER_STATUS,
  OrderStatusBadge,
  orderStatusLabel,
  Waited,
} from "@/components/admin/vocab";
import {
  AllClear,
  Amount,
  Card,
  EmptyState,
  FilterBar,
  FilterLink,
  hintClass,
  IconTile,
  inputClass,
  List,
  ListItem,
  MetaItem,
  PageHeader,
  Section,
  Sep,
  Stat,
  StatGrid,
  TableCard,
  Td,
  Th,
  Tr,
  TurnFlag,
} from "@/components/app/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import type { OrderStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
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

function day(date: Date) {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * One deal in a lookup list — search results and the finished view.
 *
 * Says who was on each side by email, because that is what a customer
 * writing in quotes, and links to the deal page, which staff can open for
 * any deal in any status.
 */
function LookupRow({ deal }: { deal: DealLookupRow }) {
  return (
    <ListItem href={`/dashboard/deals/${deal.id}`}>
      <DealHead
        title={deal.listingTitle}
        reference={deal.reference}
        tags={
          <>
            <DealModeBadge mode={deal.mode} />
            <OrderStatusBadge status={deal.status} />
            <span className="text-xs text-subtle">{deal.listingHandle}</span>
          </>
        }
        amount={
          <Amount
            cents={deal.priceUsd}
            caption={deal.mode === "SAFEST" ? "price, paid direct" : "price"}
          />
        }
        chevron
      />
      <p className="mt-2 grid gap-x-6 gap-y-0.5 text-xs text-muted sm:grid-cols-2">
        <span className="min-w-0 truncate">
          <span className="text-subtle">Buyer </span>
          {deal.buyerName} · {deal.buyerEmail}
        </span>
        <span className="min-w-0 truncate">
          <span className="text-subtle">Seller </span>
          {deal.sellerName} · {deal.sellerEmail}
        </span>
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-subtle">
        <span>
          Opened{" "}
          <time dateTime={deal.createdAt.toISOString()} className="tnum">
            {day(deal.createdAt)}
          </time>
        </span>
        {deal.endedAt ? (
          <>
            <Sep />
            <span>
              ended{" "}
              <time dateTime={deal.endedAt.toISOString()} className="tnum">
                {day(deal.endedAt)}
              </time>
            </span>
          </>
        ) : null}
      </p>
    </ListItem>
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

  // As many columns as there are figures, so a desk with three queues does
  // not leave a hole where a fourth would be.
  const figures = 2 + (isFinance ? 1 : 0) + (mineOnly ? 1 : 0);

  return (
    <>
      <PageHeader
        title="Deal desk"
        description={
          isStaff
            ? "Every transfer in flight, and the controls to move or end one. Only an unpaid deal lapses on its own; anything else that has sat is waiting on you."
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

      {/* The figures link down to their queue, when the queue is drawn. */}
      <StatGrid
        columns={figures === 2 ? 2 : figures === 3 ? 3 : 4}
        className={isStaff ? "mt-6" : undefined}
      >
        <Stat
          label="Needs an agent"
          value={needingAgent.length}
          icon={UserRoundIcon}
          href="#needs-agent"
          tone={needingAgent.length > 0 ? "primary" : "neutral"}
          chip={
            oldestUnheld ? (
              <Waited since={oldestUnheld} prefix="oldest" lateAfter={48} />
            ) : null
          }
          note="Live deals with nobody holding them."
        />
        <Stat
          label="Agent can no longer act"
          value={needingReassignment.length}
          icon={ShieldAlertIcon}
          href={needingReassignment.length > 0 ? "#reassign" : undefined}
          tone={needingReassignment.length > 0 ? "danger" : "neutral"}
          note="Channels held by an account that can no longer act."
        />
        {isFinance ? (
          <Stat
            label="Awaiting payment"
            value={awaitingPayment.length}
            icon={WalletIcon}
            href="#awaiting-payment"
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
          <Stat
            label="Yours"
            value={mine.length}
            icon={ArrowLeftRightIcon}
            href="#mine"
            note="Deals you are the agent of record on."
          />
        ) : null}
      </StatGrid>

      {/* The two modes are mirror images and staff get the asymmetry wrong
          under pressure, so the difference stays on the page rather than in
          somebody's memory. */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Card className="flex items-start gap-3 p-3.5">
          <IconTile icon={ShieldCheckIcon} size="sm" />
          <p className="min-w-0 text-xs leading-relaxed text-muted">
            <span className="font-medium text-fg">
              {DEAL_MODE.SAFEST.label}
            </span>{" "}
            — {DEAL_MODE.SAFEST.blurb}
          </p>
        </Card>
        <Card className="flex items-start gap-3 p-3.5">
          <IconTile icon={ZapIcon} size="sm" />
          <p className="min-w-0 text-xs leading-relaxed text-muted">
            <span className="font-medium text-fg">
              {DEAL_MODE.FASTEST.label}
            </span>{" "}
            — {DEAL_MODE.FASTEST.blurb}
          </p>
        </Card>
      </div>

      {needingReassignment.length > 0 ? (
        <Section
          id="reassign"
          title="Held by an agent who can no longer act"
          count={needingReassignment.length}
          tone="danger"
          description="Still owned by an agent who was suspended or moved to another role. Nothing moves until somebody else takes them on, or they go back to the seller."
        >
          <List>
            {needingReassignment.map((order) => (
              <ListItem key={order.id} flag="danger">
                <DealHead
                  title={order.listing.title}
                  reference={order.reference}
                  tags={
                    <>
                      <DealModeBadge mode="SAFEST" />
                      <OrderStatusBadge status={order.status} />
                      <Waited since={order.createdAt} prefix="open" />
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
              </ListItem>
            ))}
          </List>
        </Section>
      ) : null}

      {isFinance ? (
        <Section
          id="awaiting-payment"
          title="Waiting on payment"
          count={awaitingPayment.length}
          tone={awaitingPayment.length > 0 ? "primary" : "neutral"}
          description="Cryptomus tells us when one of these clears, and the sweep picks up anything that callback misses. Record one by hand only when the money reached us some other way — every later step of the deal unlocks behind it, and it cannot be undone."
          actions={
            awaitingPayment.length > 0 ? (
              <Amount cents={owed} caption="owed in total" size="sm" />
            ) : null
          }
        >
          {awaitingPayment.length === 0 ? (
            <AllClear
              title="Every opening payment has cleared"
              body="The sweep is still watching for callbacks that go missing."
            />
          ) : (
            <List>
              {awaitingPayment.map((order) => {
                const invoice = invoices.get(order.id) ?? null;
                const line = describeInvoice(invoice);
                return (
                  <ListItem
                    key={order.id}
                    flag={line.tone === "danger" ? "danger" : undefined}
                  >
                    <DealHead
                      title={order.listing.title}
                      reference={order.reference}
                      tags={
                        <>
                          <DealModeBadge mode={order.mode} />
                          <OrderStatusBadge status="AWAITING_PAYMENT" />
                          <Waited since={order.createdAt} prefix="open" />
                        </>
                      }
                      amount={
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
                    <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-line bg-surface-2/50 px-3 py-2.5">
                      <ReceiptIcon
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-subtle"
                      />
                      <div className="min-w-0 flex-1 text-xs leading-relaxed">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-medium text-fg">Processor</span>
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
                            Processor id{" "}
                            <span className="font-mono text-[0.6875rem] text-muted">
                              {invoice.externalId}
                            </span>
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {invoice && !invoice.appliedAt ? (
                      <CheckInvoice reference={invoice.reference} />
                    ) : null}
                    <RecordPayment orderId={order.id} />
                  </ListItem>
                );
              })}
            </List>
          )}
        </Section>
      ) : null}

      {mineOnly ? (
        <Section
          id="mine"
          title="Your deals"
          count={mine.length}
          description="You are the agent of record on these. Open one to work its steps in order."
        >
          {mine.length === 0 ? (
            <AllClear
              title="You are not holding anything"
              body="Take the next unheld deal below when you are ready."
            />
          ) : (
            <List>
              {mine.map((order) => {
                // Whose move it is, from the status vocabulary: the agent's
                // own turns earn the gold flag; anybody else's is a quiet
                // "with the buyer". A handover is shared, so it says nothing.
                const whose = ORDER_STATUS[order.status]?.whose ?? null;
                return (
                  <ListItem key={order.id} padded={false}>
                    <Link
                      href={`/dashboard/deals/${order.id}`}
                      className={cn(
                        "group block px-4 py-3 transition-colors duration-150 hover:bg-surface-2/60 focus-visible:-outline-offset-2 sm:px-5",
                        order.conversationId && "pb-2",
                      )}
                    >
                      <DealHead
                        title={order.listing.title}
                        reference={order.reference}
                        tags={
                          <>
                            <DealModeBadge mode={order.mode} />
                            <OrderStatusBadge status={order.status} />
                            <Waited since={order.createdAt} prefix="open" />
                            {whose === "agent" ? (
                              <TurnFlag mine />
                            ) : whose && whose !== "transfer" ? (
                              <TurnFlag
                                mine={false}
                                who={
                                  whose === "staff" ? "staff" : `the ${whose}`
                                }
                              />
                            ) : null}
                          </>
                        }
                        amount={
                          <Amount
                            cents={order.priceUsd}
                            caption="channel price"
                          />
                        }
                        chevron
                      />
                    </Link>
                    {/* Beside the row, not in it: a link inside a link is
                        not one either browser or screen reader can follow. */}
                    {order.conversationId ? (
                      <div className="px-4 pb-3 sm:px-5">
                        <Button asChild size="sm" variant="secondary">
                          <Link
                            href={`/dashboard/messages/${order.conversationId}`}
                          >
                            <MessagesSquareIcon aria-hidden="true" />
                            Open the deal chat
                          </Link>
                        </Button>
                      </div>
                    ) : null}
                  </ListItem>
                );
              })}
            </List>
          )}
        </Section>
      ) : null}

      <Section
        id="needs-agent"
        title="Needs an agent"
        count={needingAgent.length}
        tone={needingAgent.length > 0 ? "primary" : "neutral"}
        description="Live deals nobody is holding, oldest first. Until one is claimed, neither side can do anything."
      >
        {needingAgent.length === 0 ? (
          <AllClear
            title="Every live deal has somebody on it"
            body="New deals land here the moment their opening payment clears."
          />
        ) : (
          <List>
            {needingAgent.map((order) => {
              const age = elapsed(order.createdAt);
              return (
                <ListItem
                  key={order.id}
                  flag={age.hours >= 48 ? "danger" : undefined}
                >
                  <DealHead
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
                    amount={
                      <Amount cents={order.priceUsd} caption="channel price" />
                    }
                  />
                  {isAgent ? (
                    <ClaimDeal
                      orderId={order.id}
                      defaultEmail={identity?.email ?? viewer.email}
                      defaultBrand={identity?.brand ?? "Channel Adda Transfers"}
                      locked={identity !== null}
                    />
                  ) : (
                    <p className="mt-2 text-xs text-subtle">
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
                </ListItem>
              );
            })}
          </List>
        )}
      </Section>

      {isStaff ? <StuckDeals canMoveMoney={isFinance} /> : null}

      {/* Staff only — and genuinely not rendered, rather than rendered and
          hidden. Every reference in here links somewhere an agent gets a 404
          for, and the trail is the whole marketplace's deal history. */}
      {isStaff ? (
        <Section
          id="activity"
          title="Everything that has happened"
          count={activity.length}
          description="The fifty most recent events, read from the audit trail — the same record a dispute is settled from."
        >
          {activity.length === 0 ? (
            <EmptyState
              icon={HistoryIcon}
              title="No deal activity yet"
              body="Every deal event — opened, paid, assigned, stepped, ended — lands here as it happens."
            />
          ) : (
            <TableCard>
              <table className="w-full min-w-[46rem] text-sm">
                <caption className="sr-only">
                  Deal activity from the audit trail, newest first
                </caption>
                <thead>
                  <tr>
                    <Th className="w-20">When</Th>
                    <Th>What happened</Th>
                    <Th>Deal</Th>
                    <Th>Status now</Th>
                    <Th>Listing</Th>
                    <Th>By</Th>
                  </tr>
                </thead>
                <tbody>
                  {activity.map((row) => (
                    <Tr key={row.id}>
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
                      <Td className="whitespace-nowrap">
                        <Link
                          href={`/dashboard/deals/${row.orderId}`}
                          className="rounded font-mono text-xs text-muted underline-offset-4 transition-colors hover:text-fg hover:underline"
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
                    </Tr>
                  ))}
                </tbody>
              </table>
            </TableCard>
          )}
        </Section>
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
    <search className="block max-w-2xl">
      <form method="get" action="/admin/deals" className="flex gap-2">
        <div className="relative min-w-0 flex-1">
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
            className={cn(inputClass, "pl-9")}
          />
        </div>
        {view === "finished" ? (
          <input type="hidden" name="view" value="finished" />
        ) : null}
        <Button type="submit" size="md" variant="secondary">
          Find
        </Button>
      </form>
      <p id="deal-q-hint" className={hintClass}>
        A deal reference opens that deal. Anything else lists every deal it
        matches, in any status, finished ones included.
      </p>
    </search>
  );
}

/** In flight, or finished. The live desk stays the default. */
function DeskViews({ view }: { view: "live" | "finished" }) {
  return (
    <FilterBar label="Which deals" className="mt-5">
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
    <Section
      id="search"
      className="mt-6"
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
        <EmptyState
          icon={SearchXIcon}
          title="No deal matches that"
          body="Try the reference exactly as the customer wrote it, the channel's handle, or the buyer's or seller's email address."
          action={
            <Button asChild size="sm" variant="secondary">
              <Link href="/admin/deals">Clear the search</Link>
            </Button>
          }
        />
      ) : (
        <List>
          {search.rows.map((deal) => (
            <LookupRow key={deal.id} deal={deal} />
          ))}
        </List>
      )}
    </Section>
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
      <PageHeader
        title="Finished deals"
        description="Every deal that has stopped, most recent first. Open one for its whole record — the steps, the proof and who did what."
        meta={
          <>
            <MetaItem label="Signed in as">{viewerName}</MetaItem>
            <MetaItem label="Desk">
              {viewerRole.toLowerCase().replace("_", " ")}
            </MetaItem>
            <MetaItem label="Finished">
              <span className="tabular-nums">
                {all.toLocaleString("en-US")}
              </span>
            </MetaItem>
          </>
        }
      />

      <DealSearchForm query={query} view="finished" />
      <DeskViews view="finished" />
      {search ? <SearchResults query={query} search={search} /> : null}

      <FilterBar label="How the deal ended" className="mt-6">
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

      <Section
        id="finished"
        className="mt-6"
        title={status ? orderStatusLabel(status) : "All finished deals"}
        count={finished.total}
        description={
          finished.pages > 1
            ? `Page ${finished.page} of ${finished.pages}, most recent first.`
            : "Most recent first."
        }
      >
        {finished.rows.length === 0 ? (
          <EmptyState
            title="No deal has ended this way"
            body="Deals land here the moment they complete, are refunded, cancelled, returned or lapse."
          />
        ) : (
          <>
            <List>
              {finished.rows.map((deal) => (
                <LookupRow key={deal.id} deal={deal} />
              ))}
            </List>
            <Pagination
              className="mt-4"
              page={finished.page}
              pageCount={finished.pages}
              hrefFor={hrefFor}
            />
          </>
        )}
      </Section>
    </>
  );
}
