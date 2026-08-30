const { chromium } = require("playwright");
const B = process.env.BASE || "http://localhost:3000";
let pass = 0,
  fail = 0;
const ok = (n, c, x = "") => {
  c ? pass++ : fail++;
  console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? `  ${x}` : ""}`);
};
const W = "load";
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  // next-themes injects a pre-paint theme <script>. React 19 warns whenever
  // that subtree re-renders on the client, which the 404 route does. The
  // script has already run during SSR, so this one string is noise. Nothing
  // else is tolerated.
  const KNOWN = /status of 404|Encountered a script tag while rendering/;
  p.on("console", (m) => {
    if (m.type() === "error" && !KNOWN.test(m.text())) errs.push(m.text());
  });
  await p.addInitScript(() => localStorage.setItem("theme", "dark"));

  // ---- auth ----
  for (const u of [
    "/signin",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
  ]) {
    const r = await p.goto(B + u, { waitUntil: W });
    ok(
      `auth ${u}`,
      r.status() === 200 && (await p.locator("h1").count()) === 1,
      String(r.status()),
    );
  }
  ok(
    "auth has no marketing header",
    (await p.locator("header nav[aria-label=Main]").count()) === 0,
  );

  await p.goto(`${B}/signup`, { waitUntil: W });
  await p.locator("form button[type=submit]").click();
  await p.waitForTimeout(300);
  ok(
    "signup validates",
    (await p.locator("[role=alert]").count()) >= 2,
    String(await p.locator("[role=alert]").count()),
  );
  await p.fill("input[type=email]", "a@b.co");
  await p.fill("input[type=password]", "short");
  await p.locator("form button[type=submit]").click();
  await p.waitForTimeout(300);
  ok(
    "password length enforced",
    (await p.locator("[role=alert]").allInnerTexts()).some((t) =>
      t.includes("10 characters"),
    ),
  );

  await p.goto(`${B}/signin`, { waitUntil: W });
  const pwField = p.locator('input[autocomplete="current-password"]').first();
  await pwField.fill("secret123");
  const before = await pwField.getAttribute("type");
  await p.locator('button[aria-label="Show password"]').click();
  await p.waitForTimeout(250);
  const after = await pwField.getAttribute("type");
  const value = await pwField.inputValue();
  ok(
    "password reveal works",
    before === "password" && after === "text" && value === "secret123",
    `${before}->${after}`,
  );
  await p.locator('button[aria-label="Hide password"]').click();
  await p.waitForTimeout(200);
  ok(
    "password hides again",
    (await pwField.getAttribute("type")) === "password",
  );

  await p.goto(`${B}/forgot-password`, { waitUntil: W });
  await p.fill("input[type=email]", "someone@example.com");
  await p.locator("form button[type=submit]").click();
  await p.waitForTimeout(400);
  ok(
    "forgot shows neutral confirmation",
    (await p.locator("main").innerText()).includes("If an account exists"),
  );

  // The token is consumed by /api/auth/verify-email, which redirects back here
  // with an outcome. This page never reads a raw token.
  await p.goto(`${B}/verify-email?error=expired`, { waitUntil: W });
  ok(
    "expired link state",
    (await p.locator("h1").innerText()).includes("expired"),
  );
  await p.goto(`${B}/verify-email?verified=1`, { waitUntil: W });
  ok(
    "confirmed state",
    (await p.locator("h1").innerText()).includes("confirmed"),
  );
  await p.goto(`${B}/verify-email`, { waitUntil: W });
  ok(
    "a raw token does not confirm anything",
    (await p.locator("h1").innerText()).includes("Confirm your email"),
  );

  // ---- legal ----
  const legal = [
    "/terms",
    "/privacy",
    "/refunds",
    "/aml-kyc",
    "/listing-rules",
  ];
  const lt = new Set();
  for (const u of legal) {
    const r = await p.goto(B + u, { waitUntil: W });
    ok(
      `legal ${u}`,
      r.status() === 200 && (await p.locator("h1").count()) === 1,
      String(r.status()),
    );
    lt.add(await p.title());
  }
  ok("legal titles unique", lt.size === 5, String(lt.size));
  ok(
    "policy nav marks current",
    (await p
      .locator("nav[aria-label=Policies] a[aria-current=page]")
      .count()) === 1,
  );

  ok("no console errors", errs.length === 0, errs.slice(0, 2).join(" | "));
  await c.close();

  // ---- responsive + a11y sweep ----
  const ROUTES = [
    "/",
    "/browse",
    "/browse/youtube",
    // A real seeded listing. The old slug here pointed at a listing that no
    // longer exists, so every sweep was really just testing the 404 page.
    "/listing/petpatrolshorts-youtube",
    "/sellers",
    "/seller/nadia-hassan",
    "/sold",
    "/sell",
    "/services",
    "/services/subscribers-watch-time",
    "/how-it-works",
    "/trust-safety",
    "/fees",
    "/about",
    "/support",
    "/help",
    "/help/opening-a-dispute",
    "/affiliates",
    "/signin",
    "/signup",
    "/terms",
    "/listing-rules",
    "/nope",
  ];
  let bad = 0,
    checked = 0;
  for (const theme of ["dark", "light"])
    for (const [w, h, tag] of [
      [375, 812, "375"],
      [768, 1024, "768"],
      [1440, 900, "1440"],
    ]) {
      const cc = await b.newContext({ viewport: { width: w, height: h } });
      const pp = await cc.newPage();
      let e = [];
      pp.on("pageerror", (x) => e.push(`pageerror: ${x.message}`));
      pp.on("console", (m) => {
        const t = m.text();
        if (m.type() === "error" && !/status of 404/.test(t)) e.push(t);
      });
      // "Failed to load resource" alone says nothing useful. Record which
      // request failed so a sweep failure can actually be diagnosed.
      pp.on("response", (r) => {
        if (r.status() >= 400 && r.status() !== 404)
          e.push(`HTTP ${r.status()} ${r.url()}`);
      });
      await pp.addInitScript((t) => localStorage.setItem("theme", t), theme);
      for (const u of ROUTES) {
        e = [];
        await pp.goto(B + u, { waitUntil: W });
        await pp.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 700) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 30));
          }
        });
        try {
          await pp.waitForFunction(
            () => [...document.images].every((i) => i.complete),
            null,
            { timeout: 12000 },
          );
        } catch {}
        const r = await pp.evaluate(() => ({
          of:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
          unnamed: [...document.querySelectorAll("a,button")].filter(
            (el) =>
              !(el.getAttribute("aria-label") || el.textContent || "").trim(),
          ).length,
          imgs: [...document.images].filter(
            (i) => !(i.complete && i.naturalWidth > 0),
          ).length,
        }));
        checked++;
        if (r.of !== 0 || r.unnamed > 0 || r.imgs > 0 || e.length > 0) {
          bad++;
          console.log(
            `  SWEEP FAIL ${theme} ${tag} ${u}`,
            JSON.stringify(r),
            e.slice(0, 1),
          );
        }
      }
      await cc.close();
    }
  ok(
    `sweep ${checked} page/viewport combos`,
    bad === 0,
    bad ? `${bad} failing` : "all clean",
  );

  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
})();
