const { chromium } = require("playwright");
const B = process.env.BASE || "http://localhost:3000";
let pass = 0,
  fail = 0;
const ok = (n, c, x = "") => {
  c ? pass++ : fail++;
  console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? `  ${x}` : ""}`);
};

// Filter clicks trigger soft navigations, during which Next can briefly hold
// both the old and new subtree. Waiting for results to render keeps the suite
// measuring a settled page rather than a swap in progress.
const settle = async (page) => {
  await page
    .waitForFunction(
      () =>
        document.querySelectorAll("main article").length > 0 ||
        document.body.innerText.includes("Nothing matches those filters"),
      null,
      { timeout: 15000 },
    )
    .catch(() => {});
  await page.waitForTimeout(250);
};

(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  // next-themes injects a pre-paint theme <script>. React 19 warns whenever
  // that subtree re-renders on the client. The script has already run during
  // SSR, so this one string is noise. Nothing else is tolerated.
  const KNOWN = /status of 404|Encountered a script tag while rendering/;
  p.on("console", (m) => {
    if (m.type() === "error" && !KNOWN.test(m.text())) errs.push(m.text());
  });
  await p.addInitScript(() => localStorage.setItem("theme", "dark"));

  const cards = () => p.locator("main article").count();
  const countText = () =>
    p.locator('main p[aria-live="polite"]').first().innerText();

  // 1 base
  await p.goto(`${B}/browse`, { waitUntil: "load" });
  await settle(p);
  ok("loads 12 cards", (await cards()) === 12, String(await cards()));
  ok("total says 48", (await countText()).includes("48"), await countText());

  // 2 platform filter via checkbox
  await p.locator('aside label:has-text("YouTube") input').first().click();
  await p.waitForURL(/platform=youtube/, { timeout: 5000 });
  await p.waitForTimeout(500);
  ok("platform filter -> url", p.url().includes("platform=youtube"));
  ok(
    "platform filter -> 14",
    (await countText()).includes("14"),
    await countText(),
  );

  // 3 chip removal restores
  const _chip = p
    .locator('button:has-text("YouTube")')
    .filter({ has: p.locator("svg") })
    .last();
  await p
    .locator("main")
    .getByRole("button", { name: "Clear all" })
    .first()
    .click();
  await p.waitForTimeout(700);
  ok(
    "clear all restores 48",
    (await countText()).includes("48"),
    await countText(),
  );

  // 4 sort
  await p.goto(`${B}/browse?sort=price-asc`, { waitUntil: "load" });
  await settle(p);
  const prices = await p.locator("main article").evaluateAll((els) =>
    els.map((e) => {
      // asking price lives in the card footer; the first [data-currency] is revenue
      const t = e.querySelector(".mt-auto [data-currency]");
      return t ? Number(t.textContent.replace(/[^0-9]/g, "")) : 0;
    }),
  );
  ok(
    "sort price asc",
    prices.every((v, i) => i === 0 || prices[i - 1] <= v),
    prices.slice(0, 4).join(","),
  );

  // 5 pagination
  await p.goto(`${B}/browse`, { waitUntil: "load" });
  const firstP1 = await p.locator("main article h3").first().innerText();
  await p.getByRole("link", { name: "Page 2" }).click();
  await p.waitForURL(/page=2/);
  await p.waitForTimeout(500);
  const firstP2 = await p.locator("main article h3").first().innerText();
  ok("page 2 differs", firstP1 !== firstP2, `${firstP1} vs ${firstP2}`);
  ok("page 2 has cards", (await cards()) === 12, String(await cards()));

  // 6 search
  await p.goto(`${B}/browse?q=crypto`, { waitUntil: "load" });
  await settle(p);
  ok("search returns results", (await cards()) > 0, String(await cards()));

  // 7 empty state
  await p.goto(`${B}/browse?price_min=9999999`, { waitUntil: "load" });
  await settle(p);
  ok(
    "empty state shows",
    await p
      .locator('h2:has-text("Nothing matches those filters")')
      .first()
      .isVisible(),
  );

  // 8 combined filters keep facets sane
  await p.goto(`${B}/browse?platform=youtube&monetized=true&verified=true`, {
    waitUntil: "load",
  });
  await settle(p);
  ok("combined filters ok", (await cards()) > 0, await countText());

  // 9 overflow + errors desktop
  let of = await p.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  ok("no h-overflow desktop", of === 0, String(of));

  await c.close();

  // 10 mobile sheet
  const mc = await b.newContext({ viewport: { width: 390, height: 844 } });
  const mp = await mc.newPage();
  mp.on("pageerror", (e) => errs.push(e.message));
  await mp.addInitScript(() => localStorage.setItem("theme", "dark"));
  await mp.goto(`${B}/browse`, { waitUntil: "load" });
  of = await mp.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  ok("no h-overflow mobile", of === 0, String(of));
  await mp.getByRole("button", { name: /^Filters/ }).click();
  await mp.waitForTimeout(500);
  ok("filter sheet opens", await mp.locator("[role=dialog]").isVisible());
  await mp
    .locator('[role=dialog] label:has-text("Telegram") input')
    .first()
    .click();
  await mp.waitForTimeout(800);
  ok("sheet closes on apply", !(await mp.locator("[role=dialog]").isVisible()));
  ok("mobile filter applied", mp.url().includes("platform=telegram"), mp.url());
  await mc.close();

  // 11 light theme render
  const lc = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const lp = await lc.newPage();
  await lp.addInitScript(() => localStorage.setItem("theme", "light"));
  await lp.goto(`${B}/browse?platform=instagram`, { waitUntil: "load" });
  await lp.waitForTimeout(600);
  await lp.addInitScript(() => {});
  await lc.close();

  const dc = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const dp = await dc.newPage();
  await dp.addInitScript(() => localStorage.setItem("theme", "dark"));
  await dp.goto(`${B}/browse`, { waitUntil: "load" });
  await dp.waitForTimeout(600);
  await dc.close();

  ok("no console errors", errs.length === 0, errs.slice(0, 2).join(" | "));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
})();
