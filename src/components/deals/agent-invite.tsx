import { MailIcon } from "lucide-react";
import { Callout, Card } from "@/components/app/kit";
import type { DealView } from "@/server/deals";

/**
 * The Google account the seller adds, and the name it will show up as.
 *
 * On a Safest deal the seller adds a specific Google account of ours as
 * manager and then makes it primary owner, so that address is the one piece
 * of contact detail this product shows on purpose — it is Channel Adda's,
 * not the other party's, and the transfer cannot happen without it. Never to
 * the buyer. A Fastest seller adds the buyer instead, so has no use for it.
 * Shared by the deal page and the conversation, so the seller who is told
 * "the address to add is on this page" finds it on either.
 */
export function AgentInvite({ deal }: { deal: DealView }) {
  if (!deal.agentEmail || deal.viewerRole === "buyer") return null;
  if (deal.mode !== "SAFEST") return null;
  // Only while our agent is being given the channel: added at step 2, made
  // primary owner at step 4, confirmed at step 5. After that — and on a
  // finished deal, where it used to sit with its "stop if the name does not
  // match" warning — it is noise.
  if (!deal.nextStep || deal.nextStep.position > 5) return null;
  const primary = deal.nextStep.position >= 4;

  return (
    <Card>
      <section aria-labelledby="invite-heading">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
          <MailIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-subtle"
          />
          <h2
            id="invite-heading"
            className="min-w-0 text-sm leading-6 font-semibold text-fg"
          >
            {primary
              ? "Make this account primary owner"
              : "Add this account as manager"}
          </h2>
        </div>
        <div className="flex flex-col gap-3 p-4 sm:p-5">
          <p className="rounded-lg border border-line bg-surface-2/60 px-3 py-2.5 font-mono text-[0.8125rem] leading-relaxed break-all text-fg select-all">
            {deal.agentEmail}
          </p>
          {deal.agentBrand ? (
            <Callout
              tone="warning"
              title={
                <>
                  It will show up as{" "}
                  <strong className="font-semibold">{deal.agentBrand}</strong>.
                </>
              }
            >
              If the name does not match, stop and contact support — nobody else
              should be asking for access to your channel.
            </Callout>
          ) : null}
        </div>
      </section>
    </Card>
  );
}
