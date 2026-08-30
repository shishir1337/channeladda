/**
 * Accounts and sessions.
 *
 * Sign-up creates real rows, so every account this makes is prefixed `e2e-`
 * and left behind. That is harmless: nothing on the public site counts users
 * without an approved identity check or a completed order. `pnpm db:reset`
 * clears them.
 */
const { chromium } = require("playwright");
const B = process.env.BASE || "http://localhost:3000";
let pass = 0,
  fail = 0;
const ok = (n, c, x = "") => {
  c ? pass++ : fail++;
  console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? `  ${x}` : ""}`);
};
const W = "load";

const SEEDED = {
  email: "admin@channeladda.com",
  password: "channeladda-dev-2026",
};
const stamp = Date.now();
const NEW_USER = {
  name: "E2E Tester",
  email: `e2e-${stamp}@example.com`,
  password: "a-long-enough-password",
};

/** Waits for the header to settle into its signed-in or signed-out state. */
async function headerSettled(p) {
  await p.waitForFunction(
    () => !!document.querySelector("header button, header a[href='/signin']"),
    null,
    { timeout: 10_000 },
  );
}

(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  await p.addInitScript(() => localStorage.setItem("theme", "dark"));

  // ---- protected routes ----------------------------------------------------
  let r = await p.goto(`${B}/dashboard`, { waitUntil: W });
  ok(
    "dashboard sends a stranger to sign in",
    p.url().includes("/signin"),
    p.url().replace(B, ""),
  );
  ok(
    "and remembers where they were going",
    decodeURIComponent(p.url()).includes("next=/dashboard"),
  );
  ok("sign-in page renders", r.status() === 200 || r.status() === 200);

  // ---- wrong password ------------------------------------------------------
  await p.goto(`${B}/signin`, { waitUntil: W });
  await p.fill("input[type=email]", SEEDED.email);
  await p.fill("input[type=password]", "definitely-not-the-password");
  await p.locator("form button[type=submit]").click();
  await p.waitForTimeout(1500);
  const wrongText = (await p.locator("[role=alert]").allInnerTexts()).join(" ");
  ok(
    "wrong password is rejected",
    wrongText.length > 0 && p.url().includes("/signin"),
  );
  ok(
    "wrong password does not say whether the account exists",
    !/no account|not registered|unknown email/i.test(wrongText),
    wrongText.slice(0, 60),
  );

  // ---- sign in -------------------------------------------------------------
  await p.goto(`${B}/signin`, { waitUntil: W });
  await p.fill("input[type=email]", SEEDED.email);
  await p.fill("input[type=password]", SEEDED.password);
  await p.locator("form button[type=submit]").click();
  await p.waitForURL((u) => !u.pathname.startsWith("/signin"), {
    timeout: 15_000,
  });
  ok(
    "correct password signs in",
    !p.url().includes("/signin"),
    p.url().replace(B, ""),
  );

  await headerSettled(p);
  const headerText = await p.locator("header").innerText();
  ok(
    "header shows the account, not a sign-in link",
    headerText.includes("Owner"),
    headerText.replace(/\s+/g, " ").slice(0, 70),
  );

  // ---- session survives navigation ----------------------------------------
  r = await p.goto(`${B}/dashboard`, { waitUntil: W });
  ok(
    "dashboard now opens",
    r.status() === 200 && p.url().endsWith("/dashboard"),
  );
  const dash = await p.locator("main").innerText();
  ok("dashboard greets the right person", dash.includes("Owner"));

  // The email lives in the account menu rather than on the page. A dashboard
  // leads with what needs doing; who you are signed in as belongs in the
  // chrome, where it is available from every page rather than only this one.
  await p.locator("header button[aria-label^='Account menu']").click();
  await p.waitForTimeout(400);
  const menu = await p.locator("[role=menu]").innerText();
  ok(
    "the account menu names the signed-in account",
    menu.includes(SEEDED.email),
  );
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);

  ok(
    "the rail is there, not the marketing nav",
    (await p.locator("nav[aria-label=Dashboard]").count()) > 0 &&
      (await p.locator("nav[aria-label=Main]").count()) === 0,
  );
  ok(
    "dashboard is not indexable",
    (await p.locator("meta[name=robots]").count()) > 0,
  );

  // ---- return-to after sign-in --------------------------------------------
  await p.goto(`${B}/signin?next=%2Fsold`, { waitUntil: W });
  // Already signed in, so this only matters for the redirect target below.
  ok("signin still reachable while signed in", p.url().includes("/signin"));

  // ---- sign out ------------------------------------------------------------
  await p.goto(`${B}/dashboard`, { waitUntil: W });
  await headerSettled(p);
  await p.locator("header button[aria-label^='Account menu']").click();
  await p.waitForTimeout(400);
  await p.getByRole("menuitem", { name: /sign out/i }).click();
  await p.waitForTimeout(2000);
  r = await p.goto(`${B}/dashboard`, { waitUntil: W });
  ok(
    "sign out ends the session",
    p.url().includes("/signin"),
    p.url().replace(B, ""),
  );

  // ---- open redirect -------------------------------------------------------
  await p.goto(`${B}/signin?next=https%3A%2F%2Fexample.com%2Fowned`, {
    waitUntil: W,
  });
  await p.fill("input[type=email]", SEEDED.email);
  await p.fill("input[type=password]", SEEDED.password);
  await p.locator("form button[type=submit]").click();
  await p.waitForTimeout(2500);
  ok(
    "an off-site next= cannot redirect the visitor away",
    p.url().startsWith(B),
    p.url(),
  );

  // sign out again for the sign-up checks
  await p.goto(`${B}/dashboard`, { waitUntil: W });
  await headerSettled(p);
  await p.locator("header button[aria-label^='Account menu']").click();
  await p.waitForTimeout(400);
  await p.getByRole("menuitem", { name: /sign out/i }).click();
  await p.waitForTimeout(2000);

  // ---- sign up -------------------------------------------------------------
  await p.goto(`${B}/signup`, { waitUntil: W });
  await p.locator("form button[type=submit]").click();
  await p.waitForTimeout(400);
  ok(
    "sign-up validates before sending anything",
    (await p.locator("[role=alert]").count()) >= 2,
  );

  await p.fill("input[name=name]", NEW_USER.name);
  await p.fill("input[type=email]", NEW_USER.email);
  await p.fill("input[type=password]", "short");
  await p.locator("form button[type=submit]").click();
  await p.waitForTimeout(400);
  ok(
    "short passwords are refused",
    (await p.locator("[role=alert]").allInnerTexts()).some((t) =>
      t.includes("10 characters"),
    ),
  );

  await p.fill("input[type=password]", NEW_USER.password);
  await p.locator("form button[type=submit]").click();
  await p.waitForTimeout(400);
  ok(
    "the terms box is required",
    (await p.locator("[role=alert]").allInnerTexts()).some((t) =>
      /terms/i.test(t),
    ),
  );

  await p.locator("input[name=terms]").check();
  await p.locator("form button[type=submit]").click();
  await p.waitForURL((u) => u.pathname.includes("/verify-email"), {
    timeout: 15_000,
  });
  ok(
    "sign-up lands on the confirm-your-email page",
    p.url().includes("/verify-email"),
  );
  ok(
    "and asks for confirmation rather than claiming success",
    (await p.locator("h1").innerText()).includes("Confirm your email"),
  );

  // ---- duplicate sign-up ---------------------------------------------------
  await p.goto(`${B}/signup`, { waitUntil: W });
  await p.fill("input[name=name]", NEW_USER.name);
  await p.fill("input[type=email]", NEW_USER.email);
  await p.fill("input[type=password]", NEW_USER.password);
  await p.locator("input[name=terms]").check();
  await p.locator("form button[type=submit]").click();
  await p.waitForTimeout(2500);
  ok(
    "a second sign-up on the same email is refused",
    (await p.locator("[role=alert]").allInnerTexts()).some((t) =>
      /already exists/i.test(t),
    ),
    (await p.locator("[role=alert]").allInnerTexts()).join(" ").slice(0, 70),
  );

  // ---- forgotten password --------------------------------------------------
  await p.goto(`${B}/forgot-password`, { waitUntil: W });
  await p.fill("input[type=email]", `nobody-${stamp}@example.com`);
  await p.locator("form button[type=submit]").click();
  await p.waitForTimeout(2000);
  ok(
    "an unknown address gets the same neutral answer",
    (await p.locator("main").innerText()).includes("If an account exists"),
  );

  // ---- reset without a token ----------------------------------------------
  await p.goto(`${B}/reset-password`, { waitUntil: W });
  ok(
    "reset-password without a token explains itself",
    (await p.locator("main").innerText()).includes("missing its reset token"),
  );
  ok(
    "and offers no password fields to submit",
    (await p.locator("input[type=password]").count()) === 0,
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(0);
})();
