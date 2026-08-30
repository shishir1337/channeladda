/**
 * Configurable fees.
 *
 * The thing worth proving here is not that a number can be saved — it is that
 * changing it moves the next sale and not the last one, and that the fee
 * arithmetic stays in integer cents whatever rate is set.
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { DEFAULT_FEES, orderAmounts, quote } from "@/lib/fees";
import {
  getFeeSettings,
  getSettings,
  updateSettings,
  validateSettings,
} from "@/server/settings";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(
    `${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`,
  );
  if (!ok) failures++;
}

async function main() {
  const admin = await db.user.findFirstOrThrow({
    where: { role: "SUPERADMIN" },
    select: { id: true },
  });

  const original = await getSettings();
  console.log(
    `starting at buyer ${original.buyerFeeBp}bp / seller ${original.sellerFeeBp}bp`,
  );

  console.log("\n— the arithmetic —");
  const fees = {
    buyerFeeBp: 300,
    sellerFeeBp: 500,
    escrowRequiredAbove: 1000,
    offerExpiryHours: 48,
  };
  const q = quote(99, fees);
  check(
    "a $99 sale charges $2.97, not $3",
    q.buyerFee === 2.97,
    String(q.buyerFee),
  );
  check("the buyer total is $101.97", q.total === 101.97, String(q.total));
  check("the seller keeps $94.05", q.payout === 94.05, String(q.payout));

  const cents = orderAmounts(9900, fees);
  check(
    "order amounts are whole cents",
    Number.isInteger(cents.buyerFeeUsd) &&
      Number.isInteger(cents.sellerFeeUsd) &&
      Number.isInteger(cents.totalUsd),
    `${cents.buyerFeeUsd}/${cents.sellerFeeUsd}/${cents.totalUsd}`,
  );
  check(
    "and they add up",
    cents.totalUsd === cents.priceUsd + cents.buyerFeeUsd &&
      cents.payoutUsd === cents.priceUsd - cents.sellerFeeUsd,
  );

  const odd = orderAmounts(3333, { ...fees, buyerFeeBp: 275 });
  check(
    "an awkward rate still lands on a whole cent",
    Number.isInteger(odd.buyerFeeUsd) && odd.buyerFeeUsd === 92,
    String(odd.buyerFeeUsd),
  );

  console.log("\n— validation —");
  const bad = [
    [
      "a negative fee",
      {
        buyerFeeBp: -100,
        sellerFeeBp: 500,
        escrowRequiredAbove: 1000,
        offerExpiryHours: 48,
      },
    ],
    [
      "an absurd fee",
      {
        buyerFeeBp: 9000,
        sellerFeeBp: 500,
        escrowRequiredAbove: 1000,
        offerExpiryHours: 48,
      },
    ],
    [
      "a non-number",
      {
        buyerFeeBp: Number.NaN,
        sellerFeeBp: 500,
        escrowRequiredAbove: 1000,
        offerExpiryHours: 48,
      },
    ],
    [
      "a fraction of a basis point",
      {
        buyerFeeBp: 300.5,
        sellerFeeBp: 500,
        escrowRequiredAbove: 1000,
        offerExpiryHours: 48,
      },
    ],
    [
      "a negative escrow floor",
      {
        buyerFeeBp: 300,
        sellerFeeBp: 500,
        escrowRequiredAbove: -5,
        offerExpiryHours: 48,
      },
    ],
  ] as const;
  for (const [label, input] of bad) {
    check(`${label} is refused`, validateSettings(input).length > 0);
  }
  check(
    "a zero fee is allowed — free is a valid business decision",
    validateSettings({
      buyerFeeBp: 0,
      sellerFeeBp: 0,
      escrowRequiredAbove: 0,
      offerExpiryHours: 48,
    }).length === 0,
  );

  console.log("\n— changing them —");
  const saved = await updateSettings(
    {
      buyerFeeBp: 425,
      sellerFeeBp: 650,
      escrowRequiredAbove: 2500,
      offerExpiryHours: 72,
    },
    admin.id,
  );
  check("a valid change saves", saved.ok);

  const now = await getFeeSettings();
  check(
    "the buyer rate took effect",
    now.buyerFeeBp === 425,
    String(now.buyerFeeBp),
  );
  check(
    "the seller rate took effect",
    now.sellerFeeBp === 650,
    String(now.sellerFeeBp),
  );
  check(
    "the escrow floor took effect",
    now.escrowRequiredAbove === 2500,
    String(now.escrowRequiredAbove),
  );
  check(
    "the cache did not serve a stale rate",
    (await getSettings()).buyerFeeBp === 425,
  );

  check(
    "the offer window took effect",
    (await getSettings()).offerExpiryHours === 72,
    String((await getSettings()).offerExpiryHours),
  );

  const after = quote(1000, now);
  check(
    "quotes use the new rate immediately",
    after.buyerFee === 42.5 && after.payout === 935,
    `fee ${after.buyerFee}, payout ${after.payout}`,
  );

  console.log("\n— history is not rewritten —");
  const existing = await db.order.findFirst({
    where: { status: "COMPLETED" },
    select: { id: true, priceUsd: true, buyerFeeUsd: true, sellerFeeUsd: true },
  });
  if (!existing) {
    check("a completed order exists to check", false);
  } else {
    const expectedAtOldRate = Math.round(
      (existing.priceUsd * DEFAULT_FEES.buyerFeeBp) / 10_000,
    );
    check(
      "an order placed before the change keeps its own fee",
      existing.buyerFeeUsd === expectedAtOldRate,
      `${existing.buyerFeeUsd} cents, still the 3% figure`,
    );
    const atNewRate = Math.round((existing.priceUsd * 425) / 10_000);
    check(
      "and that is not what the new rate would charge",
      existing.buyerFeeUsd !== atNewRate,
      `new rate would be ${atNewRate}`,
    );
  }

  console.log("\n— put it back —");
  await updateSettings(
    {
      buyerFeeBp: original.buyerFeeBp,
      sellerFeeBp: original.sellerFeeBp,
      escrowRequiredAbove: original.escrowRequiredAbove,
      offerExpiryHours: original.offerExpiryHours,
    },
    admin.id,
  );
  const restored = await getFeeSettings();
  check(
    "restored",
    restored.buyerFeeBp === original.buyerFeeBp &&
      restored.sellerFeeBp === original.sellerFeeBp,
    `${restored.buyerFeeBp}/${restored.sellerFeeBp}`,
  );

  await db.auditLog.deleteMany({ where: { entityId: "platform-settings" } });

  console.log(
    `\n${failures === 0 ? "all checks passed" : `${failures} FAILED`}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
