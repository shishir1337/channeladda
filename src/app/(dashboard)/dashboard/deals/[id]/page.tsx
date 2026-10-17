import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  MailIcon,
  MessagesSquareIcon,
  ShieldCheckIcon,
  UsersIcon,
  ZapIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  moneyNote,
  STATUS_LABELS,
  STATUS_TONE,
  statusSentence,
} from "@/components/deals/deal-status";
import {
  DealNextStep,
  DealSteps,
  RaiseDispute,
} from "@/components/deals/deal-timeline";
import { PayNow } from "@/components/deals/pay-now";
import { PayToCard } from "@/components/deals/pay-to";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/ui/price";
import { db } from "@/lib/db";
import { isTerminal } from "@/lib/deal-machine";
import { cn } from "@/lib/utils";
import { getDealFor } from "@/server/deals";
import { requireUser } from "@/server/session";
import { getWallet } from "@/server/wallet";

export const metadata: Metadata = {
  title: "Deal",
  robots: { index: false, follow: false },
};

/**
 * One deal, end to end.
 *
 * The most important screen in the product: somebody with a five-figure sum in
 * the air opens it to find out four things, and should not have to read to get
 * them — what stage this is at, what they have to do right now, what the other
 * side is waiting on, and where the money is. So the page is ordered by those
 * questions rather than by what the database knows: stage, then the single
 * action, then the money, then the record of every step.
 */
export default async function DealPage({
  params,
}: PageProps<"/dashboard/deals/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/dashboard/deals/${id}`);
  const deal = await getDealFor(user.id, id);

  // `getDealFor` returns null both for a deal that does not exist and for one
  // this person is not part of, so guessing ids tells you nothing either way.
  if (!deal) notFound();

  const safest = deal.mode === "SAFEST";
  const viewer = deal.viewerRole;
  const terminal = isTerminal(deal.status);

  // Only the agent is ever asked to name a second approver, and only on the
  // step that hands the channel over. Nobody else needs the staff list, and
  // buyers and sellers must not be shown it.
  const needsApprover = viewer === "agent" && deal.nextStep?.actor === "agent";
  const staffIds = needsApprover
    ? await db.user.findMany({
        where: {
          role: { in: ["MODERATOR", "FINANCE", "SUPERADMIN"] },
          bannedAt: null,
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : undefined;

  // The buyer's opening payment is the action at this point, so it replaces
  // the next-step card rather than sitting beside it.
  const payingNow = deal.status === "AWAITING_PAYMENT" && viewer === "buyer";
  const wallet = payingNow ? await getWallet(user.id) : null;

  const total = deal.steps.length;
  const doneCount = deal.steps.filter((s) => s.completedAt !== null).length;
  const position = deal.nextStep?.position ?? total;
  const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const ModeIcon = safest ? ShieldCheckIcon : ZapIcon;

  return (
    <>
      <Link
        href="/dashboard/deals"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted transition-colors duration-200 hover:text-fg"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        All deals
      </Link>

      {/* ---- what this is ------------------------------------------------- */}
      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <Badge variant={safest ? "verified" : "primary"} size="md">
          <ModeIcon aria-hidden="true" />
          {safest ? "Safest deal" : "Fastest deal"}
        </Badge>
        <span className="tnum text-xs text-subtle">
          Reference {deal.reference}
        </span>
      </div>

      <h1 className="mt-3 font-display text-2xl leading-tight font-black tracking-tight text-fg sm:text-3xl">
        {deal.listingTitle}
      </h1>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-5">
        {/* Where the people on this deal talk, and where it can be run from. */}
        {deal.conversationId ? (
          <Link
            href={`/dashboard/messages/${deal.conversationId}`}
            className="inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-primary-text underline-offset-4 hover:underline"
          >
            <MessagesSquareIcon aria-hidden="true" className="size-3.5" />
            Open the deal chat
          </Link>
        ) : null}
        <Link
          href={`/listing/${deal.listingSlug}`}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-primary-text underline-offset-4 hover:underline"
        >
          View the listing
          <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
        </Link>
      </div>

      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-8">
        {/* ---- stage, action, money --------------------------------------- */}
        <div className="flex flex-col gap-5">
          <section
            aria-labelledby="stage-heading"
            className="rounded-panel border border-line bg-surface p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <h2 id="stage-heading" className="sr-only">
                Where this deal is
              </h2>
              {/* `whitespace-normal`: a badge never wraps by default, and
                  these labels are sentences — on a phone the longest one would
                  otherwise run off the side of the card. */}
              <Badge
                variant={STATUS_TONE[deal.status]}
                size="md"
                className="max-w-full whitespace-normal"
              >
                {STATUS_LABELS[deal.status]}
              </Badge>
              {total > 0 && !terminal ? (
                <p className="tnum text-xs text-subtle">
                  Step {position} of {total}
                </p>
              ) : null}
            </div>

            {total > 0 ? (
              <div
                role="progressbar"
                aria-valuenow={doneCount}
                aria-valuemin={0}
                aria-valuemax={total}
                aria-label={`${doneCount} of ${total} steps complete`}
                className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
              >
                <span
                  aria-hidden="true"
                  className={
                    deal.status === "COMPLETED"
                      ? "block h-full rounded-full bg-verified"
                      : terminal
                        ? "block h-full rounded-full bg-line-strong"
                        : "block h-full rounded-full bg-primary"
                  }
                  style={{ width: `${percent}%` }}
                />
              </div>
            ) : null}

            <p className="mt-4 max-w-[62ch] text-[0.9375rem] leading-relaxed text-muted">
              {statusSentence(deal.status, deal.mode, viewer)}
            </p>
          </section>

          {payingNow && wallet ? (
            <PayNow
              orderId={deal.id}
              totalUsd={deal.totalUsd}
              priceUsd={deal.priceUsd}
              mode={deal.mode}
              availableUsd={wallet.availableUsd}
            />
          ) : (
            <DealNextStep deal={deal} staffIds={staffIds} />
          )}

          {/* Safest only: where the buyer pays the seller directly. */}
          <PayToCard deal={deal} />

          {/*
            The seller has to invite a specific Google account as channel owner,
            so that address is the one piece of contact detail this product
            shows on purpose — it is Channel Adda's, not the other party's, and
            the transfer cannot happen without it.
          */}
          {deal.agentEmail && viewer !== "buyer" ? (
            <section
              aria-labelledby="invite-heading"
              className="rounded-panel border border-line bg-surface p-5 sm:p-6"
            >
              <h2
                id="invite-heading"
                className="flex items-center gap-2 font-display text-base font-bold text-fg"
              >
                <MailIcon aria-hidden="true" className="size-4 shrink-0" />
                Invite this account as {safest ? "owner" : "manager"}
              </h2>
              <p className="mt-3 rounded-card border border-line bg-surface-2 px-3.5 py-3 font-mono text-sm break-all text-fg select-all">
                {deal.agentEmail}
              </p>
              {deal.agentBrand ? (
                <p className="mt-2.5 max-w-[62ch] text-sm leading-relaxed text-muted">
                  It will show up as{" "}
                  <strong className="text-fg">{deal.agentBrand}</strong>. If the
                  name does not match, stop and contact support — nobody else
                  should be asking for owner access to your channel.
                </p>
              ) : null}
            </section>
          ) : null}

          {/* ---- the money ----------------------------------------------- */}
          <section
            aria-labelledby="money-heading"
            className="rounded-panel border border-line bg-surface p-5 sm:p-6"
          >
            <h2
              id="money-heading"
              className="font-display text-base font-bold text-fg"
            >
              The money, and where it is
            </h2>

            <dl
              className={cn(
                "mt-4 grid gap-4 sm:gap-5",
                terminal ? "sm:grid-cols-2" : "sm:grid-cols-3",
              )}
            >
              <div className="sm:border-r sm:border-line sm:pr-5">
                <dt className="font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-subtle uppercase">
                  Channel price
                </dt>
                <dd className="mt-1.5 font-display text-xl font-black text-fg">
                  <Price usd={deal.priceUsd / 100} />
                </dd>
                <dd className="mt-1 text-xs leading-relaxed text-subtle">
                  {safest
                    ? viewer === "seller"
                      ? "paid to you directly by the buyer"
                      : "paid directly to the seller, not through us"
                    : "part of what Channel Adda is holding"}
                </dd>
              </div>

              <div
                className={cn(
                  !terminal && "sm:border-r sm:border-line sm:pr-5",
                )}
              >
                <dt className="font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-subtle uppercase">
                  Our fee
                </dt>
                <dd className="mt-1.5 font-display text-xl font-black text-fg">
                  <Price usd={deal.buyerFeeUsd / 100} />
                </dd>
                <dd className="mt-1 text-xs leading-relaxed text-subtle">
                  {viewer === "buyer"
                    ? "paid by you, up front"
                    : "paid by the buyer, up front"}
                </dd>
              </div>

              {/* Only while the deal is live: once it has ended, nothing is
                  being held and a present-tense claim here would be false. */}
              {terminal ? null : (
                <div>
                  <dt className="font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-subtle uppercase">
                    {safest ? "Channel Adda holds" : "Channel Adda is holding"}
                  </dt>
                  <dd className="mt-1.5 font-display text-xl font-black text-fg">
                    {safest ? (
                      "The channel"
                    ) : (
                      <Price usd={deal.totalUsd / 100} />
                    )}
                  </dd>
                  <dd className="mt-1 text-xs leading-relaxed text-subtle">
                    {safest
                      ? "our agent owns it until the handover completes"
                      : "the price and our fee together"}
                  </dd>
                </div>
              )}
            </dl>

            {terminal ? null : (
              <p className="mt-4 max-w-[62ch] border-t border-line pt-4 text-sm leading-relaxed text-muted">
                {moneyNote(deal.mode, viewer)}
              </p>
            )}
          </section>

          {/* ---- who is on it -------------------------------------------- */}
          <section
            aria-labelledby="people-heading"
            className="rounded-panel border border-line bg-surface p-5 sm:p-6"
          >
            <h2
              id="people-heading"
              className="flex items-center gap-2 font-display text-base font-bold text-fg"
            >
              <UsersIcon aria-hidden="true" className="size-4 shrink-0" />
              Who is on this deal
            </h2>
            <dl className="mt-4 flex flex-col gap-3">
              <Party
                label="Buyer"
                name={deal.buyerName}
                you={viewer === "buyer"}
                note={
                  safest
                    ? "pays our fee up front, then the seller directly"
                    : "pays the price and our fee to Channel Adda"
                }
              />
              <Party
                label="Seller"
                name={deal.sellerName}
                you={viewer === "seller"}
                note={
                  safest
                    ? "hands the channel to our agent, is paid by the buyer"
                    : "transfers the channel, is paid by Channel Adda"
                }
              />
              <Party
                label="Channel Adda agent"
                name={deal.agentName ?? "Not assigned yet"}
                you={viewer === "agent"}
                note={
                  safest
                    ? "takes ownership of the channel, then passes it on"
                    : "supervises the transfer as a manager"
                }
                muted={deal.agentName === null}
              />
            </dl>
          </section>
        </div>

        {/* ---- the record ------------------------------------------------- */}
        {/* Not sticky: nine steps plus the dispute panel can be taller than a
            laptop viewport, and a stuck column that tall hides its own end. */}
        <div className="mt-5 flex flex-col gap-5 lg:mt-0">
          <div className="rounded-panel border border-line bg-surface p-5 sm:p-6">
            <DealSteps deal={deal} />
          </div>
          {deal.nextStep ? <RaiseDispute deal={deal} /> : null}
        </div>
      </div>
    </>
  );
}

/** One side of the deal, with the reader's own row marked. */
function Party({
  label,
  name,
  note,
  you,
  muted,
}: {
  label: string;
  name: string;
  note: string;
  you: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
      <dt className="w-full font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-subtle uppercase sm:w-auto sm:min-w-[8.5rem]">
        {label}
      </dt>
      <dd className="min-w-0 flex-1">
        <span
          className={
            muted ? "text-sm text-subtle" : "text-sm font-semibold text-fg"
          }
        >
          {name}
        </span>
        {you ? (
          <span className="ml-1.5 text-xs font-medium text-primary-text">
            (you)
          </span>
        ) : null}
        <span className="mt-0.5 block text-xs leading-relaxed text-subtle">
          {note}
        </span>
      </dd>
    </div>
  );
}
