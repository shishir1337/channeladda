import "server-only";

/**
 * Counts tries per signed-in member, for the account changes that run as
 * server actions.
 *
 * Better Auth's own limiter only sees requests to /api/auth. The security
 * page calls Better Auth from server actions instead (so the password check,
 * the notice email and the audit row cannot be skipped), and those calls
 * never pass through it. This is the stand-in: keyed by the member rather
 * than the address, because the person has already proved a session and a
 * shared office network should not lock out the colleague next to them.
 *
 * Counted in memory, as Better Auth's limiter is here (`rateLimit.storage`
 * in `@/lib/auth`): it resets on deploy and is per instance. That is enough
 * to turn guessing a password from a session into something slower than
 * asking for a reset.
 */
export type Limit = { max: number; windowMs: number };

type Entry = { count: number; until: number };

const globalForLimits = globalThis as unknown as {
  accountAttempts?: Map<string, Entry>;
};
// On globalThis, so a hot reload in development does not forget the count.
globalForLimits.accountAttempts ??= new Map();
const store: Map<string, Entry> = globalForLimits.accountAttempts;

/** Never more than this many keys; the oldest go first. */
const MAX_KEYS = 50_000;

function live(key: string, now: number): Entry | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.until <= now) {
    store.delete(key);
    return null;
  }
  return entry;
}

/** True when `key` has used up its tries for now. */
export function isLimited(key: string, limit: Limit, now = Date.now()) {
  return (live(key, now)?.count ?? 0) >= limit.max;
}

/** One more try against `key`. The window starts at the first. */
export function countAttempt(key: string, limit: Limit, now = Date.now()) {
  const entry = live(key, now);
  if (entry) {
    entry.count += 1;
    return;
  }
  if (store.size >= MAX_KEYS) {
    for (const [stale, value] of store) {
      if (value.until <= now) store.delete(stale);
    }
    // Still full: a Map keeps insertion order, so the first key is oldest.
    for (const oldest of store.keys()) {
      if (store.size < MAX_KEYS) break;
      store.delete(oldest);
    }
  }
  store.set(key, { count: 1, until: now + limit.windowMs });
}

/** A success wipes the slate, as a correct password does at sign-in. */
export function clearAttempts(key: string) {
  store.delete(key);
}
