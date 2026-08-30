/**
 * Fees are set by a superadmin, not by a deploy.
 *
 * The point of doing this in a browser is the last step: change the rate in
 * the admin area and check the public pricing page actually says the new
 * number. A fee the site quotes differently from what it charges is the worst
 * possible outcome here.
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

async function signIn(p, email) {
  await p.goto(`${B}/signin`, { waitUntil: W });
  await p.fill("input[type=email]", email);
  await p.fill("input[type=password]", PASSWORD);
  await p.locator("form button[type=submit]").click();
  await p.waitForURL((u) => !u.pathname.startsWith("/signin"), {
    timeout: 15_000,
  });
}

async function signOut(p) {
  await p.goto(`${B}/dashboard`, { waitUntil: W });
  await p.locator("header button[aria-label^='Account menu']").click();
  await p.waitForTimeout(400);
  await p.getByRole("menuitem", { name: /sign out/i }).click();
  await p.waitForTimeout(2000);
}

(async () => {
  const b = await chromium.launch();
  const p = await (
    await b.newContext({ viewport: { width: 1440, height: 1000 } })
  ).newPage();
  await p.addInitScript(() => localStorage.setItem("theme", "dark"));

  // ---- only a superadmin -------------------------------------------------
  await signIn(p, "moderator@channeladda.com");
  const asMod = await p.goto(`${B}/admin/settings`, { waitUntil: W });
  ok(
    "a moderator cannot open the fee settings",
    asMod.status() === 404,
    String(asMod.status()),
  );
  await p.goto(`${B}/admin`, { waitUntil: W });
  ok(
    "and is not offered the link",
    !(await p.locator("header").innerText()).includes("Settings"),
  );
  await signOut(p);

  await signIn(p, "finance@channeladda.com");
  const asFinance = await p.goto(`${B}/admin/settings`, { waitUntil: W });
  ok("nor can finance", asFinance.status() === 404, String(asFinance.status()));
  await signOut(p);

  // ---- the superadmin ----------------------------------------------------
  await signIn(p, "admin@channeladda.com");
  const asAdmin = await p.goto(`${B}/admin/settings`, { waitUntil: W });
  ok("a superadmin can", asAdmin.status() === 200, String(asAdmin.status()));
  ok(
    "the link is in the nav",
    (await p.locator("header").innerText()).includes("Settings"),
  );

  const buyerField = p.locator("input[name=buyerFeeBp]");
  const sellerField = p.locator("input[name=sellerFeeBp]");
  ok("the current buyer fee is shown", (await buyerField.inputValue()) === "3");
  ok(
    "the current seller fee is shown",
    (await sellerField.inputValue()) === "5",
  );

  const save = p.getByRole("button", { name: "Save fees" });
  ok("saving is disabled until something changes", await save.isDisabled());

  // ---- guard rails --------------------------------------------------------
  await buyerField.fill("90");
  await save.click();
  await p.waitForTimeout(1500);
  ok(
    "an absurd rate is refused",
    (await p.locator("[role=alert]").allInnerTexts()).some((t) =>
      /over 30%/i.test(t),
    ),
    (await p.locator("[role=alert]").allInnerTexts()).join(" ").slice(0, 60),
  );

  // ---- a real change ------------------------------------------------------
  await buyerField.fill("4.25");
  const preview = await p.locator("main").innerText();
  ok(
    "the worked example updates before saving",
    preview.includes("$103.21"),
    preview.includes("$103.21") ? "$99 -> $103.21" : "no preview",
  );

  await save.click();
  await p.waitForTimeout(2500);
  ok(
    "it saves",
    (await p.locator("main").innerText()).includes("New sales use these rates"),
  );

  // ---- the public site agrees --------------------------------------------
  await p.goto(`${B}/fees`, { waitUntil: W });
  const feesPage = await p.locator("main").innerText();
  ok(
    "the public pricing page shows the new rate",
    feesPage.includes("4.25%"),
    feesPage.includes("4.25%") ? "4.25%" : "still the old number",
  );
  ok("and not the old one", !feesPage.includes("3%"));

  await p.goto(`${B}/sell`, { waitUntil: W });
  ok(
    "so does the sell page",
    (await p.locator("main").innerText()).includes("4.25%"),
  );

  // ---- put it back --------------------------------------------------------
  await p.goto(`${B}/admin/settings`, { waitUntil: W });
  await p.locator("input[name=buyerFeeBp]").fill("3");
  await p.getByRole("button", { name: "Save fees" }).click();
  await p.waitForTimeout(2500);
  await p.goto(`${B}/fees`, { waitUntil: W });
  ok(
    "restoring it puts the public page back",
    (await p.locator("main").innerText()).includes("3%"),
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(0);
})();
