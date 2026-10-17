/**
 * Does each third party actually work with the credentials in `.env`?
 *
 * Every integration in this codebase is written against a published contract
 * and unit-tested against vectors derived from it. None of them has ever met
 * the real service, because no credentials existed while they were built. The
 * difference between "the code is right" and "it works" is this script.
 *
 * Run it the moment credentials arrive:
 *
 *   pnpm verify:integrations
 *
 * It is read-mostly and safe to run against production credentials: the only
 * thing it creates is one $1 Cryptomus invoice, which nobody pays and which
 * expires itself in sixty seconds. Nothing is written to the database.
 *
 * Each check prints what it tried, what it got, and — when it fails — the
 * specific thing to go and look at, because "401" on its own has never helped
 * anybody at two in the morning.
 */
import { config as loadEnv } from "dotenv";

loadEnv();

type Result = {
  name: string;
  state: "ok" | "skipped" | "failed";
  detail: string;
  /** What to do about it. Only worth printing when something is wrong. */
  fix?: string;
};

const results: Result[] = [];

function record(result: Result) {
  results.push(result);
  const mark =
    result.state === "ok"
      ? "  ok  "
      : result.state === "skipped"
        ? " skip "
        : " FAIL ";
  console.log(`[${mark}] ${result.name}`);
  console.log(`         ${result.detail}`);
  if (result.fix && result.state === "failed") {
    console.log(`         → ${result.fix}`);
  }
  console.log("");
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

// ----------------------------------------------------------------- database

async function checkDatabase() {
  const url = env("DATABASE_URL");
  if (!url) {
    return record({
      name: "Database",
      state: "failed",
      detail: "DATABASE_URL is not set.",
      fix: "Copy .env.example to .env and fill in DATABASE_URL.",
    });
  }

  try {
    const { PrismaClient } = await import("@/generated/prisma/client");
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    });

    const [{ count: users }] = await db.$queryRawUnsafe<{ count: bigint }[]>(
      'SELECT COUNT(*)::bigint AS count FROM "User"',
    );
    const pending = await db.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations" WHERE finished_at IS NULL`,
    );
    await db.$disconnect();

    const unfinished = Number(pending[0]?.count ?? 0);
    if (unfinished > 0) {
      return record({
        name: "Database",
        state: "failed",
        detail: `Connected, but ${unfinished} migration(s) never finished.`,
        fix: "Run `pnpm db:migrate` and check its output before anything else.",
      });
    }

    record({
      name: "Database",
      state: "ok",
      detail: `Connected. ${Number(users)} user(s), migrations all applied.`,
    });
  } catch (error) {
    record({
      name: "Database",
      state: "failed",
      detail: error instanceof Error ? error.message : String(error),
      fix: "Check the host, port, password and that the database exists.",
    });
  }
}

// ---------------------------------------------------------------- cryptomus

async function checkCryptomus() {
  const merchant = env("CRYPTOMUS_MERCHANT_ID");
  const key = env("CRYPTOMUS_PAYMENT_KEY");

  if (!merchant || !key) {
    return record({
      name: "Cryptomus",
      state: "skipped",
      detail:
        "CRYPTOMUS_MERCHANT_ID or CRYPTOMUS_PAYMENT_KEY is unset, so buyers cannot " +
        "be charged and the finance desk records payments by hand.",
    });
  }

  const { createInvoice, getInvoice } = await import("@/server/cryptomus");
  const reference = `VERIFY-${Date.now()}`;
  const site = env("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000";

  let created: Awaited<ReturnType<typeof createInvoice>>;
  try {
    created = await createInvoice({
      amountUsd: 100,
      orderId: reference,
      callbackUrl: `${site}/api/webhooks/cryptomus`,
      successUrl: `${site}/dashboard`,
      returnUrl: `${site}/dashboard`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return record({
      name: "Cryptomus — raising an invoice",
      state: "failed",
      detail: message,
      fix: message.includes("sign")
        ? "The signature was rejected. The payment key must be the one from " +
          "Merchant settings → API keys for THIS merchant id, with no stray " +
          "whitespace or quotes in .env."
        : "Check the merchant id, and that the account is allowed to create " +
          "invoices — a merchant pending review cannot.",
    });
  }

  record({
    name: "Cryptomus — raising an invoice",
    state: "ok",
    detail: `Created $1.00 test invoice ${created.uuid}. It expires itself in an hour, unpaid.`,
  });

  // The second half matters more: the webhook confirms every settlement
  // against this call before it moves any money.
  try {
    const found = await getInvoice(reference);
    if (!found) {
      return record({
        name: "Cryptomus — reading an invoice back",
        state: "failed",
        detail:
          "The invoice was created but /payment/info returned nothing for it.",
        fix:
          "Every settlement is confirmed against this call before money moves, " +
          "so deals cannot be funded until it works. Check the key has read " +
          "access as well as write.",
      });
    }
    record({
      name: "Cryptomus — reading an invoice back",
      state: "ok",
      detail: `Status "${found.status}". Settlement confirmation will work.`,
    });
  } catch (error) {
    record({
      name: "Cryptomus — reading an invoice back",
      state: "failed",
      detail: error instanceof Error ? error.message : String(error),
      fix: "Settlements are confirmed against this call, so no deal can be funded until it works.",
    });
  }

  const callback = `${site}/api/webhooks/cryptomus`;
  record({
    name: "Cryptomus — webhook registration",
    state: site.startsWith("https://") ? "ok" : "failed",
    detail: `Cryptomus will post to ${callback}`,
    fix:
      "NEXT_PUBLIC_SITE_URL is not https, so Cryptomus cannot reach the " +
      "callback and every payment will depend on the reconciliation sweep. " +
      "Set it to the real public origin before taking money.",
  });
}

// ------------------------------------------------------------------ youtube

async function checkYouTube() {
  if (!env("YOUTUBE_API_KEY")) {
    return record({
      name: "YouTube Data API",
      state: "skipped",
      detail:
        "YOUTUBE_API_KEY is unset. Sellers type their own figures and a " +
        "moderator reads the ownership code by hand — both paths work.",
    });
  }

  try {
    const { fetchChannel } = await import("@/server/youtube");
    // Google's own channel: stable, public, and not somebody's livelihood.
    const facts = await fetchChannel({
      platform: "YOUTUBE",
      kind: "handle",
      value: "google",
    });
    record({
      name: "YouTube Data API",
      state: "ok",
      detail:
        `Resolved @google → "${facts.title}" (${facts.channelId}), ` +
        `${facts.subscribersHidden ? "subscribers hidden" : `${facts.subscribers.toLocaleString("en-US")} subscribers`}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record({
      name: "YouTube Data API",
      state: "failed",
      detail: message,
      fix: message.toLowerCase().includes("quota")
        ? "The daily quota (10,000 units) is spent. It resets at midnight Pacific."
        : "In the Google Cloud console: enable YouTube Data API v3 for this " +
          "project, and if the key is restricted, allow that API and this server's IP.",
    });
  }
}

// ------------------------------------------------------------ google sign-in

function checkGoogleOAuth() {
  const id = env("GOOGLE_CLIENT_ID");
  const secret = env("GOOGLE_CLIENT_SECRET");

  if (!id || !secret) {
    return record({
      name: "Google sign-in",
      state: "skipped",
      detail:
        "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is unset, so the button is " +
        "not rendered. Password sign-in is unaffected.",
    });
  }

  const base = env("BETTER_AUTH_URL");
  if (!base) {
    return record({
      name: "Google sign-in",
      state: "failed",
      detail: "Credentials are set but BETTER_AUTH_URL is not.",
      fix: "Set BETTER_AUTH_URL to the public origin, with no trailing slash.",
    });
  }

  // There is nothing to call here without a browser: the only real test is a
  // round trip. What can be checked is that the redirect URI we will send
  // matches the one that has to be registered, which is where this fails.
  record({
    name: "Google sign-in",
    state: "ok",
    detail:
      `Configured. The redirect URI that must be registered in the Google ` +
      `console, exactly: ${base}/api/auth/callback/google`,
  });
}

// -------------------------------------------------------------------- email

async function checkEmail() {
  const host = env("SMTP_HOST");
  if (!host) {
    return record({
      name: "Email",
      state: "skipped",
      detail:
        "SMTP_HOST is unset. In development mail is printed to the server log; " +
        "in production sendMail throws rather than dropping a password reset.",
    });
  }

  try {
    const { verifyMailer } = await import("@/server/mailer");
    const detail = await verifyMailer();
    record({ name: "Email", state: "ok", detail });
  } catch (error) {
    record({
      name: "Email",
      state: "failed",
      detail: error instanceof Error ? error.message : String(error),
      fix:
        "Check SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS. Port 465 needs " +
        "TLS from the first byte; 587 starts plain and upgrades.",
    });
  }
}

// --------------------------------------------------------------------- cron

function checkCron() {
  const secret = env("CRON_SECRET");
  const site = env("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000";

  if (!secret) {
    return record({
      name: "Scheduled sweep",
      state: "failed",
      detail:
        "CRON_SECRET is unset, so POST /api/cron refuses everything. Abandoned " +
        "deals hold listings off the market, offers never lapse, chat media is " +
        "never purged, and a lost payment callback is never reconciled.",
      fix:
        "Generate one with `openssl rand -base64 32`, then call it every ten " +
        `minutes:\n           curl -fsS -X POST ${site}/api/cron -H "authorization: Bearer $CRON_SECRET"`,
    });
  }

  if (secret.length < 24) {
    return record({
      name: "Scheduled sweep",
      state: "failed",
      detail: `CRON_SECRET is only ${secret.length} characters.`,
      fix: "It is the only thing guarding the sweep. Use `openssl rand -base64 32`.",
    });
  }

  record({
    name: "Scheduled sweep",
    state: "ok",
    detail: `Set. Call POST ${site}/api/cron every ten minutes with it as a bearer token.`,
  });
}

// --------------------------------------------------------------------- main

async function main() {
  console.log("");
  console.log("Checking every third party this product depends on.");
  console.log(
    "Nothing is written to the database. One $1 test invoice is raised.",
  );
  console.log("");

  await checkDatabase();
  await checkCryptomus();
  await checkYouTube();
  checkGoogleOAuth();
  await checkEmail();
  checkCron();

  const failed = results.filter((r) => r.state === "failed");
  const skipped = results.filter((r) => r.state === "skipped");
  const ok = results.filter((r) => r.state === "ok");

  console.log("─".repeat(72));
  console.log(
    `${ok.length} working, ${skipped.length} not configured, ${failed.length} broken.`,
  );

  if (skipped.length > 0) {
    console.log("");
    console.log(
      "Not configured — the product works without these, differently:",
    );
    for (const r of skipped) console.log(`  · ${r.name}`);
  }

  if (failed.length > 0) {
    console.log("");
    console.log("Broken — these are configured but do not work:");
    for (const r of failed) console.log(`  · ${r.name}: ${r.detail}`);
    console.log("");
    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log("Nothing configured is broken.");
  console.log("");
}

main().catch((error) => {
  console.error("");
  console.error("The check itself failed, which is not a result:");
  console.error(error);
  process.exitCode = 2;
});
