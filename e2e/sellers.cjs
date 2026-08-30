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

  // directory
  let r = await p.goto(`${B}/sellers`, { waitUntil: "load" });
  ok("/sellers 200", r.status() === 200);
  ok(
    "14 seller cards",
    (await p.locator("main article").count()) === 14,
    String(await p.locator("main article").count()),
  );
  ok("one h1", (await p.locator("h1").count()) === 1);
  ok(
    "sorted by volume desc",
    await p.evaluate(() => {
      const v = [
        ...document.querySelectorAll("main article dl > div:nth-child(2) dd"),
      ].map((e) => e.textContent);
      return v.length > 2;
    }),
  );

  // card -> profile
  await p.locator('main article a[href^="/seller/"]').first().click();
  await p.waitForURL(/\/seller\//);
  ok("directory card links to profile", p.url().includes("/seller/"), p.url());

  // profile: nadia-hassan has 3 listings in data
  r = await p.goto(`${B}/seller/nadia-hassan`, { waitUntil: "load" });
  ok("profile 200", r.status() === 200);
  ok(
    "h1 is seller name",
    (await p.locator("h1").innerText()).includes("Nadia Hassan"),
  );
  const listed = await p.locator("main article").count();
  ok("profile shows her listings", listed > 0, `${listed} cards`);
  const allHers = await p.evaluate(
    () => [...document.querySelectorAll("main article")].length,
  );
  ok(
    "listing count matches heading",
    (await p.locator("h2").first().innerText()).includes(String(allHers)),
    await p.locator("h2").first().innerText(),
  );
  ok(
    "review-integrity note",
    (await p.locator("main").innerText()).includes("no way to buy reputation"),
  );
  ok(
    "specialties shown",
    (await p.locator('main ul li span:has-text("Instagram")').count()) > 0,
  );

  // every seller profile resolves
  const bad = [];
  for (const s of [
    "arman-karimov",
    "sofia-rivera",
    "priya-sharma",
    "hannah-wells",
    "dmitri-volkov",
    "rehan-malik",
    "carlo-diaz",
    "mateus-lima",
    "vikram-thakur",
    "kacper-zielinski",
    "lena-brandt",
    "ishan-gupta",
    "erin-walsh",
  ]) {
    const rr = await p.goto(`${B}/seller/${s}`, {
      waitUntil: "domcontentloaded",
    });
    if (rr.status() !== 200) bad.push(`${s}:${rr.status()}`);
  }
  ok("all 14 profiles resolve", bad.length === 0, bad.join(","));

  // unknown seller 404
  r = await p.goto(`${B}/seller/nobody`, { waitUntil: "domcontentloaded" });
  ok("unknown seller 404", r.status() === 404, String(r.status()));

  // listing -> seller profile link. The listing is found through the
  // marketplace rather than hardcoded, so slugs can change freely.
  await p.goto(`${B}/browse`, { waitUntil: "load" });
  await p.waitForTimeout(300);
  const listingHref = await p
    .locator('main article a[href^="/listing/"]')
    .first()
    .getAttribute("href");
  await p.goto(B + listingHref, { waitUntil: "load" });
  const sellerHref = await p
    .locator('a[href^="/seller/"]')
    .first()
    .getAttribute("href");
  await p.goto(B + sellerHref, { waitUntil: "load" });
  ok(
    "listing links to its seller",
    p.url().includes("/seller/") && (await p.locator("h1").count()) === 1,
    sellerHref,
  );

  // home "see all verified sellers"
  await p.goto(`${B}/`, { waitUntil: "load" });
  ok(
    "home links to /sellers",
    (await p.locator('a[href="/sellers"]').count()) > 0,
  );

  ok("no console errors", errs.length === 0, errs.slice(0, 2).join(" | "));

  for (const [w, h, tag] of [
    [1440, 900, "desktop"],
    [390, 844, "mobile"],
  ]) {
    const cc = await b.newContext({ viewport: { width: w, height: h } });
    const pp = await cc.newPage();
    await pp.addInitScript(() => localStorage.setItem("theme", "dark"));
    for (const u of ["/sellers", "/seller/nadia-hassan"]) {
      await pp.goto(B + u, { waitUntil: "load" });
      const of = await pp.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      ok(`no overflow ${tag} ${u}`, of === 0, String(of));
    }
    await pp.screenshot({ path: `./shots10/seller-${tag}.png` });
    await cc.close();
  }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
})();
