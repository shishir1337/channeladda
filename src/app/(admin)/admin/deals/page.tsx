import {
  ArrowLeftRightIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  UserRoundIcon,
  WalletIcon,
  ZapIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AllClear,
  Amount,
  ConsoleHeader,
  ConsoleSection,
  MetaItem,
  Metric,
  MetricGrid,
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
  Waited,
} from "@/components/admin/vocab";
import { db } from "@/lib/db";
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
 * The deal desk.
 *
 * Ordered by what blocks: a channel stranded with a suspended agent, then a
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

  const [activity, needingAgent, needingReassignment, awaitingPayment, mine] =
    await Promise.all([
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
    ]);

  const oldestUnheld = needingAgent.at(0)?.createdAt;
  const oldestUnpaid = awaitingPayment.at(0)?.createdAt;
  const owed = awaitingPayment.reduce((sum, order) => sum + order.totalUsd, 0);

  return (
    <>
      <ConsoleHeader
        eyebrow="Transfers"
        title="Deal desk"
        description={
          isStaff
            ? "Every transfer in flight, and the controls to move or end one. Nothing here times out on its own yet, so a deal that has sat for days is waiting on somebody reading this page."
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
          label="Suspended agent"
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
          title="Held by a suspended agent"
          count={needingReassignment.length}
          tone="danger"
          description="These channels are still owned by an account that can no longer act on them. Nothing moves until somebody else takes them on, or they go back to the seller."
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
                  {isStaff ? <AssignAgent orderId={order.id} /> : null}
                  <EndDeal
                    orderId={order.id}
                    mode="SAFEST"
                    status={order.status}
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
          description="Cryptomus tells us when one of these clears, and the sweep picks up anything that callback misses. Record one by hand only when the money reached us some other way — every later step of the deal unlocks behind it."
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
              {awaitingPayment.map((order) => (
                <RowItem key={order.id}>
                  <div className="p-4">
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
                    <RecordPayment orderId={order.id} />
                  </div>
                </RowItem>
              ))}
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
                        defaultEmail={viewer.email}
                        defaultBrand="Channel Adda Transfers"
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
                    />
                  </div>
                </RowItem>
              );
            })}
          </Rows>
        )}
      </ConsoleSection>

      {isStaff ? <StuckDeals /> : null}

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
