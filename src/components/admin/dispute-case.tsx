import {
  CheckIcon,
  ExternalLinkIcon,
  FlagIcon,
  MessagesSquareIcon,
  PaperclipIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Amount } from "@/components/admin/console";
import { EndDeal } from "@/components/admin/deal-controls";
import { WhatsAppContact } from "@/components/admin/dispute-contact";
import { AddDisputeNote } from "@/components/admin/dispute-note";
import {
  auditLabel,
  custodyFacts,
  DealModeBadge,
  OrderStatusBadge,
  Waited,
} from "@/components/admin/vocab";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  DisputeCase as Case,
  RecordEntry,
  RecordSide,
} from "@/server/admin-disputes";

/**
 * One frozen deal, with everything needed to decide it on one screen.
 *
 * Read top to bottom the way a decision is made: what each side said, where
 * the channel and the money are, how far the deal had got, who to call — and
 * only then the levers. The record comes first because the levers are worth
 * nothing without it; until this desk existed a moderator saw that a deal was
 * frozen and nothing about why.
 */

/** The Terms: a first response within 48 hours, a decision within seven days. */
export const FIRST_RESPONSE_HOURS = 48;
export const DECISION_HOURS = 7 * 24;

const SIDE: Record<
  RecordSide,
  { label: string; variant: ComponentProps<typeof Badge>["variant"] }
> = {
  buyer: { label: "Buyer", variant: "info" },
  seller: { label: "Seller", variant: "info" },
  agent: { label: "Agent", variant: "neutral" },
  staff: { label: "Staff", variant: "neutral" },
  platform: { label: "Automatic", variant: "neutral" },
  other: { label: "Not on this deal", variant: "neutral" },
};

/** What a row with nothing typed on it still tells you. */
function unwritten(action: string): string | null {
  if (action === "payment.refunded_by_processor") {
    return "The payment processor sent this payment back, so the deal froze itself. Nobody on either side wrote anything.";
  }
  if (action === "deal.disputed") return "No reason was given.";
  return null;
}

function when(date: Date) {
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Entry({ entry, raising }: { entry: RecordEntry; raising?: boolean }) {
  const side = SIDE[entry.side];
  const fallback = entry.note ? null : unwritten(entry.action);
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        raising ? "border-danger/35 bg-danger-soft" : "border-line bg-surface",
      )}
    >
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="font-semibold text-fg">
          {entry.actorName ?? "Channel Adda"}
        </span>
        <Badge variant={side.variant}>{side.label}</Badge>
        <span className="text-muted">{auditLabel(entry.action)}</span>
        <time
          dateTime={entry.at.toISOString()}
          className="tnum text-subtle"
          suppressHydrationWarning
        >
          {when(entry.at)}
        </time>
      </p>
      {entry.note ? (
        <blockquote className="mt-2 border-l-2 border-line-strong pl-3 text-sm leading-relaxed break-words whitespace-pre-line text-fg">
          {entry.note}
        </blockquote>
      ) : fallback ? (
        <p className="mt-1.5 text-xs leading-relaxed text-muted">{fallback}</p>
      ) : null}
    </div>
  );
}

function Heading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3
      id={id}
      className="font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-subtle uppercase"
    >
      {children}
    </h3>
  );
}

/** A fact that wraps on a phone instead of pushing the page sideways. */
function Line({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 border-b border-line py-2 last:border-b-0 sm:grid-cols-[8.5rem_1fr] sm:gap-3">
      <dt className="text-xs text-subtle">{term}</dt>
      <dd className="min-w-0 text-sm break-words text-fg">{children}</dd>
    </div>
  );
}

export function DisputeCase({
  dispute,
  canMoveMoney,
}: {
  dispute: Case;
  /** FINANCE or SUPERADMIN: the two outcomes that pay somebody out. */
  canMoveMoney: boolean;
}) {
  const headingId = `dispute-${dispute.orderId}`;
  const facts = custodyFacts(dispute.mode, dispute.status, {
    paid: dispute.paid,
    inCustody: dispute.inCustody,
  });
  const decideBy = new Date(
    dispute.waitingSince.getTime() + DECISION_HOURS * 60 * 60 * 1000,
  );
  const overdue = decideBy.getTime() < Date.now();
  const done = dispute.steps.filter((s) => s.completedAt !== null).length;
  // Every outcome on a paid Fastest deal moves money we hold — cancelling
  // returns all of it — so the decision is finance's whichever way it goes.
  const financesCall = dispute.mode === "FASTEST" && dispute.paid;

  return (
    <article
      aria-labelledby={headingId}
      className={cn(
        "relative overflow-hidden rounded-card border bg-surface",
        overdue ? "border-danger/40" : "border-line",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-0 w-[3px]",
          overdue ? "bg-danger" : "bg-line-strong",
        )}
      />

      {/* ---- what it is ---- */}
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line p-4 pl-5">
        <div className="min-w-0 flex-1">
          <h2
            id={headingId}
            className="font-display text-base leading-snug font-bold break-words text-fg"
          >
            {dispute.listing.title || dispute.listing.handle}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <DealModeBadge mode={dispute.mode} />
            <OrderStatusBadge status={dispute.status} />
            <Waited
              since={dispute.waitingSince}
              prefix="frozen"
              warnAfter={FIRST_RESPONSE_HOURS}
              lateAfter={DECISION_HOURS}
            />
          </div>
          <p
            className={cn(
              "mt-1.5 text-xs",
              overdue ? "font-semibold text-danger" : "text-subtle",
            )}
          >
            {overdue ? "Past the seven-day promise — was due " : "Decide by "}
            <time dateTime={decideBy.toISOString()} suppressHydrationWarning>
              {when(decideBy)}
            </time>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="tnum text-[0.6875rem] text-subtle">
            {dispute.reference}
          </span>
          <Amount
            cents={dispute.priceUsd}
            caption={
              dispute.mode === "SAFEST" ? "price, paid off-platform" : "price"
            }
          />
        </div>
      </header>

      <div className="grid gap-5 p-4 pl-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        {/* ---- what each side said ---- */}
        <section aria-labelledby={`${headingId}-record`} className="min-w-0">
          <Heading id={`${headingId}-record`}>The record</Heading>
          <ol className="mt-2.5 flex flex-col gap-2.5">
            <li>
              {dispute.raised ? (
                <Entry entry={dispute.raised} raising />
              ) : (
                <p className="flex items-start gap-2 rounded-xl border border-danger/35 bg-danger-soft p-3 text-sm text-fg">
                  <TriangleAlertIcon
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-danger"
                  />
                  The audit trail has no record of who froze this deal or why.
                  Read the conversation and ask both sides before deciding.
                </p>
              )}
            </li>
            {dispute.since.map((entry) => (
              <li key={entry.id}>
                <Entry entry={entry} />
              </li>
            ))}
          </ol>
          {dispute.raised && dispute.since.length === 0 ? (
            <p className="mt-2.5 text-xs text-subtle">
              Nothing has been added since it was raised.
            </p>
          ) : null}
          <AddDisputeNote orderId={dispute.orderId} />

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
            {dispute.conversation ? (
              <Link
                href={`/admin/messages/${dispute.conversation.id}`}
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary-text underline-offset-4 hover:underline"
              >
                <MessagesSquareIcon aria-hidden="true" className="size-4" />
                Read their conversation
                <span className="tnum font-normal text-subtle">
                  ({dispute.conversation.messages.toLocaleString("en-US")}{" "}
                  {dispute.conversation.messages === 1 ? "message" : "messages"}
                  )
                </span>
                {dispute.conversation.flagged ? (
                  <Badge variant="danger">
                    <FlagIcon aria-hidden="true" />
                    flagged
                  </Badge>
                ) : null}
              </Link>
            ) : (
              <p className="inline-flex min-h-11 items-center text-sm text-subtle">
                No conversation is linked to this deal.
              </p>
            )}
            <Link
              href={`/dashboard/deals/${dispute.orderId}`}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm text-primary-text underline-offset-4 hover:underline"
            >
              Open the deal
              <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
            </Link>
            <Link
              href={`/admin/listings/${dispute.listing.id}`}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm text-primary-text underline-offset-4 hover:underline"
            >
              The listing
            </Link>
          </div>
        </section>

        {/* ---- where things stand ---- */}
        <div className="flex min-w-0 flex-col gap-5">
          <section aria-labelledby={`${headingId}-position`}>
            <Heading id={`${headingId}-position`}>Where things stand</Heading>
            <dl className="mt-1.5">
              <Line term="Channel">{facts.asset}</Line>
              <Line term="Money">{facts.money}</Line>
              <Line term="On our books">
                <Amount cents={dispute.heldUsd} size="sm" />{" "}
                <span className="text-xs text-subtle">
                  held by us on this deal, from the ledger
                </span>
              </Line>
              <Line term="Recoverable">
                <span className="font-medium">{facts.recoverable}</span>
              </Line>
              {!dispute.paid && dispute.lapsesAt ? (
                <Line term="Unpaid">
                  Nothing cleared to us. If it is still unpaid at{" "}
                  <time
                    dateTime={dispute.lapsesAt.toISOString()}
                    suppressHydrationWarning
                  >
                    {when(dispute.lapsesAt)}
                  </time>
                  , the payment-window sweep lapses it and frees the listing.
                </Line>
              ) : null}
            </dl>
          </section>

          <section aria-labelledby={`${headingId}-steps`}>
            <Heading id={`${headingId}-steps`}>
              How far it got · {done} of {dispute.steps.length} steps
            </Heading>
            <ol className="mt-2 flex flex-col gap-1.5">
              {dispute.steps.map((step) => (
                <li key={step.position} className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                      step.completedAt
                        ? "border-verified/40 bg-verified-soft text-verified"
                        : "border-line-strong",
                    )}
                  >
                    {step.completedAt ? (
                      <CheckIcon aria-hidden="true" className="size-2.5" />
                    ) : null}
                  </span>
                  <span className="min-w-0 text-xs leading-relaxed">
                    <span
                      className={step.completedAt ? "text-fg" : "text-subtle"}
                    >
                      {step.position}. {step.label}
                    </span>
                    <span className="text-subtle"> · {step.actor}</span>
                    <span className="sr-only">
                      {step.completedAt ? ", done" : ", not done"}
                    </span>
                    {step.completedAt ? (
                      <time
                        dateTime={step.completedAt.toISOString()}
                        className="tnum block text-subtle"
                        suppressHydrationWarning
                      >
                        {when(step.completedAt)}
                      </time>
                    ) : null}
                    {step.proofUrl ? (
                      <a
                        href={step.proofUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-8 items-center gap-1 text-primary-text underline-offset-4 hover:underline"
                      >
                        <PaperclipIcon aria-hidden="true" className="size-3" />
                        Proof attached
                        <span className="sr-only">
                          {" "}
                          to step {step.position}
                        </span>
                      </a>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
            {dispute.mode === "SAFEST" && dispute.buyerPaymentRef ? (
              <p className="mt-2 text-xs leading-relaxed text-muted">
                The buyer recorded paying the seller with reference{" "}
                <code className="rounded bg-surface-2 px-1 py-0.5 font-mono break-all text-fg select-all">
                  {dispute.buyerPaymentRef}
                </code>
                {dispute.sellerConfirmedAt
                  ? ". The seller confirmed it arrived."
                  : ". The seller has not confirmed it arrived."}
              </p>
            ) : null}
          </section>

          <section aria-labelledby={`${headingId}-people`}>
            <Heading id={`${headingId}-people`}>Who to talk to</Heading>
            <dl className="mt-1.5">
              <Line term="Buyer">
                <Link
                  href={`/admin/users/${dispute.buyer.id}`}
                  className="font-medium text-primary-text underline-offset-4 hover:underline"
                >
                  {dispute.buyer.name}
                </Link>
                <span className="block truncate text-xs text-subtle">
                  {dispute.buyer.email}
                </span>
              </Line>
              <Line term="Seller">
                <Link
                  href={`/admin/users/${dispute.seller.id}`}
                  className="font-medium text-primary-text underline-offset-4 hover:underline"
                >
                  {dispute.seller.name}
                </Link>
                <span className="block truncate text-xs text-subtle">
                  {dispute.seller.email}
                </span>
              </Line>
              <Line term="Seller’s WhatsApp">
                <WhatsAppContact
                  number={dispute.seller.whatsapp}
                  name={dispute.seller.name}
                />
                <span className="block text-xs text-subtle">
                  Staff only. Never give it to the buyer.
                </span>
              </Line>
              <Line term="Agent">
                {dispute.agent ? (
                  <>
                    {dispute.agent.name}
                    <span className="block truncate text-xs text-subtle">
                      {dispute.agent.email}
                    </span>
                  </>
                ) : (
                  <span className="text-subtle">Nobody holds this deal</span>
                )}
              </Line>
            </dl>
          </section>
        </div>
      </div>

      {/* ---- the decision ---- */}
      <section
        aria-labelledby={`${headingId}-decide`}
        className="border-t border-line bg-surface-2/60 p-4 pl-5"
      >
        <Heading id={`${headingId}-decide`}>Decide it</Heading>
        <p className="mt-1.5 max-w-[72ch] text-xs leading-relaxed text-muted">
          {dispute.mode === "SAFEST"
            ? "Safest: we never held the price, so there is none to refund. If the agent holds the channel it goes back to the seller or on to the buyer."
            : "Fastest: we hold the money, so deciding it either way moves money — the buyer back, or the seller paid."}{" "}
          Your note below is the decision’s reason in the audit trail.
        </p>
        {financesCall && !canMoveMoney ? (
          <p className="mt-2 flex max-w-[72ch] items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft p-3 text-xs leading-relaxed text-fg">
            <TriangleAlertIcon
              aria-hidden="true"
              className="mt-px size-4 shrink-0 text-danger"
            />
            <span>
              Leave this decision to finance. Cancelling here would also return
              everything we hold to the buyer — the same money as a refund — so
              add what you know to the record and hand it over.
            </span>
          </p>
        ) : null}
        <EndDeal
          orderId={dispute.orderId}
          mode={dispute.mode}
          status={dispute.status}
          canMoveMoney={canMoveMoney}
          paid={dispute.paid}
          inCustody={dispute.inCustody}
        />
      </section>
    </article>
  );
}
