const { chromium } = require("playwright");
const B = process.env.BASE || "http://localhost:3000";
let pass = 0,
  fail = 0;
const ok = (n, c, x = "") => {
  c ? pass++ : fail++;
  console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? `  ${x}` : ""}`);
};
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  // next-themes injects a pre-paint theme <script>. React 19 warns whenever
  // that subtree re-renders on the client, which the 404 route does. The
  // script has already run during SSR, so this one string is noise. Nothing
  // else is tolerated.
  const KNOWN = /status of 404|Encountered a script tag while rendering/;
  p.on("console", (m) => {
    if (m.type() === "error" && !KNOWN.test(m.text())) errs.push(m.text());
  });
  await p.addInitScript(() => localStorage.setItem("theme", "dark"));

  // find a real monetized YouTube listing via the marketplace itself
  await p.goto(`${B}/browse/youtube?monetized=true&sort=price-desc`, {
    waitUntil: "load",
  });
  await p.waitForTimeout(400);
  const href = await p
    .locator('main article a[href^="/listing/"]')
    .first()
    .getAttribute("href");
  ok(
    "slug URL is readable",
    /^\/listing\/[a-z0-9-]+$/.test(href) && !/[A-Z]/.test(href),
    href,
  );

  const r = await p.goto(B + href, { waitUntil: "load" });
  await p.waitForTimeout(300);
  ok("listing 200", r.status() === 200);
  ok("exactly one h1", (await p.locator("h1").count()) === 1);
  ok(
    "has a price",
    (await p.locator("aside").innerText()).match(/[\d,]{3,}/) !== null,
  );

  // fee arithmetic straight off the page
  const rail = await p.locator("aside").innerText();
  const nums = [...rail.matchAll(/\$([\d,]+)/g)].map((m) =>
    Number(m[1].replace(/,/g, "")),
  );
  const price = nums[0],
    fee = nums[2],
    total = nums[3];
  ok(
    "buyer fee is 3%",
    Math.abs(fee - Math.round(price * 0.03)) <= 1,
    `${price} -> ${fee}`,
  );
  ok("total = price + fee", total === price + fee, `${price}+${fee}=${total}`);

  ok(
    "monetization warning",
    await p.locator('h2:has-text("Revenue does not transfer")').isVisible(),
  );
  ok("transfer steps 5", (await p.locator("#transfer ol li").count()) === 5);
  ok("proof images 3", (await p.locator("#proof figure img").count()) === 3);
  ok(
    "similar listings 3",
    (await p
      .locator('section:has-text("Similar accounts") article')
      .count()) === 3,
  );
  const bad = await p.evaluate(
    () =>
      [...document.images].filter((i) => !(i.complete && i.naturalWidth > 0))
        .length,
  );
  ok("all images load", bad === 0, String(bad));

  // seller link resolves
  const sellerHref = await p
    .locator('a[href^="/seller/"]')
    .first()
    .getAttribute("href");
  const sr = await p.goto(B + sellerHref, { waitUntil: "load" });
  ok("seller page from listing", sr.status() === 200, sellerHref);

  // unknown slug 404
  const nf = await p.goto(`${B}/listing/does-not-exist`, { waitUntil: "load" });
  ok("unknown listing 404", nf.status() === 404, String(nf.status()));

  // sold listings are not browsable
  await p.goto(`${B}/browse`, { waitUntil: "load" });
  await p.waitForTimeout(300);
  ok(
    "browse shows only live",
    (
      await p.locator('main p[aria-live="polite"]').first().innerText()
    ).includes("48"),
  );

  ok("no console errors", errs.length === 0, errs.slice(0, 2).join(" | "));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
})();
