import { advanceStep, type DealOutcome } from "@/server/deals";
import { passHold } from "@/test/db";

/**
 * Runs one step of a deal the way the product does: its actor pressing it,
 * once the deal's hold has run out.
 *
 * Every step after the opening payment is a person's — the Safest price
 * goes from the buyer to the seller directly — and the one hold on a deal
 * (Google's wait on Safest, the holding period on Fastest) is days long.
 * Tests that walk a deal through its template use this so they neither
 * re-learn which step is which nor wait a week; the hold itself is pinned
 * by tests that call `advanceStep` directly.
 */
export async function runStep(input: {
  orderId: string;
  position: number;
  userId: string;
  proofUrl?: string;
  approvedById?: string;
}): Promise<DealOutcome> {
  await passHold(input.orderId);
  return advanceStep(input);
}
