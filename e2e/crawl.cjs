const { chromium } = require("playwright");
const B = process.env.BASE || "http://localhost:3000";
(async () => {
  const b = await chromium.launch();
  const p = await (
    await b.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await p.addInitScript(() => localStorage.setItem("theme", "dark"));

  const seen = new Set(["/"]);
  const queue = ["/"];
  const results = [];
  const broken = [];
  const _media404 = [];
  const noH1 = [];
  const dupH1 = [];

  while (queue.length) {
    const path = queue.shift();
    let status = 0;
    try {
      const r = await p.goto(B + path, { waitUntil: "load", timeout: 30000 });
      status = r ? r.status() : 0;
      // Streamed pages briefly hold both the Suspense fallback and the real
      // content; wait for the tree to settle before asserting on structure.
      await p.waitForTimeout(250);
    } catch {
      status = -1;
    }
    results.push([path, status]);
    if (status !== 200) {
      broken.push(`${path} -> ${status}`);
      continue;
    }

    // Rapid sequential navigation can catch the DOM mid-swap, so an odd count
    // is re-read once on a settled page before it is recorded.
    let h1 = await p.locator("h1").count();
    if (h1 !== 1) {
      await p.waitForTimeout(500);
      h1 = await p.locator("h1").count();
    }
    if (h1 === 0) noH1.push(path);
    if (h1 > 1) dupH1.push(`${path} (${h1})`);

    const hrefs = await p.evaluate(() =>
      [...document.querySelectorAll("a[href]")]
        .map((a) => a.getAttribute("href"))
        .filter((h) => h?.startsWith("/") && !h.startsWith("//")),
    );
    for (const h of hrefs) {
      const clean = h.split("#")[0];
      if (!clean || seen.has(clean)) continue;
      seen.add(clean);
      queue.push(clean);
    }
  }

  console.log(`crawled ${results.length} internal URLs`);

  let pass = 0;
  let fail = 0;
  const ok = (n, c, x = "") => {
    c ? pass++ : fail++;
    console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? `  ${x}` : ""}`);
  };

  ok("no broken links", broken.length === 0, broken.slice(0, 5).join(", "));
  ok("every page has an h1", noH1.length === 0, noH1.slice(0, 5).join(", "));
  ok("no page has two h1s", dupH1.length === 0, dupH1.slice(0, 5).join(", "));
  ok("crawled the whole site", results.length > 100, String(results.length));

  await b.close();
  console.log(`
${pass} passed, ${fail} failed`);
})();
