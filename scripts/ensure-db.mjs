/**
 * Makes sure Postgres is up before `pnpm dev` / `pnpm build`.
 *
 * Tries whatever is available, in order:
 *   1. already listening      — nothing to do
 *   2. Docker                 — `docker compose up -d`
 *   3. a local PostgreSQL     — `pg_ctl start` on a private cluster
 *
 * Never fails the command it precedes: if none of those work the app still
 * starts and shows the setup screen, which explains what to run.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { connect } from "node:net";
import { config } from "dotenv";

config();

// Never on a server. This exists to start a *developer's* database; on the VPS
// Postgres is a systemd service and DATABASE_URL points at it. If it were ever
// down, the Docker fallback below would happily start the dev container with
// dev credentials on the dev port and the build would target the wrong
// database without saying so.
if (process.env.NODE_ENV === "production" || process.env.SKIP_DB_BOOTSTRAP) {
  process.exit(0);
}

const url = process.env.DATABASE_URL ?? "";
const port = Number(url.match(/:(\d+)\//)?.[1] ?? 5434);
const host = url.match(/@([^:/]+)/)?.[1] ?? "127.0.0.1";

const NATIVE_DATA = "C:/tmp/dbpg";
const PG_BIN = "C:/Program Files/PostgreSQL/17/bin";

function listening(timeoutMs = 700) {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function tryRun(file, args) {
  try {
    execFileSync(file, args, { stdio: "ignore", timeout: 90_000 });
    return true;
  } catch {
    return false;
  }
}

async function waitUntilUp(seconds) {
  for (let i = 0; i < seconds * 2; i++) {
    if (await listening()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

if (await listening()) {
  process.exit(0);
}

console.log(`[db] nothing on ${host}:${port} — starting Postgres…`);

if (tryRun("docker", ["compose", "up", "-d"]) && (await waitUntilUp(30))) {
  console.log("[db] Docker container is up.");
  process.exit(0);
}

if (existsSync(NATIVE_DATA) && existsSync(`${PG_BIN}/pg_ctl.exe`)) {
  tryRun(`${PG_BIN}/pg_ctl.exe`, [
    "-D",
    NATIVE_DATA,
    "-o",
    `-p ${port}`,
    "-l",
    "C:/tmp/dbpg.log",
    "start",
  ]);
  if (await waitUntilUp(20)) {
    console.log("[db] local Postgres cluster is up.");
    process.exit(0);
  }
}

console.log(
  "[db] could not start Postgres. The app will run, but pages that read data\n" +
    "     will show the setup screen. Start Docker Desktop and run `pnpm db:up`.",
);
process.exit(0);
