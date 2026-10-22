import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { emailOTP, twoFactor } from "better-auth/plugins";
import { CLIENT_IP_HEADERS } from "@/lib/client-ip";
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

/**
 * "Continue with Google", when it is configured.
 *
 * Returned empty rather than with placeholder credentials when the id and
 * secret are absent: Better Auth would otherwise advertise a provider that
 * cannot complete, and the failure arrives as a redirect loop on Google's
 * side rather than as anything this app can explain.
 */
function socialProviders() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return {};

  return {
    google: {
      clientId,
      clientSecret,
      // Ask for nothing beyond identity. A marketplace has no business
      // holding a token that can read somebody's YouTube account, and a
      // seller being asked for channel scopes at sign-in would be right to
      // close the tab.
      scope: ["openid", "email", "profile"],
      // Google verifies the address itself, so a Google sign-in arrives
      // already verified and should not be sent round the email loop.
      mapProfileToUser: (profile: { email_verified?: boolean }) => ({
        emailVerified: profile.email_verified === true,
      }),
    },
  };
}

/** Whether the Google button should be drawn at all. */
export function isGoogleEnabled(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
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
        action: "Reset password",
      });
    },
  },

  // The address is confirmed with a six-digit code typed on /verify-email,
  // sent by the emailOTP plugin below. There is deliberately no
  // sendVerificationEmail here: Better Auth merges a plugin's settings under
  // these, so one written here would quietly keep sending links.
  emailVerification: {
    sendOnSignUp: true,
    // Off: a code proves the inbox, not the password, so it must not open a
    // session — on an account with two-factor that would walk round both.
    // Someone who signed up is already signed in and simply stays so.
    autoSignInAfterVerification: false,
    // Better Auth only keeps a yes or no; the audit trail wants the moment.
    async afterEmailVerification(user) {
      await db.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
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
    // Who is asking, for the rate limits below. Behind Cloudflare and nginx,
    // X-Forwarded-For holds two addresses and Better Auth will not guess
    // between them; left at its default, every visitor fell into one shared
    // bucket and the whole site got three sign-in attempts per ten seconds.
    ipAddress: { ipAddressHeaders: [...CLIENT_IP_HEADERS] },
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

  // The emailOTP plugin brings passwordless sign-in, password reset and email
  // change by code along with verification. Only verification is wanted:
  // sign-in by code would walk round the password and two-factor, and reset
  // and email change already have their own reviewed flows.
  disabledPaths: [
    "/sign-in/email-otp",
    "/email-otp/request-password-reset",
    "/email-otp/reset-password",
    "/forget-password/email-otp",
    "/email-otp/request-email-change",
    "/email-otp/change-email",
  ],

  socialProviders: socialProviders(),

  account: {
    accountLinking: {
      enabled: true,
      // Without this, Better Auth refuses to link a Google sign-in to an
      // existing password account unless that account's email is already
      // verified — and with no email provider wired, no account's ever is.
      // So anyone who signed up with a password and later pressed the Google
      // button got an opaque failure with no way out of it.
      //
      // Trusting Google here is sound: it is authoritative for its own
      // addresses, and mapProfileToUser still refuses to assume a
      // verification Google did not actually assert.
      trustedProviders: ["google"],
    },
  },

  plugins: [
    twoFactor({
      // What an authenticator app shows next to the code.
      issuer: "Channel Adda",
      // A Google-only account has no password to confirm with, and refusing
      // to let those users protect themselves would be the wrong way round.
      // A password is still demanded from anyone who has one.
      allowPasswordless: true,
      // Ten wrong codes locks the account for fifteen minutes. This is the
      // control that stops a six-digit code being brute-forced; Better Auth's
      // per-route rate limit alone is not enough for a 1-in-a-million secret.
      accountLockout: {
        enabled: true,
        maxFailedAttempts: 10,
        durationSeconds: 900,
      },
      // The default. Written down because a shorter window would strand
      // someone fetching their phone, and a longer one leaves a half-signed-in
      // session lying around.
      twoFactorCookieMaxAge: 600,
    }),
    emailOTP({
      overrideDefaultEmailVerification: true,
      otpLength: 6,
      // Ten minutes: time to switch to the mail app and back, not long
      // enough for a code in an old email to still be worth anything.
      expiresIn: 600,
      // A typo or two, then a new code. Five guesses at a million codes,
      // behind a rate limit, is not a way in.
      allowedAttempts: 5,
      rateLimit: { window: 60, max: 5 },
      // A copy of the database must not hold codes that still work.
      storeOTP: "hashed",
      // An unknown address gets nothing: accounts are made on the sign-up
      // form, which asks for a name, a password and the terms.
      disableSignUp: true,
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== "email-verification") return;
        await sendMail({
          to: email,
          subject: `${otp} is your Channel Adda code`,
          heading: "Confirm your email address",
          body:
            "Enter this code on Channel Adda to confirm your email address. " +
            "It works once and expires in 10 minutes. " +
            "If you did not sign up, ignore this email.",
          code: otp,
        });
      },
    }),
    // Must stay last: it lets Better Auth set cookies from server actions.
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
