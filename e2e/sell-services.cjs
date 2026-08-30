const { chromium } = require("playwright");
const B = process.env.BASE || "http://localhost:3000";
let pass = 0,
  fail = 0;
const ok = (n, c, x = "") => {
  c ? pass++ : fail++;
  console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? `  ${x}` : ""}`);
};
const SLUGS = [
  "channel-promotion",
  "ai-video-production",
  "silver-code-request",
  "subscribers-watch-time",
  "strike-appeal-support",
  "transfer-assistance",
];
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

  // /sell
  let r = await p.goto(`${B}/sell`, { waitUntil: "load" });
  ok("/sell 200", r.status() === 200);
  ok("/sell one h1", (await p.locator("h1").count()) === 1);
  // worked example: 42500 - 5% (2125) = 40375
  const t = await p.locator("main").innerText();
  ok("seller fee 2,125", t.includes("2,125"));
  ok("payout 40,375", t.includes("40,375"));
  ok(
    "5 platform tiles",
    (await p.locator('main a[href^="/browse/"]').count()) >= 5,
  );

  // /services
  r = await p.goto(`${B}/services`, { waitUntil: "load" });
  ok("/services 200", r.status() === 200);
  ok(
    "6 service cards",
    (await p.locator('main a[href^="/services/"]').count()) === 6,
    String(await p.locator('main a[href^="/services/"]').count()),
  );

  // every detail page
  const bad = [];
  const titles = new Set();
  for (const s of SLUGS) {
    const rr = await p.goto(`${B}/services/${s}`, {
      waitUntil: "domcontentloaded",
    });
    if (rr.status() !== 200) bad.push(`${s}:${rr.status()}`);
    titles.add(await p.title());
  }
  ok("all 6 service pages 200", bad.length === 0, bad.join(","));
  ok("unique titles", titles.size === 6, String(titles.size));

  // the two risky services carry a caution
  await p.goto(`${B}/services/subscribers-watch-time`, { waitUntil: "load" });
  ok(
    "watch-time caution present",
    await p.locator('h2:has-text("Read this before you order")').isVisible(),
  );
  ok(
    "caution names the risk",
    (await p.locator("main").innerText()).includes("breaches YouTube"),
  );
  await p.goto(`${B}/services/channel-promotion`, { waitUntil: "load" });
  ok(
    "no caution where none needed",
    (await p.locator('h2:has-text("Read this before you order")').count()) ===
      0,
  );

  // transfer assistance is free
  await p.goto(`${B}/services/transfer-assistance`, { waitUntil: "load" });
  ok(
    "free service shows Free",
    (await p.locator("aside").innerText()).includes("Free"),
  );

  // unknown service 404
  r = await p.goto(`${B}/services/nope`, { waitUntil: "domcontentloaded" });
  ok("unknown service 404", r.status() === 404, String(r.status()));

  // header/nav wiring
  await p.goto(`${B}/`, { waitUntil: "load" });
  ok(
    "header Sell links to /sell",
    (await p.locator('header a[href="/sell"]').count()) > 0,
  );
  ok(
    "header Services links to /services",
    (await p.locator('header a[href="/services"]').count()) > 0,
  );
  ok(
    "home services strip links out",
    (await p.locator('a[href^="/services/"]').count()) === 6,
  );

  ok("no console errors", errs.length === 0, errs.slice(0, 2).join(" | "));

  for (const [w, h, tag] of [
    [1440, 900, "desktop"],
    [390, 844, "mobile"],
  ]) {
    const cc = await b.newContext({ viewport: { width: w, height: h } });
    const pp = await cc.newPage();
    await pp.addInitScript(() => localStorage.setItem("theme", "dark"));
    for (const u of [
      "/sell",
      "/services",
      "/services/subscribers-watch-time",
    ]) {
      await pp.goto(B + u, { waitUntil: "load" });
      const of = await pp.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      ok(`no overflow ${tag} ${u}`, of === 0, String(of));
    }
    await cc.close();
  }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
})();
