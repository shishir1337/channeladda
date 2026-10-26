import {
  ArrowUpRightIcon,
  CheckIcon,
  FlagIcon,
  MessagesSquareIcon,
  PaperclipIcon,
  StoreIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
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
import { InfoTip } from "@/components/app/info-tip";
import { Amount, Callout, Facts, Reference, Ring } from "@/components/app/kit";
import { staffWords, stepTitle } from "@/components/deals/deal-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { threadHref } from "@/lib/thread-href";
import { dayAndTime, type ViewerZone } from "@/lib/time";
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

/** The Terms: a first response within 24 hours, a decision within seven days. */
export const FIRST_RESPONSE_HOURS = 24;
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

/** "Page", for a heading: the asset's word with a capital. */
function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "26 Oct, 3:53 AM", in the reader's own zone. */
const when = dayAndTime;

/**
 * One stop on the record's rail: a dot, and a hairline down to the next.
 * The entry that froze the deal gets the red dot, so the start of the story
 * is findable at a glance.
 */
function RecordItem({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "danger";
  children: ReactNode;
}) {
  return (
    <li className="group/item relative pb-5 pl-6 last:pb-0">
      <span
        aria-hidden="true"
        className="absolute top-3 -bottom-3 left-1 w-px bg-line group-last/item:hidden"
      />
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1.5 left-0 size-[9px] rounded-full ring-4 ring-surface",
          tone === "danger" ? "bg-danger" : "bg-line-strong",
        )}
      />
      {children}
    </li>
  );
}

function Entry({
  entry,
  raising,
  zone,
}: {
  entry: RecordEntry;
  raising?: boolean;
  zone: ViewerZone;
}) {
  const side = SIDE[entry.side];
  const fallback = entry.note ? null : unwritten(entry.action);
  return (
    <>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] leading-5">
        <span className="font-medium text-fg">
          {entry.actorName ?? "Channel Adda"}
        </span>
        <Badge variant={side.variant}>{side.label}</Badge>
        <span className="text-muted">{auditLabel(entry.action)}</span>
        <time
          dateTime={entry.at.toISOString()}
          className="tnum text-xs text-subtle"
          suppressHydrationWarning
        >
          {when(entry.at, zone)}
        </time>
      </p>
      {entry.note ? (
        <blockquote
          className={cn(
            "mt-2 rounded-lg border px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-line text-fg",
            raising
              ? "border-danger/20 bg-danger-soft/50"
              : "border-line bg-surface-2/50",
          )}
        >
          {entry.note}
        </blockquote>
      ) : fallback ? (
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
          {fallback}
        </p>
      ) : null}
    </>
  );
}

/**
 * A part of the case. `info` puts the longer explanation behind an (i)
 * beside the heading — outside the h3, so the part's accessible name stays
 * just its title — and `leading` is a small visual ahead of it.
 */
function Heading({
  id,
  children,
  info,
  infoLabel,
  leading,
}: {
  id: string;
  children: ReactNode;
  info?: ReactNode;
  infoLabel?: string;
  leading?: ReactNode;
}) {
  const heading = (
    <h3 id={id} className="text-[0.8125rem] leading-5 font-semibold text-fg">
      {children}
    </h3>
  );
  if (!info && !leading) return heading;
  return (
    <div className="flex items-center gap-2">
      {leading}
      {heading}
      {info ? (
        <InfoTip label={infoLabel ?? "More about this"}>{info}</InfoTip>
      ) : null}
    </div>
  );
}

/** A fact that wraps on a phone instead of pushing the page sideways. */
function Line({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 border-b border-line py-2.5 last:border-b-0 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-[0.8125rem] leading-5 text-muted">{term}</dt>
      <dd className="min-w-0 text-[0.8125rem] leading-5 break-words text-fg">
        {children}
      </dd>
    </div>
  );
}

/** A person, by name, with the address staff will write to underneath. */
function Person({
  href,
  name,
  email,
}: {
  href?: string;
  name: string;
  email: string;
}) {
  return (
    <>
      {href ? (
        <Link
          href={href}
          className="font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:decoration-fg"
        >
          {name}
        </Link>
      ) : (
        <span className="font-medium text-fg">{name}</span>
      )}
      <span className="block truncate text-xs text-subtle">{email}</span>
    </>
  );
}

export function DisputeCase({
  dispute,
  canMoveMoney,
  zone,
}: {
  dispute: Case;
  /** FINANCE or SUPERADMIN: the two outcomes that pay somebody out. */
  canMoveMoney: boolean;
  /** The reader's time zone, for every time on the record. */
  zone: ViewerZone;
}) {
  const headingId = `dispute-${dispute.orderId}`;
  const facts = custodyFacts(
    dispute.mode,
    dispute.status,
    { paid: dispute.paid, inCustody: dispute.inCustody },
    dispute.platform,
  );
  const say = staffWords(dispute.platform, dispute.mode);
  const decideBy = new Date(
    dispute.waitingSince.getTime() + DECISION_HOURS * 60 * 60 * 1000,
  );
  const overdue = decideBy.getTime() < Date.now();
  const done = dispute.steps.filter((s) => s.completedAt !== null).length;
  // Every outcome on a paid deal moves money we hold — cancelling or
  // returning the channel hands it back, completing pays it out — so the
  // decision is finance's whichever way it goes, in both modes.
  const financesCall = dispute.paid;

  return (
    <article
      aria-labelledby={headingId}
      className={cn(
        "relative overflow-hidden rounded-card border bg-surface shadow-xs",
        overdue ? "border-danger/35" : "border-line",
      )}
    >
      {/* Only an overdue case is striped: a neutral stripe on every case
          would be decoration, and the stripe has to mean something. */}
      {overdue ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 z-[1] w-0.5 bg-danger"
        />
      ) : null}

      {/* ---- what it is ---- */}
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-line px-4 py-3.5 sm:px-5">
        <div className="min-w-0 flex-1">
          <h2
            id={headingId}
            className="text-[0.9375rem] leading-6 font-semibold break-words text-fg"
          >
            {dispute.listing.title || dispute.listing.handle}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Reference>{dispute.reference}</Reference>
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
              "mt-2 text-xs",
              overdue ? "font-medium text-danger" : "text-subtle",
            )}
          >
            {overdue ? "Past the seven-day promise — was due " : "Decide by "}
            <time
              dateTime={decideBy.toISOString()}
              className="tnum"
              suppressHydrationWarning
            >
              {when(decideBy, zone)}
            </time>
          </p>
        </div>
        <Amount
          cents={dispute.priceUsd}
          caption={
            dispute.mode === "SAFEST" && !dispute.buyerPaidAt
              ? "price, not paid yet"
              : "price"
          }
        />
      </header>

      <div className="grid gap-8 px-4 py-4 sm:px-5 sm:py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        {/* ---- what each side said ---- */}
        <section aria-labelledby={`${headingId}-record`} className="min-w-0">
          <Heading id={`${headingId}-record`}>The record</Heading>
          <ol className="mt-3">
            {dispute.raised ? (
              <RecordItem tone="danger">
                <Entry entry={dispute.raised} raising zone={zone} />
              </RecordItem>
            ) : (
              <RecordItem tone="danger">
                <p className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft/60 px-3 py-2.5 text-[0.8125rem] leading-relaxed text-fg">
                  <TriangleAlertIcon
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-danger"
                  />
                  The audit trail has no record of who froze this deal or why.
                  Read the conversation and ask both sides before deciding.
                </p>
              </RecordItem>
            )}
            {dispute.since.map((entry) => (
              <RecordItem key={entry.id}>
                <Entry entry={entry} zone={zone} />
              </RecordItem>
            ))}
          </ol>
          {dispute.raised && dispute.since.length === 0 ? (
            <p className="mt-3 pl-6 text-xs text-subtle">
              Nothing has been added since it was raised.
            </p>
          ) : null}
          <AddDisputeNote orderId={dispute.orderId} />

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            {dispute.conversation ? (
              // The count and the flag sit beside the button rather than in
              // it: a button does not wrap, and on a phone the card clipped
              // the flag — the one part of this line staff triage on. The
              // link still says both, for anyone hearing it.
              <>
                <Button asChild size="sm" variant="secondary">
                  <Link
                    href={threadHref(
                      dispute.conversation.id,
                      dispute.listing.id,
                      "/admin/messages",
                    )}
                  >
                    <MessagesSquareIcon aria-hidden="true" />
                    Read their conversation
                    <span className="sr-only">
                      {" "}
                      ({dispute.conversation.messages.toLocaleString("en-US")}{" "}
                      {dispute.conversation.messages === 1
                        ? "message"
                        : "messages"}
                      {dispute.conversation.flagged ? ", flagged" : ""})
                    </span>
                  </Link>
                </Button>
                <span
                  aria-hidden="true"
                  className="text-xs text-subtle tabular-nums"
                >
                  {dispute.conversation.messages.toLocaleString("en-US")}{" "}
                  {dispute.conversation.messages === 1 ? "message" : "messages"}
                </span>
                {dispute.conversation.flagged ? (
                  <Badge variant="danger" aria-hidden="true">
                    <FlagIcon />
                    flagged
                  </Badge>
                ) : null}
              </>
            ) : (
              <p className="mr-2 text-[0.8125rem] text-subtle">
                No conversation is linked to this deal.
              </p>
            )}
            <Button asChild size="sm" variant="secondary">
              <Link href={`/dashboard/deals/${dispute.orderId}`}>
                Open the deal
                <ArrowUpRightIcon aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href={`/admin/listings/${dispute.listing.id}`}>
                <StoreIcon aria-hidden="true" />
                The listing
              </Link>
            </Button>
          </div>
        </section>

        {/* ---- where things stand ---- */}
        <div className="flex min-w-0 flex-col gap-7">
          <section aria-labelledby={`${headingId}-position`}>
            <Heading id={`${headingId}-position`}>Where things stand</Heading>
            <Facts className="mt-1">
              <Line term={cap(say.asset)}>{facts.asset}</Line>
              <Line term="Money">{facts.money}</Line>
              <Line term="On our books">
                <span className="flex flex-wrap items-baseline gap-x-1.5">
                  <Amount
                    cents={dispute.heldUsd}
                    size="sm"
                    className="items-start"
                  />
                  <span className="text-xs text-subtle">
                    held by us on this deal, from the ledger
                  </span>
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
                    className="tnum"
                    suppressHydrationWarning
                  >
                    {when(dispute.lapsesAt, zone)}
                  </time>
                  , the payment-window sweep lapses it and frees the listing.
                </Line>
              ) : null}
            </Facts>
          </section>

          <section aria-labelledby={`${headingId}-steps`}>
            <Heading
              id={`${headingId}-steps`}
              // The heading already says the figure aloud; the ring is only
              // its picture, so a screen reader hears it once.
              leading={
                dispute.steps.length > 0 ? (
                  <span aria-hidden="true" className="inline-flex">
                    <Ring
                      value={done}
                      max={dispute.steps.length}
                      tone="verified"
                      size={18}
                      label={`${done} of ${dispute.steps.length} steps done`}
                    />
                  </span>
                ) : null
              }
            >
              How far it got{" "}
              <span className="font-normal text-subtle tabular-nums">
                · {done} of {dispute.steps.length} steps
              </span>
            </Heading>
            <ol className="mt-2.5 flex flex-col gap-2">
              {dispute.steps.map((step) => (
                <li key={step.position} className="flex items-start gap-2.5">
                  <span
                    className={cn(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                      step.completedAt
                        ? "border-verified/30 bg-verified-soft text-verified"
                        : "border-line-strong bg-surface",
                    )}
                  >
                    {step.completedAt ? (
                      <CheckIcon
                        aria-hidden="true"
                        className="size-2.5"
                        strokeWidth={3}
                      />
                    ) : null}
                  </span>
                  <span className="min-w-0 text-[0.8125rem] leading-5">
                    {/* In the platform's words, as the members read it:
                        a Facebook deal listed "Make the agent primary
                        owner" here (QA, CA-75190). */}
                    <span
                      className={step.completedAt ? "text-fg" : "text-subtle"}
                    >
                      {step.position}.{" "}
                      {stepTitle(
                        step.label,
                        "staff",
                        dispute.platform,
                        dispute.mode,
                      )}
                    </span>
                    <span className="sr-only">
                      {step.completedAt ? ", done" : ", not done"}
                    </span>
                    {step.completedAt ? (
                      <time
                        dateTime={step.completedAt.toISOString()}
                        className="tnum block text-xs text-subtle"
                        suppressHydrationWarning
                      >
                        {when(step.completedAt, zone)}
                      </time>
                    ) : null}
                    {step.proofUrl ? (
                      <a
                        href={step.proofUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-muted underline-offset-4 transition-colors hover:text-fg hover:underline pointer-fine:min-h-6"
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
            {dispute.mode === "SAFEST" && dispute.buyerPaidAt ? (
              <p className="mt-3 rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-xs leading-relaxed text-muted">
                The buyer pressed Paid on{" "}
                {when(new Date(dispute.buyerPaidAt), zone)}
                {dispute.sellerConfirmedAt
                  ? `, and the seller pressed Received on ${when(new Date(dispute.sellerConfirmedAt), zone)}. The ${say.asset} cannot go back to the seller: they have said they were paid.`
                  : ", and the seller has not pressed Received. The price went to the seller directly, never through us — the chat is where the proof is."}
              </p>
            ) : null}
          </section>

          <section aria-labelledby={`${headingId}-people`}>
            <Heading id={`${headingId}-people`}>Who to talk to</Heading>
            <Facts className="mt-1">
              <Line term="Buyer">
                <Person
                  href={`/admin/users/${dispute.buyer.id}`}
                  name={dispute.buyer.name}
                  email={dispute.buyer.email}
                />
              </Line>
              <Line term="Seller">
                <Person
                  href={`/admin/users/${dispute.seller.id}`}
                  name={dispute.seller.name}
                  email={dispute.seller.email}
                />
              </Line>
              <Line term="Seller’s WhatsApp">
                <WhatsAppContact
                  number={dispute.seller.whatsapp}
                  name={dispute.seller.name}
                />
                <span className="mt-1 block text-xs text-subtle">
                  Staff only. Never give it to the buyer.
                </span>
              </Line>
              <Line term="Agent">
                {dispute.agent ? (
                  <Person
                    name={dispute.agent.name}
                    email={dispute.agent.email}
                  />
                ) : (
                  <span className="text-subtle">Nobody holds this deal</span>
                )}
              </Line>
            </Facts>
          </section>
        </div>
      </div>

      {/* ---- the decision ---- */}
      <section
        aria-labelledby={`${headingId}-decide`}
        className="border-t border-line bg-surface-2/40 px-4 py-4 sm:px-5"
      >
        <Heading
          id={`${headingId}-decide`}
          info="Your note below is the decision’s reason in the audit trail."
          infoLabel="About deciding it"
        >
          Decide it
        </Heading>
        {/* Where the money goes is never behind the (i). */}
        <p className="mt-0.5 max-w-[72ch] text-xs leading-relaxed text-muted">
          {dispute.mode === "SAFEST"
            ? `Safest: we hold only the admin fee — the price went from the buyer to the seller directly. Returning the ${say.asset} gives it back to the seller (refused once they pressed Received); finishing the deal hands it to the buyer. The admin fee is kept once our agent has taken custody.`
            : `Fastest: until our agent has the ${say.asset} we hold the money, so deciding it either way moves money — the buyer back, or the seller paid. After that the seller has been paid, and the only outcome is finishing it.`}
        </p>
        {financesCall && !canMoveMoney ? (
          <Callout
            tone="danger"
            className="mt-3 max-w-[72ch]"
            title="Leave this decision to finance."
          >
            Every ending here hands back or pays out money we hold — the same
            money as a refund — so add what you know to the record and hand it
            over.
          </Callout>
        ) : null}
        <EndDeal
          orderId={dispute.orderId}
          mode={dispute.mode}
          status={dispute.status}
          platform={dispute.platform}
          canMoveMoney={canMoveMoney}
          paid={dispute.paid}
          inCustody={dispute.inCustody}
          pricePaid={dispute.buyerPaidAt !== null}
        />
      </section>
    </article>
  );
}
