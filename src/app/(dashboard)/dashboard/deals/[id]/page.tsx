import {
  BanknoteIcon,
  ExternalLinkIcon,
  MessagesSquareIcon,
  ShieldCheckIcon,
  UsersIcon,
  ZapIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { InfoTip } from "@/components/app/info-tip";
import {
  Callout,
  Card,
  CardHeader,
  MetaItem,
  PageHeader,
  Reference,
} from "@/components/app/kit";
import { AgentInvite } from "@/components/deals/agent-invite";
import { DealComplete } from "@/components/deals/deal-complete";
import {
  dealHeadline,
  STATUS_LABELS,
  STATUS_TONE,
} from "@/components/deals/deal-status";
import {
  CancelDeal,
  DealSteps,
  RaiseDispute,
} from "@/components/deals/deal-timeline";
import { HandoverAccount } from "@/components/deals/handover-account";
import { PayNow } from "@/components/deals/pay-now";
import { PayToCard } from "@/components/deals/pay-to";
import { ReviewPrompts } from "@/components/deals/review-prompts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { iconText } from "@/components/ui/icon-hue";
import { Price } from "@/components/ui/price";
import { db } from "@/lib/db";
import { isTerminal } from "@/lib/deal-machine";
import { templateFor } from "@/lib/deal-templates";
import { cn } from "@/lib/utils";
import { certificateFor } from "@/server/certificate";
import { getDealFor } from "@/server/deals";
import { reviewPromptFor } from "@/server/reviews";
import { requireUser } from "@/server/session";
import { getSettings } from "@/server/settings";
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
 * questions rather than by what the database knows: the stage in a sentence,
 * then every step with the single action inside the one in play, and beside
 * them where to pay, the money, and who is on it.
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
  // Fastest pays the seller when our agent becomes primary owner, before the
  // deal ends: from then on the money is theirs and only the channel is held.
  const sellerPaid = !safest && deal.custodyAt !== null;
  const disputed = deal.status === "DISPUTED";
  // By whose step is open as well as by status: one status can cover the
  // seller's step and then the agent's, and the headline has to move on
  // the moment the first is done.
  const headline = dealHeadline(
    deal.status,
    deal.mode,
    viewer,
    deal.nextStep?.position ?? null,
    deal.platform,
    deal.awaitingAgent,
  );
  const sentence = headline.sentence;

  // Only the agent is ever asked to name a second approver, and only on the
  // step that hands value across. Nobody else needs the staff list, and
  // buyers and sellers must not be shown it.
  const needsApprover =
    viewer === "agent" &&
    deal.nextStep?.actor === "agent" &&
    Boolean(
      templateFor(deal.mode).find(
        (step) => step.position === deal.nextStep?.position,
      )?.needsApprovalAbove,
    );
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

  // The opening payment, when the buyer owes it, is the action at this
  // point, so it takes the place of the step's own action rather than
  // sitting beside it. It is the only payment Channel Adda takes.
  const paying = viewer === "buyer" && deal.status === "AWAITING_PAYMENT";
  const yourMove = paying || deal.nextStep?.actor === viewer;
  const wallet = paying ? await getWallet(user.id) : null;

  const ModeIcon = safest ? ShieldCheckIcon : ZapIcon;
  // Only a deal that went through has one; null otherwise.
  const certificate =
    deal.status === "COMPLETED" ? await certificateFor(deal.id) : null;
  const [reviewPrompt, settings] = certificate
    ? await Promise.all([reviewPromptFor(deal.id, user.id), getSettings()])
    : [null, null];

  return (
    <>
      <PageHeader
        back={{ href: "/dashboard/deals", label: "All deals" }}
        title={deal.listingTitle}
        meta={
          <>
            {/* `whitespace-normal`: a badge never wraps by default, and these
                labels are sentences — on a phone the longest one would
                otherwise run off the side of the screen. */}
            <Badge
              variant={STATUS_TONE[deal.status]}
              size="sm"
              className="max-w-full whitespace-normal app:h-auto app:min-h-5 app:py-0.5 app:leading-4"
            >
              {headline.label}
            </Badge>
            <span className="inline-flex items-center gap-1.5 font-medium text-muted">
              <ModeIcon
                aria-hidden="true"
                className={`size-3.5 ${iconText(ModeIcon)}`}
              />
              {safest ? "Safest deal" : "Fastest deal"}
            </span>
            <MetaItem label="Reference">
              <Reference>{deal.reference}</Reference>
            </MetaItem>
          </>
        }
        actions={
          // Where the people on this deal talk, and where it can be run from.
          <>
            {deal.conversationId ? (
              <Button asChild variant="secondary" size="md">
                <Link href={`/dashboard/messages/${deal.conversationId}`}>
                  <MessagesSquareIcon aria-hidden="true" />
                  Open the deal chat
                </Link>
              </Button>
            ) : null}
            {/* A sold listing's page is a 404: nothing to send them to. */}
            {deal.listingOnSale ? (
              <Button asChild variant="ghost" size="md">
                <Link href={`/listing/${deal.listingSlug}`}>
                  View the listing
                  <ExternalLinkIcon aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6">
        {/* ---- where it is, and every step ---------------------------- */}
        <div className="flex min-w-0 flex-col gap-4">
          {certificate ? (
            <DealComplete
              dealId={deal.id}
              reference={deal.reference}
              viewerRole={viewer}
              mode={deal.mode}
              completedAt={certificate.completedAt}
              code={
                viewer === "buyer" || viewer === "seller"
                  ? certificate.code
                  : null
              }
            />
          ) : null}
          {reviewPrompt ? (
            <ReviewPrompts
              prompt={reviewPrompt}
              googleReviewUrl={settings?.googleReviewUrl ?? null}
            />
          ) : null}
          {/* A paused deal says so above everything, in the one colour that
              means trouble; otherwise the stage is the first line of the
              card that holds the steps. */}
          {disputed ? (
            <section aria-labelledby="stage-heading">
              <h2 id="stage-heading" className="sr-only">
                Where this deal is
              </h2>
              <Callout tone="danger" title={STATUS_LABELS[deal.status]}>
                {sentence}
              </Callout>
            </section>
          ) : null}

          <Card>
            {/* When it is the reader's move, the step card below says what
                to do, so this line would only say it first. It stays for
                the times they are waiting on somebody else. */}
            {disputed || yourMove ? null : (
              <section
                aria-labelledby="stage-heading"
                className="border-b border-line p-4 sm:p-5"
              >
                <h2 id="stage-heading" className="sr-only">
                  Where this deal is
                </h2>
                <p className="max-w-[66ch] text-sm leading-relaxed text-fg">
                  {sentence}
                </p>
              </section>
            )}
            <DealSteps
              deal={deal}
              staffIds={staffIds}
              payment={
                paying && wallet ? (
                  <PayNow
                    orderId={deal.id}
                    amountUsd={deal.totalUsd}
                    priceUsd={deal.priceUsd}
                    mode={deal.mode}
                    availableUsd={wallet.availableUsd}
                    inline
                  />
                ) : undefined
              }
            />
          </Card>
        </div>

        {/* ---- what it needs, the money, the people ------------------- */}
        {/* Not sticky: the invite, the money, the people and the dispute
            form together can be taller than a laptop viewport, and a stuck
            column that tall hides its own end. */}
        <div className="mt-4 flex min-w-0 flex-col gap-4 lg:mt-0">
          {/* The account the seller invites. Never shown to the buyer. */}
          <AgentInvite deal={deal} />
          {/* Safest only: where the buyer pays the seller directly. */}
          <PayToCard deal={deal} />
          {/* The buyer's account that receives ownership, for whoever
              transfers to it. */}
          <HandoverAccount
            dealId={deal.id}
            viewerRole={deal.viewerRole}
            mode={deal.mode}
            platform={deal.platform}
            handoverTo={deal.handoverTo}
            open={deal.handoverOpen}
            inUse={deal.handoverInUse}
          />

          {/* ---- the money --------------------------------------------- */}
          <Card>
            <section aria-labelledby="money-heading">
              <CardHeader
                as="h2"
                id="money-heading"
                icon={BanknoteIcon}
                title="The money, and where it is"
              />
              <dl className="px-4 sm:px-5">
                <Line
                  label="Channel price"
                  value={<Price usd={deal.priceUsd / 100} />}
                  money
                  note={
                    safest
                      ? deal.sellerConfirmedAt
                        ? "paid to the seller directly, and confirmed by them"
                        : deal.buyerPaidAt
                          ? "paid to the seller directly, the buyer says; the seller confirms it next"
                          : "paid to the seller directly, once our agent holds the channel"
                      : sellerPaid
                        ? viewer === "seller"
                          ? "paid into your Channel Adda wallet when our agent became primary owner"
                          : "paid to the seller when our agent became primary owner"
                        : "part of what Channel Adda is holding"
                  }
                />
                <Line
                  label="Our fee"
                  value={<Price usd={deal.buyerFeeUsd / 100} />}
                  money
                  note={
                    viewer === "buyer"
                      ? "paid by you, up front"
                      : "paid by the buyer, up front"
                  }
                />
                {/* Only while the deal is live: once it has ended, nothing is
                    being held and a present-tense claim here would be false. */}
                {terminal ? null : (
                  <Line
                    label={
                      safest || sellerPaid
                        ? "Channel Adda holds"
                        : "Channel Adda is holding"
                    }
                    value={
                      safest || sellerPaid ? (
                        "The channel"
                      ) : (
                        <Price usd={deal.totalUsd / 100} />
                      )
                    }
                    money
                    note={
                      safest || sellerPaid
                        ? "our agent holds it until it is handed to the buyer"
                        : "the price and our fee together"
                    }
                  />
                )}
              </dl>
            </section>
          </Card>

          {/* ---- who is on it ------------------------------------------ */}
          <Card>
            <section aria-labelledby="people-heading">
              <CardHeader
                as="h2"
                id="people-heading"
                icon={UsersIcon}
                title="Who is on this deal"
              />
              <dl className="px-4 sm:px-5">
                <Line
                  label="Buyer"
                  value={
                    <Party name={deal.buyerName} you={viewer === "buyer"} />
                  }
                  note={
                    safest
                      ? "pays our fee to Channel Adda, the price to the seller directly"
                      : "pays the price and our fee to Channel Adda"
                  }
                />
                <Line
                  label="Seller"
                  value={
                    <Party name={deal.sellerName} you={viewer === "seller"} />
                  }
                  note={
                    safest
                      ? "hands the channel to our agent, is paid by the buyer directly"
                      : "transfers the channel, is paid by Channel Adda"
                  }
                />
                <Line
                  label="Channel Adda agent"
                  value={
                    <Party
                      name={deal.agentName ?? "Not assigned yet"}
                      you={viewer === "agent"}
                      muted={deal.agentName === null}
                    />
                  }
                  note={
                    safest
                      ? "takes ownership of the channel, then passes it on"
                      : "supervises the handover, then releases the money"
                  }
                />
              </dl>
            </section>
          </Card>

          <CancelDeal deal={deal} />
          {deal.nextStep ? <RaiseDispute deal={deal} /> : null}
        </div>
      </div>
    </>
  );
}

/**
 * One fact: what it is and its value, with a line on what it means for the
 * reader behind the (i) beside the label. While the deal is live the card's
 * own sentence under the rows says where the money is in full, which is
 * what stops a Safest buyer reading the price as something Channel Adda is
 * holding; the notes add the detail line by line.
 */
function Line({
  label,
  value,
  note,
  money,
}: {
  label: string;
  value: ReactNode;
  note: string;
  money?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-3 last:border-b-0">
      <dt className="inline-flex shrink-0 items-center gap-1 text-[0.8125rem] text-muted">
        {label}
        <InfoTip label={`About ${label}`}>{note}</InfoTip>
      </dt>
      <dd
        className={cn(
          "min-w-0 text-right break-words text-fg tabular-nums",
          money ? "text-[0.9375rem] font-semibold" : "text-sm font-medium",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** A name on the deal, with the reader's own marked. */
function Party({
  name,
  you,
  muted,
}: {
  name: string;
  you: boolean;
  muted?: boolean;
}) {
  return (
    <>
      <span className={muted ? "font-normal text-subtle" : undefined}>
        {name}
      </span>
      {you ? (
        <span className="ml-1.5 text-xs font-normal text-muted">(you)</span>
      ) : null}
    </>
  );
}
