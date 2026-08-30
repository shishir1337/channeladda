/**
 * Runs every end-to-end suite against a running server and summarises.
 *
 *   pnpm e2e                        # against http://localhost:3000
 *   BASE=http://localhost:3287 pnpm e2e   # against a production build
 *
 * Each suite prints "N passed, M failed" and exits 0 either way, so this
 * runner reads those lines and sets the real exit code.
 */
const { execFileSync } = require("node:child_process");
const { readdirSync } = require("node:fs");
const { join } = require("node:path");

const BASE = process.env.BASE || "http://localhost:3000";
const suites = readdirSync(__dirname)
  .filter((f) => f.endsWith(".cjs") && f !== "run.cjs")
  .sort();

let totalPass = 0;
let totalFail = 0;
const broken = [];

console.log(`Running ${suites.length} suites against ${BASE}\n`);

/**
 * Sign-in is rate limited to 3 attempts per 10 seconds per IP, and every suite
 * here comes from the same address. Run back to back they exhaust that budget
 * and a later suite fails on a 429 that has nothing to do with what it is
 * testing. The pause lets the window clear between suites.
 *
 * The limit is not the problem — it is brute-force protection working. This is
 * the cost of testing it from one machine.
 */
const SIGN_IN_WINDOW_MS = 11_000;
const sleep = (ms) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

let first = true;
for (const suite of suites) {
  if (!first) sleep(SIGN_IN_WINDOW_MS);
  first = false;

  let out = "";
  try {
    out = execFileSync(process.execPath, [join(__dirname, suite)], {
      env: { ...process.env, BASE },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 15 * 60 * 1000,
    });
  } catch (e) {
    out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }

  const summary = out.match(/(\d+) passed, (\d+) failed/);
  const failures = out
    .split("\n")
    .filter((l) => l.startsWith("FAIL") || l.includes("SWEEP FAIL"));

  if (summary) {
    const [, p, f] = summary;
    totalPass += Number(p);
    totalFail += Number(f);
    console.log(
      `${Number(f) === 0 ? "  ok  " : " FAIL "} ${suite.padEnd(20)} ${p} passed, ${f} failed`,
    );
  } else {
    totalFail += 1;
    broken.push(suite);
    console.log(` ERROR ${suite.padEnd(20)} did not report a result`);
  }

  for (const line of failures.slice(0, 5)) console.log(`         ${line}`);
}

console.log(`\n${totalPass} passed, ${totalFail} failed`);
if (broken.length) console.log(`suites that errored: ${broken.join(", ")}`);
process.exit(totalFail === 0 ? 0 : 1);
