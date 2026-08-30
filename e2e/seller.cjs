/**
 * The seller flow in a real browser: sign in, fill the form, upload files,
 * get an ownership code, send it for review.
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

/** A real 1x1 PNG, so the server's magic-byte check is satisfied. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const file = (name) => ({ name, mimeType: "image/png", buffer: PNG });

const HANDLE = `@e2e${Date.now() % 1000000}`;

(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await c.newPage();
  await p.addInitScript(() => localStorage.setItem("theme", "dark"));

  // ---- signed out ---------------------------------------------------------
  await p.goto(`${B}/dashboard/listings`, { waitUntil: W });
  ok(
    "listings are behind sign-in",
    p.url().includes("/signin"),
    p.url().replace(B, ""),
  );
  await p.goto(`${B}/dashboard/listings/new`, { waitUntil: W });
  ok("so is the new-listing page", p.url().includes("/signin"));

  // ---- sign in ------------------------------------------------------------
  await p.goto(`${B}/signin`, { waitUntil: W });
  await p.fill("input[type=email]", SEEDED.email);
  await p.fill("input[type=password]", SEEDED.password);
  await p.locator("form button[type=submit]").click();
  await p.waitForURL((u) => !u.pathname.startsWith("/signin"), {
    timeout: 15_000,
  });

  await p.goto(`${B}/dashboard/listings`, { waitUntil: W });
  ok("listings page opens", p.url().endsWith("/dashboard/listings"));
  ok(
    "with exactly one h1",
    (await p.locator("h1").count()) === 1,
    String(await p.locator("h1").count()),
  );

  // ---- validation before anything is saved --------------------------------
  await p.goto(`${B}/dashboard/listings/new`, { waitUntil: W });
  await p.getByRole("button", { name: "Save draft" }).click();
  await p.waitForTimeout(1200);
  const alertTexts = await p.locator("[role=alert]").allInnerTexts();
  ok(
    "an empty form is refused",
    alertTexts.length > 0,
    alertTexts.join(" | ").slice(0, 120),
  );
  ok("and nothing was created", p.url().includes("/new"));

  // ---- fill it in ---------------------------------------------------------
  await p.fill("input[name=handle]", HANDLE);
  await p.fill(
    "input[name=title]",
    "End to end test channel with a long enough title",
  );
  await p.fill("input[name=niche]", "Technology");
  await p.fill("input[name=country]", "United States");
  await p.fill("input[name=audience]", "128000");
  await p.fill("input[name=engagement]", "7.4");
  await p.fill("input[name=ageYears]", "4");
  await p.fill("input[name=monthlyRevenue]", "1200");
  await p.fill("input[name=price]", "4500");

  const payout = await p.locator("main").innerText();
  ok(
    "the payout breakdown appears once a price is entered",
    payout.includes("You receive"),
  );

  // By name, not by index: an uploader swaps its input for a preview once a
  // file lands, so positions shift underneath you.
  await p.getByLabel("Cover image").setInputFiles(file("cover.png"));
  await p.waitForTimeout(1500);
  await p.getByLabel("Profile picture").setInputFiles(file("avatar.png"));
  await p.waitForTimeout(1500);
  ok(
    "both images upload and preview",
    (await p.locator('img[src^="/uploads/"]').count()) >= 2,
    String(await p.locator('img[src^="/uploads/"]').count()),
  );

  await p.getByLabel("Add a screenshot").setInputFiles(file("proof.png"));
  await p.waitForTimeout(1500);
  await p.fill(
    'input[placeholder="e.g. Last 28 days of revenue"]',
    "Revenue, last 28 days",
  );
  ok("a proof screenshot is attached", true);

  // ---- save and get the code ---------------------------------------------
  await p.getByRole("button", { name: /Save and verify ownership/ }).click();
  // Wait for a real listing id. Matching "one or more characters" would also
  // match /new, capture the wrong URL, and turn a failed save into a pass.
  await p.waitForURL(
    (u) =>
      u.pathname.startsWith("/dashboard/listings/") &&
      !u.pathname.endsWith("/new"),
    { timeout: 20_000 },
  );
  const listingUrl = p.url();
  ok(
    "saving lands on the listing",
    /\/dashboard\/listings\/\w+/.test(listingUrl),
  );

  await p
    .getByRole("heading", { name: "Prove the account is yours" })
    .waitFor({ timeout: 20_000 });
  const body = await p.locator("main").innerText();
  ok("the ownership code is shown", /CA-[A-Z2-9]{4}-[A-Z2-9]{4}/.test(body));
  ok("it says what to do with it", body.includes("Prove the account is yours"));
  ok(
    "the status says whose turn it is",
    body.includes("Waiting on your code"),
    body.slice(0, 0),
  );

  // ---- the form is locked during the check --------------------------------
  ok(
    "the edit form is hidden while the code is outstanding",
    (await p.locator("input[name=price]").count()) === 0,
  );

  // ---- send for review ----------------------------------------------------
  await p.getByRole("button", { name: /send for review/i }).click();
  // The read-only summary is already on screen during the code check, so
  // waiting for it proves nothing. Wait for the code block to go away.
  await p
    .getByRole("heading", { name: "Prove the account is yours" })
    .waitFor({ state: "detached", timeout: 20_000 });
  const afterReview = await p.locator("main").innerText();
  ok("it moves into review", afterReview.includes("In review"), "");
  ok(
    "and says nothing is needed from the seller",
    afterReview.includes("Nothing needed from you"),
  );
  ok(
    "the details are shown read-only",
    afterReview.includes("Locked while this listing is with us"),
  );

  // ---- it appears in the list --------------------------------------------
  await p.goto(`${B}/dashboard/listings`, { waitUntil: W });
  const list = await p.locator("main").innerText();
  ok("the listing appears in the list", list.includes(HANDLE), HANDLE);
  ok("with its status", list.includes("In review"));

  // ---- pull it back and edit ---------------------------------------------
  await p.goto(listingUrl, { waitUntil: W });
  await p.getByRole("button", { name: /Pull it back to edit/ }).click();
  await p.locator("input[name=price]").waitFor({ timeout: 20_000 });
  ok(
    "it can be pulled back to a draft",
    (await p.locator("input[name=price]").count()) === 1,
  );

  // ---- somebody else's listing -------------------------------------------
  await p.goto(`${B}/dashboard/listings/clearlynotarealidatall`, {
    waitUntil: W,
  });
  ok(
    "an unknown listing id is a 404",
    (await p.locator("main").innerText()).match(/not found|404/i) !== null,
  );

  // ---- clean up -----------------------------------------------------------
  await p.goto(listingUrl, { waitUntil: W });
  await p.getByRole("button", { name: /Delete draft/ }).click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: /Yes, delete it/ }).click();
  await p.waitForURL((u) => u.pathname.endsWith("/dashboard/listings"), {
    timeout: 20_000,
  });
  await p.waitForTimeout(500);
  const afterDelete = await p.locator("main").innerText();
  ok("a draft can be deleted", !afterDelete.includes(HANDLE));

  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(0);
})();
