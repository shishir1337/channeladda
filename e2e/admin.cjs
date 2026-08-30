/**
 * Moderation, in a browser, across three accounts.
 *
 * The loop this closes: a seller submits, a moderator sends it back with a
 * reason, the seller sees that reason, fixes it, resubmits, and the moderator
 * approves it onto the public site.
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

const SELLER = "admin@channeladda.com"; // also a seller for this test
const MODERATOR = "moderator@channeladda.com";
const PLAIN_USER = "vikram-thakur@example.com";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const file = (name) => ({ name, mimeType: "image/png", buffer: PNG });
const HANDLE = `@mod${Date.now() % 1000000}`;
const REJECTION =
  "The revenue screenshot does not match the handle on the listing.";

/**
 * One signed-in page per person, held open for the whole run.
 *
 * Signing in and out between every step meant five sign-ins in quick
 * succession, which trips the 3-per-10s brute-force limit — the app defending
 * itself, not a bug. Separate contexts are also closer to the truth: a seller
 * and a moderator are two people at two desks, not one browser taking turns.
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
  try {
    await page.waitForURL((u) => !u.pathname.startsWith("/signin"), {
      timeout: 15_000,
    });
  } catch (error) {
    const shown = await page
      .locator("[role=alert]")
      .allInnerTexts()
      .catch(() => []);
    throw new Error(
      `sign-in as ${email} did not go through: ${shown.join(" | ") || "no message shown"}`,
      { cause: error },
    );
  }
  return page;
}

(async () => {
  const b = await chromium.launch();
  const anonContext = await b.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const anon = await anonContext.newPage();

  // ---- who can get in -----------------------------------------------------
  await anon.goto(`${B}/admin`, { waitUntil: W });
  ok("a stranger is sent to sign in", anon.url().includes("/signin"));

  const p = await personaPage(b, PLAIN_USER);
  const asUser = await p.goto(`${B}/admin`, { waitUntil: W });
  ok(
    "an ordinary account gets a 404, not a forbidden page",
    asUser.status() === 404,
    String(asUser.status()),
  );
  ok(
    "and the admin area does not admit it exists",
    !(await p.locator("body").innerText()).match(
      /forbidden|not allowed|permission/i,
    ),
  );
  const queueAsUser = await p.goto(`${B}/admin/listings`, { waitUntil: W });
  ok("the queue is closed to it too", queueAsUser.status() === 404);

  await p.close();

  // ---- a seller submits ---------------------------------------------------
  const seller = await personaPage(b, SELLER);
  await seller.goto(`${B}/dashboard/listings/new`, { waitUntil: W });
  await seller.fill("input[name=handle]", HANDLE);
  await seller.fill(
    "input[name=title]",
    "Moderation loop test channel listing",
  );
  await seller.fill("input[name=niche]", "Technology");
  await seller.fill("input[name=country]", "United States");
  await seller.fill("input[name=audience]", "64000");
  await seller.fill("input[name=engagement]", "4.2");
  await seller.fill("input[name=ageYears]", "3");
  await seller.fill("input[name=monthlyRevenue]", "800");
  await seller.fill("input[name=price]", "3200");
  await seller.getByLabel("Cover image").setInputFiles(file("cover.png"));
  await seller.waitForTimeout(1500);
  await seller.getByLabel("Profile picture").setInputFiles(file("avatar.png"));
  await seller.waitForTimeout(1500);
  await seller.getByLabel("Add a screenshot").setInputFiles(file("proof.png"));
  await seller.waitForTimeout(1500);
  await seller.fill(
    'input[placeholder="e.g. Last 28 days of revenue"]',
    "Revenue",
  );

  await seller
    .getByRole("button", { name: /Save and verify ownership/ })
    .click();
  await seller.waitForURL(
    (u) =>
      u.pathname.startsWith("/dashboard/listings/") &&
      !u.pathname.endsWith("/new"),
    { timeout: 20_000 },
  );
  const sellerUrl = seller.url();
  await seller
    .getByRole("heading", { name: "Prove the account is yours" })
    .waitFor({ timeout: 20_000 });
  await seller.getByRole("button", { name: /send for review/i }).click();
  await seller
    .getByRole("heading", { name: "Prove the account is yours" })
    .waitFor({ state: "detached", timeout: 20_000 });
  ok("the seller's listing is in review", true);

  // ---- the moderator picks it up -----------------------------------------
  const mod = await personaPage(b, MODERATOR);
  const asMod = await mod.goto(`${B}/admin`, { waitUntil: W });
  ok("a moderator gets in", asMod.status() === 200, String(asMod.status()));
  const overview = await mod.locator("main").innerText();
  ok(
    "the overview counts the queue",
    /waiting for you|queue is clear/i.test(overview),
  );

  await mod.goto(`${B}/admin/listings`, { waitUntil: W });
  const queue = await mod.locator("main").innerText();
  ok("the listing is in the queue", queue.includes(HANDLE), HANDLE);

  await mod.locator(`a:has-text("${HANDLE}")`).first().click();
  await mod.waitForURL(/\/admin\/listings\/\w+/, { timeout: 15_000 });
  const review = await mod.locator("main").innerText();
  ok(
    "the ownership code is shown to the moderator",
    /CA-[A-Z2-9]{4}-[A-Z2-9]{4}/.test(review),
  );
  ok("the seller's email is shown", review.includes(SELLER));
  ok("the claimed numbers are shown", review.includes("64,000"));
  ok("the proof section is shown", review.includes("Proof (1)"));

  // ---- rejecting needs a real reason -------------------------------------
  await mod.getByRole("button", { name: "Send back to the seller" }).click();
  await mod.waitForTimeout(400);
  const sendBack = mod.getByRole("button", { name: "Send it back" });
  ok("the send-back button starts disabled", await sendBack.isDisabled());
  await mod.fill("textarea[name=reason]", "nope");
  ok("and stays disabled for a one-word reason", await sendBack.isDisabled());

  await mod.fill("textarea[name=reason]", REJECTION);
  ok(
    "it enables once there is something to act on",
    await sendBack.isEnabled(),
  );
  await sendBack.click();
  await mod.waitForURL((u) => u.pathname === "/admin/listings", {
    timeout: 20_000,
  });
  const afterReject = await mod.locator("main").innerText();
  ok("it leaves the review queue", !afterReject.includes(HANDLE));

  // ---- the seller sees why ------------------------------------------------
  await seller.goto(sellerUrl, { waitUntil: W });
  const sellerView = await seller.locator("main").innerText();
  ok(
    "the seller is told changes are needed",
    sellerView.includes("Changes needed"),
  );
  ok("and sees the reason word for word", sellerView.includes(REJECTION));
  ok(
    "the listing is editable again",
    (await seller.locator("input[name=price]").count()) === 1,
  );

  // ---- fix and resubmit ---------------------------------------------------
  await seller.fill("input[name=price]", "3000");
  await seller
    .getByRole("button", { name: /Save and verify ownership/ })
    .click();
  await seller
    .getByRole("heading", { name: "Prove the account is yours" })
    .waitFor({ timeout: 20_000 });
  await seller.getByRole("button", { name: /send for review/i }).click();
  await seller
    .getByRole("heading", { name: "Prove the account is yours" })
    .waitFor({ state: "detached", timeout: 20_000 });
  ok("the seller resubmits", true);

  // ---- approve ------------------------------------------------------------
  await mod.goto(`${B}/admin/listings`, { waitUntil: W });
  await mod.locator(`a:has-text("${HANDLE}")`).first().click();
  await mod.waitForURL(/\/admin\/listings\/\w+/, { timeout: 15_000 });
  const adminUrl = mod.url();
  await mod.getByRole("button", { name: "Approve and publish" }).click();
  await mod.waitForURL((u) => u.pathname === "/admin/listings", {
    timeout: 20_000,
  });
  ok("approving returns to the queue", mod.url().endsWith("/admin/listings"));

  await mod.goto(adminUrl, { waitUntil: W });
  const approved = await mod.locator("main").innerText();
  ok("the listing reads as live", approved.includes("Live"));
  ok("the decision is in its history", /approve/i.test(approved));

  // ---- and it is actually on the public site -----------------------------
  const slugLink = await mod
    .locator('a:has-text("View live")')
    .first()
    .getAttribute("href");
  ok("a public link is offered", Boolean(slugLink), String(slugLink));
  if (slugLink) {
    const publicPage = await anon.goto(B + slugLink, { waitUntil: W });
    ok(
      "a buyer can open the listing",
      publicPage.status() === 200,
      String(publicPage.status()),
    );
    ok(
      "and it is the right one",
      (await anon.locator("main").innerText()).includes(HANDLE),
    );
  }

  // ---- clean up: take it down again --------------------------------------
  await mod.goto(adminUrl, { waitUntil: W });
  await mod.getByRole("button", { name: "Take this listing down" }).click();
  await mod.waitForTimeout(400);
  await mod.locator("textarea").fill("Created by the end-to-end test suite.");
  await mod.getByRole("button", { name: "Take it down" }).click();
  await mod.waitForURL((u) => u.pathname === "/admin/listings", {
    timeout: 20_000,
  });
  ok("a live listing can be taken down", true);

  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(0);
})();
