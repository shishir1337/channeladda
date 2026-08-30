/**
 * Haggling, in a browser, across two accounts.
 *
 * A seller lists, a buyer offers, the seller counters, the buyer accepts —
 * and the listing then stops being available to anyone else.
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
const PASSWORD = "channeladda-dev-2026";

const SELLER = "admin@channeladda.com";
const MODERATOR = "moderator@channeladda.com";
const BUYER = "vikram-thakur@example.com";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const file = (name) => ({ name, mimeType: "image/png", buffer: PNG });
const HANDLE = `@haggle${Date.now() % 1000000}`;

/**
 * One signed-in page per person, held open for the whole run.
 *
 * Signing in and out between every step meant five sign-ins in quick
 * succession, which trips the 3-per-10s brute-force limit — the app defending
 * itself, not a bug. Separate contexts are also how two people actually use
 * the site: at the same time, in different browsers.
 */
async function personaPage(browser, email) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addInitScript(() => localStorage.setItem("theme", "dark"));
  const page = await context.newPage();
  await page.goto(`${B}/signin`, { waitUntil: W });
  await page.fill("input[type=email]", email);
  await page.fill("input[type=password]", PASSWORD);
  await page.locator("form button[type=submit]").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"), {
    timeout: 15_000,
  });
  return page;
}

(async () => {
  const b = await chromium.launch();
  const anonContext = await b.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const anon = await anonContext.newPage();

  // ---- publish something to haggle over -----------------------------------
  const p = await personaPage(b, SELLER);
  await p.goto(`${B}/dashboard/listings/new`, { waitUntil: W });
  await p.fill("input[name=handle]", HANDLE);
  await p.fill("input[name=title]", "A channel worth negotiating over");
  await p.fill("input[name=niche]", "Technology");
  await p.fill("input[name=country]", "United States");
  await p.fill("input[name=audience]", "40000");
  await p.fill("input[name=engagement]", "4");
  await p.fill("input[name=ageYears]", "2");
  await p.fill("input[name=monthlyRevenue]", "0");
  await p.fill("input[name=price]", "1000");
  await p.getByLabel("Cover image").setInputFiles(file("cover.png"));
  await p.waitForTimeout(1500);
  await p.getByLabel("Profile picture").setInputFiles(file("avatar.png"));
  await p.waitForTimeout(1500);
  await p.getByLabel("Add a screenshot").setInputFiles(file("proof.png"));
  await p.waitForTimeout(1500);
  await p.fill(
    'input[placeholder="e.g. Last 28 days of revenue"]',
    "Analytics",
  );
  await p.getByRole("button", { name: /Save and verify ownership/ }).click();
  await p.waitForURL(
    (u) =>
      u.pathname.startsWith("/dashboard/listings/") &&
      !u.pathname.endsWith("/new"),
    { timeout: 20_000 },
  );
  await p
    .getByRole("heading", { name: "Prove the account is yours" })
    .waitFor({ timeout: 20_000 });
  await p.getByRole("button", { name: /send for review/i }).click();
  await p
    .getByRole("heading", { name: "Prove the account is yours" })
    .waitFor({ state: "detached", timeout: 20_000 });
  const mod = await personaPage(b, MODERATOR);
  await mod.goto(`${B}/admin/listings`, { waitUntil: W });
  await mod.locator(`a:has-text("${HANDLE}")`).first().click();
  await mod.waitForURL(/\/admin\/listings\/\w+/, { timeout: 15_000 });
  await mod.getByRole("button", { name: "Approve and publish" }).click();
  await mod.waitForURL((u) => u.pathname === "/admin/listings", {
    timeout: 20_000,
  });
  ok("a listing is live to haggle over", true);

  const slug = `${HANDLE.replace("@", "")}-youtube`;
  const listingUrl = `${B}/listing/${slug}`;

  // ---- signed out ---------------------------------------------------------
  await anon.goto(listingUrl, { waitUntil: W });
  await anon.waitForTimeout(1200);
  const anonText = await anon.locator("main").innerText();
  ok("the offer panel is on the listing", anonText.includes("Make an offer"));
  ok(
    "a stranger is told they need an account",
    anonText.includes("You need an account to send one"),
  );
  ok(
    "and gets a sign-in link, not a dead form",
    (await anon.locator('a[href^="/signin?next=/listing/"]').count()) > 0,
  );

  // ---- the buyer offers ---------------------------------------------------
  const buyer = await personaPage(b, BUYER);
  await buyer.goto(listingUrl, { waitUntil: W });
  await buyer.waitForTimeout(1500);
  ok(
    "a signed-in buyer gets the form",
    (await buyer.locator("input[name=amount]").count()) === 1,
  );

  await buyer.fill("input[name=amount]", "100");
  await buyer.waitForTimeout(300);
  ok(
    "a lowball is called out before sending",
    (await buyer.locator("main").innerText()).includes("less than half"),
  );

  await buyer.fill("input[name=amount]", "900");
  await buyer.fill("textarea[name=message]", "Would you take 900 for it?");
  await buyer.getByRole("button", { name: "Send offer" }).click();
  await buyer.getByText("Offer sent").waitFor({ timeout: 20_000 });
  ok("the offer is sent", true);

  await buyer.goto(`${B}/dashboard/offers`, { waitUntil: W });
  const buyerView = await buyer.locator("main").innerText();
  ok("it shows in the buyer's offers", buyerView.includes("$900"));
  ok("waiting on the seller", buyerView.includes("waiting on"));

  // ---- the seller counters ------------------------------------------------
  await p.goto(`${B}/dashboard/offers`, { waitUntil: W });
  const sellerView = await p.locator("main").innerText();
  ok("the seller sees the offer", sellerView.includes("$900"));
  ok("and is told it is their move", sellerView.includes("waiting on you"));
  ok("with the buyer's message", sellerView.includes("Would you take 900"));

  await p.getByRole("button", { name: "Counter" }).first().click();
  await p.waitForTimeout(400);
  await p.locator('input[inputmode="decimal"]').last().fill("950");
  await p.getByRole("button", { name: "Send counter" }).click();
  await p.getByText("Countered").first().waitFor({ timeout: 20_000 });
  const afterCounter = await p.locator("main").innerText();
  ok("the counter is sent", afterCounter.includes("$950"));
  ok("the original reads as countered", afterCounter.includes("Countered"));

  // ---- the buyer accepts --------------------------------------------------
  await buyer.goto(`${B}/dashboard/offers`, { waitUntil: W });
  const counterSeen = await buyer.locator("main").innerText();
  ok("the buyer sees the counter", counterSeen.includes("$950"));
  ok("and it is now their move", counterSeen.includes("waiting on you"));

  // A plain string, not a regex: "$" in a pattern is an end anchor, and
  // "Accept $950" as a regex quietly matches nothing.
  await buyer.getByRole("button", { name: "Accept $950" }).click();
  await buyer.getByText("held for you").waitFor({ timeout: 20_000 });
  const accepted = await buyer.locator("main").innerText();
  ok("accepting works", accepted.includes("Accepted"));
  ok(
    "and the buyer is told the listing is held",
    accepted.includes("held for you"),
  );

  // ---- the seller sees the same outcome -----------------------------------
  await p.goto(`${B}/dashboard/offers`, { waitUntil: W });
  ok(
    "the seller is told it is reserved for that buyer",
    (await p.locator("main").innerText()).includes("reserved for this buyer"),
  );

  // ---- nobody else can buy it --------------------------------------------
  await anon.goto(`${B}/browse`, { waitUntil: W });
  ok(
    "a reserved listing is gone from browse",
    !(await anon.locator("main").innerText()).includes(HANDLE),
  );

  console.log(`
${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(0);
})();
