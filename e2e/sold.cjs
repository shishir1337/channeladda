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
  const r = await p.goto(`${B}/sold`, { waitUntil: "load" });
  ok("/sold 200", r.status() === 200);
  ok("one h1", (await p.locator("h1").count()) === 1);
  ok(
    "24 rows",
    (await p.locator("main section ul li").count()) === 24,
    String(await p.locator("main section ul li").count()),
  );
  // The page buckets sales into Today / This week / Earlier. Asserting on
  // "Today" specifically only held while the seed was fresh -- six days later
  // there is nothing sold today and the test failed on the calendar rather
  // than on the page. What matters is that the rows are grouped at all.
  const headings = await p.locator("main h2").allInnerTexts();
  ok(
    "grouped",
    headings.some((t) => /Today|This week|Earlier/.test(t)),
    headings.join(" | "),
  );
  ok(
    "prices in green",
    (await p.locator("main .text-verified[data-currency]").count()) > 0,
  );
  // sorted newest-first: read the sold-ago label in each row's last cell
  const ages = await p.locator("main section ul li").evaluateAll((els) =>
    els.map((e) => {
      const cell = e.lastElementChild; // price + sold-ago block
      return cell ? cell.lastElementChild.textContent.trim() : "";
    }),
  );
  const toHours = (t) =>
    t.includes("min")
      ? parseInt(t, 10) / 60
      : t.includes("hr")
        ? parseInt(t, 10)
        : parseInt(t, 10) * 24;
  const hrs = ages.map(toHours);
  ok(
    "newest first",
    hrs.every((v, i) => i === 0 || hrs[i - 1] <= v),
    ages.slice(0, 3).join(" | "),
  );
  // homepage ticker links here
  await p.goto(`${B}/`, { waitUntil: "load" });
  ok("ticker links to /sold", (await p.locator('a[href="/sold"]').count()) > 0);
  ok("no console errors", errs.length === 0, errs.slice(0, 2).join(" | "));
  for (const [w, h, tag] of [
    [1440, 900, "desktop"],
    [390, 844, "mobile"],
  ]) {
    const cc = await b.newContext({ viewport: { width: w, height: h } });
    const pp = await cc.newPage();
    await pp.addInitScript(() => localStorage.setItem("theme", "dark"));
    await pp.goto(`${B}/sold`, { waitUntil: "load" });
    const of = await pp.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    ok(`no overflow ${tag}`, of === 0, String(of));
    await pp.screenshot({ path: `./shots11/sold-${tag}.png` });
    await cc.close();
  }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
})();
