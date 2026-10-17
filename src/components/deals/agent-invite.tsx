import { MailIcon } from "lucide-react";
import type { DealView } from "@/server/deals";

/**
 * The Google account the seller invites, and the name it will show up as.
 *
 * The seller has to invite a specific Google account as channel owner (or
 * manager, on Fastest), so that address is the one piece of contact detail
 * this product shows on purpose — it is Channel Adda's, not the other
 * party's, and the transfer cannot happen without it. Never to the buyer.
 * Shared by the deal page and the conversation, so the seller who is told
 * "the address to invite is on this page" finds it on either.
 */
export function AgentInvite({ deal }: { deal: DealView }) {
  if (!deal.agentEmail || deal.viewerRole === "buyer") return null;

  return (
    <section
      aria-labelledby="invite-heading"
      className="rounded-panel border border-line bg-surface p-5 sm:p-6"
    >
      <h2
        id="invite-heading"
        className="flex items-center gap-2 font-display text-base font-bold text-fg"
      >
        <MailIcon aria-hidden="true" className="size-4 shrink-0" />
        Invite this account as {deal.mode === "SAFEST" ? "owner" : "manager"}
      </h2>
      <p className="mt-3 rounded-card border border-line bg-surface-2 px-3.5 py-3 font-mono text-sm break-all text-fg select-all">
        {deal.agentEmail}
      </p>
      {deal.agentBrand ? (
        <p className="mt-2.5 max-w-[62ch] text-sm leading-relaxed text-muted">
          It will show up as{" "}
          <strong className="text-fg">{deal.agentBrand}</strong>. If the name
          does not match, stop and contact support — nobody else should be
          asking for owner access to your channel.
        </p>
      ) : null}
    </section>
  );
}
