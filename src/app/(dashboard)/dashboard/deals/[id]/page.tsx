import { ArrowLeftIcon, MailIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DealTimeline } from "@/components/deals/deal-timeline";
import { Price } from "@/components/ui/price";
import { db } from "@/lib/db";
import { getDealFor } from "@/server/deals";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Deal",
  robots: { index: false, follow: false },
};

const STATUS_LABELS = {
  AWAITING_PAYMENT: "Waiting for your payment",
  AGENT_VERIFYING: "Our agent is checking the channel",
  AWAITING_CUSTODY: "Waiting for the seller to hand the channel over",
  IN_CUSTODY: "We are holding the channel",
  AWAITING_BUYER_PAYMENT: "Waiting for the buyer to pay the seller",
  AWAITING_HANDOVER: "Transfer under way",
  AWAITING_RELEASE: "Releasing the seller's funds",
  COMPLETED: "Completed",
  PAYMENT_EXPIRED: "Payment window closed",
  CANCELLED: "Cancelled",
  RETURNED_TO_SELLER: "Channel returned to the seller",
  REFUNDED: "Refunded",
  DISPUTED: "With Channel Adda",
} as const;

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

  // Only the agent is ever asked to name a second approver, and only on the
  // step that hands the channel over. Nobody else needs the staff list, and
  // buyers and sellers must not be shown it.
  const needsApprover =
    deal.viewerRole === "agent" && deal.nextStep?.actor === "agent";
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

  return (
    <>
      <Link
        href="/dashboard/deals"
        className="inline-flex min-h-9 items-center gap-1.5 text-sm text-muted transition-colors duration-200 hover:text-fg"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        All deals
      </Link>

      <p className="mt-5 text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
        {safest ? "Safest deal" : "Fastest deal"} · {deal.reference}
      </p>
      <h1 className="mt-2 font-display text-2xl font-black tracking-tight text-fg sm:text-3xl">
        {deal.listingTitle}
      </h1>
      <p className="mt-2 text-sm text-muted">{STATUS_LABELS[deal.status]}</p>

      <dl className="mt-6 grid gap-4 rounded-panel border border-line bg-surface p-5 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-subtle">Channel price</dt>
          <dd className="mt-1 text-sm font-semibold text-fg">
            <Price usd={deal.priceUsd / 100} />
          </dd>
          <dd className="mt-0.5 text-xs text-subtle">
            {safest ? "paid direct to the seller" : "held by Channel Adda"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-subtle">Our fee</dt>
          <dd className="mt-1 text-sm font-semibold text-fg">
            <Price usd={deal.buyerFeeUsd / 100} />
          </dd>
          <dd className="mt-0.5 text-xs text-subtle">paid up front</dd>
        </div>
        <div>
          <dt className="text-xs text-subtle">
            {deal.viewerRole === "buyer" ? "Seller" : "Buyer"}
          </dt>
          <dd className="mt-1 text-sm font-semibold text-fg">
            {deal.viewerRole === "buyer" ? deal.sellerName : deal.buyerName}
          </dd>
          <dd className="mt-0.5 text-xs text-subtle">
            {deal.agentName
              ? `Agent: ${deal.agentName}`
              : "No agent assigned yet"}
          </dd>
        </div>
      </dl>

      {/*
        The seller has to invite a specific Google account as channel owner, so
        that address is the one piece of contact detail this product shows on
        purpose — it is Channel Adda's, not the other party's, and the transfer
        cannot happen without it.
      */}
      {deal.agentEmail && deal.viewerRole !== "buyer" ? (
        <div className="mt-4 rounded-panel border border-primary/30 bg-primary-soft p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-fg">
            <MailIcon aria-hidden="true" className="size-4 shrink-0" />
            Invite this account as {safest ? "owner" : "manager"}
          </p>
          <p className="mt-2 font-mono text-sm break-all text-fg">
            {deal.agentEmail}
          </p>
          {deal.agentBrand ? (
            <p className="mt-1.5 text-xs text-muted">
              It will show up as <strong>{deal.agentBrand}</strong>. If the name
              does not match, stop and contact support — nobody else should be
              asking for owner access to your channel.
            </p>
          ) : null}
        </div>
      ) : null}

      <h2 className="mt-8 font-display text-lg font-bold text-fg">
        What happens, in order
      </h2>
      <DealTimeline deal={deal} staffIds={staffIds} />
    </>
  );
}
