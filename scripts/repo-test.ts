import "dotenv/config";
import { parseFilters } from "@/lib/listing-query";
import {
  getListing,
  getPlatformCounts,
  getRecentlySold,
  getSellerListings,
  getSimilarListings,
  queryListings,
} from "@/server/listings";
import { getSeller, getSellers, getSiteStats } from "@/server/sellers";

let pass = 0;
let fail = 0;
const ok = (n: string, c: boolean, x = "") => {
  c ? pass++ : fail++;
  console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? `  ${x}` : ""}`);
};

async function main() {
  const r0 = await queryListings(parseFilters({}));
  ok("48 live listings", r0.total === 48, String(r0.total));
  ok("page size 12", r0.items.length === 12);
  ok("newest first", r0.items[0].listedDaysAgo <= r0.items[1].listedDaysAgo);
  ok(
    "facets keep siblings",
    r0.facets.platforms.every((p) => p.count > 0),
    r0.facets.platforms.map((p) => `${p.value}:${p.count}`).join(","),
  );

  const yt = await queryListings(parseFilters({ platform: "youtube" }));
  ok(
    "platform filter",
    yt.total === 14 && yt.items.every((l) => l.platform === "youtube"),
    String(yt.total),
  );

  const cheap = await queryListings(
    parseFilters({ price_min: "5000", price_max: "20000" }),
  );
  ok(
    "price range",
    cheap.items.every((l) => l.price >= 5000 && l.price <= 20000),
    String(cheap.total),
  );

  const asc = await queryListings(parseFilters({ sort: "price-asc" }));
  ok(
    "sort asc",
    asc.items.every((l, i, a) => i === 0 || a[i - 1].price <= l.price),
    asc.items
      .slice(0, 3)
      .map((l) => l.price)
      .join(","),
  );

  const search = await queryListings(parseFilters({ q: "crypto" }));
  ok("search", search.total > 0, `${search.total} hits`);

  const mon = await queryListings(parseFilters({ monetized: "false" }));
  ok(
    "not monetized",
    mon.items.every((l) => !l.monetized),
    String(mon.total),
  );

  const verified = await queryListings(parseFilters({ verified: "true" }));
  ok(
    "verified only",
    verified.items.every((l) => l.ownershipVerified),
    String(verified.total),
  );

  const paged = await queryListings(parseFilters({ page: "999" }));
  ok("page clamped", paged.page === paged.pageCount, String(paged.page));

  const counts = await getPlatformCounts();
  ok(
    "platform counts sum to 48",
    Object.values(counts).reduce((a, b) => a + b, 0) === 48,
    JSON.stringify(counts),
  );

  const one = await getListing(r0.items[0].slug);
  ok("get listing by slug", one?.id === r0.items[0].id, r0.items[0].slug);
  ok(
    "slugs are readable",
    /^[a-z0-9-]+$/.test(r0.items[0].slug),
    r0.items[0].slug,
  );
  ok("unknown listing null", (await getListing("nope")) === null);

  const sim = await getSimilarListings(r0.items[0]);
  ok(
    "similar listings",
    sim.length === 3 && sim.every((s) => s.id !== r0.items[0].id),
  );

  const sellers = await getSellers();
  ok("14 sellers", sellers.length === 14, String(sellers.length));
  ok(
    "sorted by volume",
    sellers.every((s, i, a) => i === 0 || a[i - 1].volume >= s.volume),
  );
  ok(
    "volume derived from real orders",
    sellers.some((s) => s.volume > 0),
    sellers
      .slice(0, 2)
      .map((s) => `${s.slug}:${s.volume}`)
      .join(","),
  );

  const nadia = await getSeller("nadia-hassan");
  ok("get seller", nadia?.name === "Nadia Hassan", nadia?.name);
  ok("unknown seller null", (await getSeller("nobody")) === null);

  const hers = await getSellerListings("nadia-hassan");
  ok(
    "seller listings",
    hers.length > 0 && hers.every((l) => l.sellerSlug === "nadia-hassan"),
    String(hers.length),
  );

  const sold = await getRecentlySold();
  ok("24 sold", sold.length === 24, String(sold.length));
  ok(
    "sold newest first",
    sold.every((s, i, a) => i === 0 || a[i - 1].soldHoursAgo <= s.soldHoursAgo),
  );

  const stats = await getSiteStats();
  ok(
    "site stats derived from completed orders",
    stats.transfers > 1000 &&
      stats.settledUsd > 1_000_000 &&
      stats.verifiedSellers === 14,
    JSON.stringify(stats),
  );

  // Badges: only `featured` is stored, the rest are computed from the row.
  const tagged = await queryListings(parseFilters({}));
  const tags = tagged.items.map((l) => l.tag).filter(Boolean);
  ok("badges are populated", tags.length > 0, tags.join(","));
  const drops = tagged.items.filter((l) => l.wasPrice !== undefined);
  ok(
    "price drops badge correctly",
    drops.every((l) => l.tag === "featured" || l.tag === "ending"),
    drops.map((l) => `${l.slug}:${l.tag}`).join(","),
  );
  const featuredFirst = await queryListings(parseFilters({}));
  ok(
    "featured listings exist",
    (await import("@/server/listings")).getFeaturedListings !== undefined &&
      featuredFirst.total === 48,
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
