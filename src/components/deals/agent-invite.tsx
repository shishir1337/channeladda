import { AtSignIcon, MailIcon, UserRoundIcon } from "lucide-react";
import { Callout, Card } from "@/components/app/kit";
import { wordsFor } from "@/components/deals/deal-status";
import { iconText } from "@/components/ui/icon-hue";
import { IDENTITY_FIELD, identityName } from "@/lib/transfer-identity";
import type { DealView } from "@/server/deals";

/**
 * The account the seller invites, and the name it will show up as.
 *
 * In both modes the seller invites a specific account of ours as owner and
 * then makes it primary owner, so that address is the one piece of contact
 * detail this product shows on purpose — it is Channel Adda's, not the other
 * party's, and the transfer cannot happen without it. Never to the buyer.
 * Shared by the deal page and the conversation, so the seller who is told
 * "the account to invite is on this page" finds it on either.
 */
export function AgentInvite({ deal }: { deal: DealView }) {
  if (!deal.agentEmail || deal.viewerRole === "buyer") return null;
  // Only while our agent is being given the channel: invited at step 2,
  // made primary owner at step 4, confirmed at step 5 — the same positions
  // in both modes. After that, and on a finished deal, it is noise.
  if (!deal.nextStep || deal.nextStep.position > 5) return null;
  const primary = deal.nextStep.position >= 4;
  const seller = deal.viewerRole === "seller";
  // What the seller does with it differs by platform: invite it as owner on
  // YouTube, add it to the Page on Facebook, make it an admin on Telegram.
  const words = wordsFor(deal.platform);
  const card = words.agentCard;
  // What the account is, in the platform's own terms: a Telegram username
  // is not an email, and was shown as one (QA, CA-87042).
  const field = IDENTITY_FIELD[deal.platform];
  const Icon =
    field === "telegram"
      ? AtSignIcon
      : field === "facebook"
        ? UserRoundIcon
        : MailIcon;

  return (
    <Card>
      <section aria-labelledby="invite-heading">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
          <Icon
            aria-hidden="true"
            className={`size-4 shrink-0 ${iconText(Icon)}`}
          />
          <h2
            id="invite-heading"
            className="min-w-0 text-sm leading-6 font-semibold text-fg"
          >
            {primary ? card.primary : card.invite}
          </h2>
        </div>
        <div className="flex flex-col gap-3 p-4 sm:p-5">
          <div>
            <p className="text-xs text-subtle first-letter:uppercase">
              Our agent's {identityName(deal.platform)}
            </p>
            <p className="mt-1 rounded-lg border border-line bg-surface-2/60 px-3 py-2.5 font-mono text-[0.8125rem] leading-relaxed break-all text-fg select-all">
              {deal.agentEmail}
            </p>
          </div>
          {deal.agentBrand && seller ? (
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
              should be asking for access to your {words.asset}.
            </Callout>
          ) : deal.agentBrand ? (
            // Our agent and staff check the same name; the warning is the
            // seller's, written to the person who owns the channel.
            <p className="text-xs leading-relaxed text-subtle">
              Shown to the seller as{" "}
              <span className="font-medium text-muted">{deal.agentBrand}</span>.
            </p>
          ) : null}
        </div>
      </section>
    </Card>
  );
}
