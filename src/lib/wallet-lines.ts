/**
 * The second line under a movement in a member's wallet history.
 *
 * A ledger row's note is written for the books and for staff: it carried a
 * withdrawal's database id and whatever finance typed as its transaction
 * reference ("Withdrawal cmvgo… (test-local-run-…)"), and, for most kinds,
 * the same words as the title above it ("Reseller badge, 30 days" twice).
 * So the note is never shown as it is. The line says which deal the money
 * moved for, by the reference the member knows it by, and adds the few
 * notes that tell them something in plain words — and nothing else.
 */
export type WalletLineInput = {
  kind: string;
  note: string | null;
  deal: { reference: string; handle: string } | null;
};

export function walletDetail(entry: WalletLineInput): string | null {
  const parts = [
    entry.deal ? `Deal ${entry.deal.reference} · ${entry.deal.handle}` : null,
    plainNote(entry),
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" — ") : null;
}

/** The notes that mean something to the member, said for them. */
function plainNote({ kind, note }: WalletLineInput): string | null {
  const text = note?.trim();
  if (!text) return null;

  if (kind === "ADJUSTMENT") {
    // The reason staff give is written for the member to read: the form
    // says so, and the title's (i) points to it.
    return text;
  }

  if (kind === "DEPOSIT") {
    if (text.startsWith("Paid twice for this deal")) {
      return "You paid this deal twice, so the second payment came to your balance";
    }
    if (text.startsWith("Paid when this deal could no longer take it")) {
      return "Paid after the deal had closed, so it came to your balance";
    }
    if (text.startsWith("Refunded to you by the processor")) {
      return "The payment processor refunded this to you, so it left your balance";
    }
    const asset = /^Deposit in ([A-Z0-9]{2,10})$/.exec(text)?.[1];
    return asset ? `Paid in ${asset}` : null;
  }

  if (kind === "REFUND" && text === "Refunded by the processor") {
    return "Refunded by the payment processor";
  }

  return null;
}
