const { chromium } = require("playwright");
const B = process.env.BASE || "http://localhost:3000";
let pass = 0,
  fail = 0;
const ok = (n, c, x = "") => {
  c ? pass++ : fail++;
  console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? `  ${x}` : ""}`);
};
const PAGES = [
  "/how-it-works",
  "/trust-safety",
  "/fees",
  "/about",
  "/support",
  "/help",
  "/affiliates",
];
const ARTICLES = [
  "how-escrow-protects-your-money",
  "what-you-pay-and-when",
  "confirming-a-handover",
  "listing-an-account",
  "verifying-ownership-with-a-code",
  "getting-paid",
  "opening-a-dispute",
  "why-revenue-does-not-transfer",
  "verification-and-kyc",
  "keeping-your-account-secure",
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

  const titles = new Set();
  for (const u of PAGES) {
    const r = await p.goto(B + u, { waitUntil: "load" });
    const h1 = await p.locator("h1").count();
    ok(`${u}`, r.status() === 200 && h1 === 1, `${r.status()} h1=${h1}`);
    titles.add(await p.title());
  }
  ok("unique titles", titles.size === PAGES.length, String(titles.size));

  // fees maths: 42500 -> buyer 1275/43775, seller 2125/40375, DB 3400
  await p.goto(`${B}/fees`, { waitUntil: "load" });
  const t = await p.locator("main table").innerText();
  ok(
    "fees table maths",
    ["1,275", "43,775", "2,125", "40,375", "3,400"].every((v) => t.includes(v)),
    t.split("\n")[2] || "",
  );

  // how-it-works hold table sorted 3->21
  await p.goto(`${B}/how-it-works`, { waitUntil: "load" });
  const holds = await p
    .locator("main table tbody tr td:last-child")
    .allInnerTexts();
  const nums = holds.map((h) => parseInt(h, 10));
  ok(
    "holds ascending",
    nums.every((v, i) => i === 0 || nums[i - 1] <= v),
    nums.join(","),
  );

  // help articles
  const bad = [];
  for (const s of ARTICLES) {
    const r = await p.goto(`${B}/help/${s}`, { waitUntil: "domcontentloaded" });
    if (r.status() !== 200) bad.push(s);
  }
  ok("all 10 help articles 200", bad.length === 0, bad.join(","));
  const r404 = await p.goto(`${B}/help/nope`, {
    waitUntil: "domcontentloaded",
  });
  ok("unknown article 404", r404.status() === 404, String(r404.status()));

  // help index lists everything
  await p.goto(`${B}/help`, { waitUntil: "load" });
  ok(
    "help index lists 10",
    (await p.locator('main a[href^="/help/"]').count()) === 10,
    String(await p.locator('main a[href^="/help/"]').count()),
  );

  // support form validation
  await p.goto(`${B}/support`, { waitUntil: "load" });
  await p.locator("form button[type=submit]").click();
  await p.waitForTimeout(400);
  ok(
    "form shows errors",
    (await p.locator("[role=alert]").count()) >= 2,
    String(await p.locator("[role=alert]").count()),
  );
  await p.fill("input[name=email]", "buyer@example.com");
  await p.fill(
    "textarea[name=message]",
    "My seller has gone quiet halfway through a YouTube transfer and I need help.",
  );
  await p.locator("form button[type=submit]").click();
  await p.waitForTimeout(500);
  ok(
    "form success state",
    await p.locator('h2:has-text("Message sent")').isVisible(),
  );

  ok("no console errors", errs.length === 0, errs.slice(0, 2).join(" | "));

  for (const [w, h, tag] of [
    [1440, 900, "desktop"],
    [390, 844, "mobile"],
  ]) {
    const cc = await b.newContext({ viewport: { width: w, height: h } });
    const pp = await cc.newPage();
    await pp.addInitScript(() => localStorage.setItem("theme", "dark"));
    let of = 0,
      worst = "";
    for (const u of [...PAGES, "/help/opening-a-dispute"]) {
      await pp.goto(B + u, { waitUntil: "load" });
      const v = await pp.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      if (v > of) {
        of = v;
        worst = u;
      }
    }
    ok(`no overflow ${tag}`, of === 0, of ? `${worst}=${of}` : "");
    await cc.close();
  }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
})();
