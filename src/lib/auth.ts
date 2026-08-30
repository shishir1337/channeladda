import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import { sendMail } from "@/server/mailer";

/** Matches the "at least 10 characters" promised on the sign-up screen. */
export const MIN_PASSWORD_LENGTH = 10;

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

function requireSecret() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "BETTER_AUTH_SECRET is not set. Sessions cannot be signed without it.",
    );
  }
  // Development only, and deliberately constant so a restart does not sign
  // everyone out mid-task. Production takes the branch above instead.
  return "channeladda-development-secret-not-for-production";
}

export const auth = betterAuth({
  baseURL,
  secret: requireSecret(),
  database: prismaAdapter(db, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    // Verification email still goes out on sign-up; this only controls whether
    // an unverified account may sign in. It flips to true once a real email
    // provider is connected — until then it would lock everyone out.
    requireEmailVerification: false,
    async sendResetPassword({ user, url }) {
      await sendMail({
        to: user.email,
        subject: "Reset your Channel Adda password",
        body:
          "Someone asked to reset the password on this account. " +
          "The link below works once and expires in an hour. " +
          "If this was not you, ignore this email — nothing has changed.",
        link: url,
      });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    async sendVerificationEmail({ user, token }) {
      // Built here rather than using the supplied `url` so the visitor lands
      // back on a page that says what happened, instead of silently on the
      // homepage with no confirmation that anything worked.
      const link = new URL("/api/auth/verify-email", baseURL);
      link.searchParams.set("token", token);
      link.searchParams.set("callbackURL", "/verify-email?verified=1");

      await sendMail({
        to: user.email,
        subject: "Confirm your email address",
        body: "Confirm this address to finish setting up your Channel Adda account.",
        link: link.toString(),
      });
    },
  },

  user: {
    additionalFields: {
      // `input: false` is load-bearing on every one of these. Without it the
      // sign-up endpoint would accept them from the request body, and anyone
      // could create themselves a SUPERADMIN account or an approved KYC status.
      role: {
        type: "string",
        required: false,
        input: false,
        defaultValue: "USER",
      },
      kycStatus: {
        type: "string",
        required: false,
        input: false,
        defaultValue: "NOT_STARTED",
      },
      slug: { type: "string", required: false, input: false },
      bannedAt: { type: "date", required: false, input: false },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh the expiry at most once a day
    // The session is served from a signed cookie for this long before the
    // database is consulted again, which is also how long a suspension takes
    // to bite on a session that is already open. Five minutes was too long a
    // window for someone who has just been banned for fraud; a minute still
    // removes almost all of the per-request session reads.
    cookieCache: { enabled: true, maxAge: 60 },
  },

  advanced: {
    // Session cookies must never reach JavaScript or travel over plain HTTP in
    // production; this is a marketplace holding other people's money.
    useSecureCookies: process.env.NODE_ENV === "production",
    cookiePrefix: "channeladda",
  },

  rateLimit: {
    enabled: true,
    // Better Auth already applies strict burst rules of its own: 3 per 10s on
    // anything under /sign-in and /sign-up, and 3 per 60s on password reset and
    // verification email. Those are left alone — they are the right shape, and
    // overriding them here would replace them rather than add to them.
    //
    // Only the general bucket is raised, because the header reads the session
    // on every page load, so a visitor clicking through listings is ordinary
    // traffic rather than abuse.
    window: 60,
    max: 120,
    // NOTE: counted in memory, so it resets on deploy and is per-instance.
    // More than one instance needs storage: "database" and the rateLimit
    // table. Revisit when the hosting decision is made.
    storage: "memory",
    customRules: {
      // Keyed without the /api/auth prefix: the path is normalised against the
      // base path before rules are matched.
      // Reading your own session is one call per page load and costs almost
      // nothing — the cookie cache means most do not touch the database at
      // all. It is not an abuse vector worth throttling tightly, and a shared
      // office or campus address behind one NAT can legitimately produce
      // thousands a minute. This is a backstop against a runaway client loop,
      // not a security control; the endpoints that matter are throttled by
      // Better Auth's own burst rules above.
      "/get-session": { window: 60, max: 2000 },
    },
  },

  // Must stay last: it lets Better Auth set cookies from server actions.
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
