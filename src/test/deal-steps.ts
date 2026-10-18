import { db } from "@/lib/db";
import { templateFor } from "@/lib/deal-templates";
import {
  advanceStep,
  type DealOutcome,
  recordPricePayment,
} from "@/server/deals";

/**
 * Runs one step of a deal the way the product does.
 *
 * A step completed by a payment — the Safest price — is the buyer paying
 * Channel Adda, which the system records; nobody can press it done. Every
 * other step is its actor pressing the button. Tests that walk a deal through
 * its template use this so they do not each re-learn which step is which.
 */
export async function runStep(input: {
  orderId: string;
  position: number;
  userId: string;
  proofUrl?: string;
}): Promise<DealOutcome> {
  const order = await db.order.findUniqueOrThrow({
    where: { id: input.orderId },
    select: { mode: true },
  });
  const step = templateFor(order.mode).find(
    (s) => s.position === input.position,
  );
  if (step?.byPayment) {
    const outcome = await recordPricePayment(
      input.orderId,
      `price-${input.orderId}`,
      "USDT",
    );
    return outcome === "applied"
      ? { ok: true }
      : { ok: false, reason: "wrong-step" };
  }
  return advanceStep(input);
}
