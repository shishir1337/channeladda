import "server-only";

import { db } from "@/lib/db";
import { isTerminal } from "@/lib/deal-machine";
import { BUYER_PAYS_AFTER_STEP, hasPayToLink, MAX_PAY_TO } from "@/lib/pay-to";
import { recordAudit } from "@/server/audit";
import { postEvent } from "@/server/chat-events";
import { notify } from "@/server/notifications";

export type PayToFailure =
  | "not-found"
  | "wrong-actor"
  | "not-safest"
  | "terminal"
  | "locked"
  | "empty"
  | "too-long"
  | "has-link";

/**
 * A Safest seller saying where the buyer should pay them.
 *
 * Changes are loud, because re-pointing a payment is what a hijacked seller
 * account does: every save leaves a line in the conversation (never the
 * details themselves — that line is shown in previews), an audit entry with
 * the old and new text, and, once the buyer can see the details, a
 * notification to the buyer, by email as well. Locked once the buyer has
 * recorded paying: after that it is evidence.
 */
export async function saveSellerPayTo(input: {
  orderId: string;
  userId: string;
  text: string;
}): Promise<{ ok: true } | { ok: false; reason: PayToFailure }> {
  const text = input.text.trim();
  if (!text) return { ok: false, reason: "empty" };
  if (text.length > MAX_PAY_TO) return { ok: false, reason: "too-long" };
  if (hasPayToLink(text)) return { ok: false, reason: "has-link" };

  const order = await db.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      mode: true,
      status: true,
      buyerId: true,
      sellerId: true,
      agentId: true,
      buyerPaidAt: true,
      sellerPayTo: true,
      conversationId: true,
      reference: true,
      seller: { select: { name: true } },
      steps: {
        where: { position: BUYER_PAYS_AFTER_STEP },
        select: { completedAt: true },
      },
    },
  });
  if (!order) return { ok: false, reason: "not-found" };
  if (order.sellerId !== input.userId) {
    // Somebody on the deal who is not its seller is told it is not theirs;
    // anyone else learns nothing about the deal existing.
    const party =
      input.userId === order.buyerId || input.userId === order.agentId;
    return { ok: false, reason: party ? "wrong-actor" : "not-found" };
  }
  if (order.mode !== "SAFEST") return { ok: false, reason: "not-safest" };
  if (isTerminal(order.status)) return { ok: false, reason: "terminal" };
  if (order.buyerPaidAt) return { ok: false, reason: "locked" };

  // Saving what is already there changes nothing, and is not worth a line.
  if (order.sellerPayTo === text) return { ok: true };

  const replacing = order.sellerPayTo !== null;
  const visibleToBuyer = order.steps[0]?.completedAt != null;
  const now = new Date();

  const saved = await db.$transaction(async (tx) => {
    // Compare-and-set on the lock: the buyer recording payment between the
    // read above and this write must win.
    const moved = await tx.order.updateMany({
      where: { id: order.id, buyerPaidAt: null },
      data: {
        sellerPayTo: text,
        sellerPayToAt: now,
        ...(replacing ? { sellerPayToChangedAt: now } : {}),
      },
    });
    if (moved.count !== 1) return false;
    if (order.conversationId) {
      await postEvent(tx, {
        conversationId: order.conversationId,
        kind: "EVENT",
        event: {
          type: "pay-to-saved",
          name: order.seller.name,
          changed: replacing,
        },
        senderId: input.userId,
        orderId: order.id,
        at: now,
      });
    }
    return true;
  });
  if (!saved) return { ok: false, reason: "locked" };

  await recordAudit({
    actorId: input.userId,
    action: "deal.pay_to_saved",
    entity: "order",
    entityId: order.id,
    before: { sellerPayTo: order.sellerPayTo },
    after: { sellerPayTo: text },
  });

  // Once it is the buyer's turn, any save is news to them: details that
  // changed are a warning, details that arrive are what they were waiting
  // for — they were told the seller had not said yet.
  if (visibleToBuyer) {
    const name = order.seller.name || "The seller";
    const title = replacing
      ? `${name} changed where to pay them`
      : `${name} added where to pay them`;
    const body = replacing
      ? `On ${order.reference}. Check the new details with them in the conversation before you send anything.`
      : `On ${order.reference}. The details are on the deal, ready for your payment.`;
    await notify({
      userId: order.buyerId,
      kind: "ORDER",
      title,
      body,
      href: order.conversationId
        ? `/dashboard/messages/${order.conversationId}`
        : `/dashboard/deals/${order.id}`,
      // By email too: the buyer is waiting on this, and a change is the one
      // thing here that can cost them money.
      email: { subject: title, body },
    });
  }

  return { ok: true };
}
