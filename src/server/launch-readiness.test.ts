import { randomInt } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { db } from "@/lib/db";
import { seedListing, withCleanDb } from "@/test/db";

// What the live site needs that a development machine never shows: it sits
// behind Cloudflare and nginx, answers on www as well as the bare domain,
// and is read by search engines.

const fake = vi.hoisted(() => ({ userId: "", emailVerified: true }));

vi.mock("@/server/session", () => ({
  requireUser: async () => ({
    id: fake.userId,
    role: "USER",
    emailVerified: fake.emailVerified,
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

afterEach(() => {
  vi.unstubAllEnvs();
  fake.emailVerified = true;
});

// ------------------------------------------------------- visitors' addresses

/** An address nobody else in this run uses, so buckets never collide. */
function someVisitor(): string {
  return `198.51.${randomInt(0, 255)}.${randomInt(1, 254)}`;
}

async function signInFrom(headers: Record<string, string>) {
  const { auth } = await import("@/lib/auth");
  const response = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        ...headers,
      },
      body: JSON.stringify({
        email: "nobody@example.test",
        password: "not-the-password",
      }),
    }),
  );
  return response.status;
}

test("behind Cloudflare, different visitors do not share a sign-in limit", async () => {
  // Cloudflare puts the visitor in CF-Connecting-IP; nginx then appends
  // Cloudflare's own address to X-Forwarded-For, which Better Auth refuses
  // to read once it holds two. Every visitor then shared one bucket, and the
  // whole site could make three sign-in attempts every ten seconds.
  const statuses: number[] = [];
  for (let i = 0; i < 5; i++) {
    const visitor = someVisitor();
    statuses.push(
      await signInFrom({
        "cf-connecting-ip": visitor,
        "x-real-ip": "172.70.1.1",
        "x-forwarded-for": `${visitor}, 172.70.1.1`,
      }),
    );
  }
  expect(statuses).not.toContain(429);
});

test("one visitor guessing passwords is still limited", async () => {
  const visitor = someVisitor();
  const statuses: number[] = [];
  for (let i = 0; i < 5; i++) {
    statuses.push(
      await signInFrom({
        "cf-connecting-ip": visitor,
        "x-real-ip": "172.70.1.1",
        "x-forwarded-for": `${visitor}, 172.70.1.1`,
      }),
    );
  }
  expect(statuses).toContain(429);
});

test("the audit trail records the visitor, not a forwarded address they typed", async () => {
  const { clientIp } = await import("@/lib/client-ip");
  // The first X-Forwarded-For entry is whatever the browser sent.
  expect(
    clientIp(
      new Headers({
        "x-forwarded-for": "6.6.6.6, 198.51.100.7, 172.70.1.1",
        "cf-connecting-ip": "198.51.100.7",
        "x-real-ip": "172.70.1.1",
      }),
    ),
  ).toBe("198.51.100.7");
  // Without Cloudflare, nginx's X-Real-IP is the visitor.
  expect(
    clientIp(
      new Headers({
        "x-forwarded-for": "6.6.6.6, 198.51.100.8",
        "x-real-ip": "198.51.100.8",
      }),
    ),
  ).toBe("198.51.100.8");
  expect(clientIp(new Headers())).toBeNull();
});

// -------------------------------------------------------------------- www

test("www sends visitors to the bare domain, where sign-in works", async () => {
  // Sign-in only accepts requests from BETTER_AUTH_URL's origin, so on www
  // every sign-in answered 403.
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://channeladda.com");
  const { default: config } = await import("../../next.config");
  expect(await config.redirects?.()).toContainEqual({
    source: "/:path*",
    has: [{ type: "host", value: "www.channeladda.com" }],
    destination: "https://channeladda.com/:path*",
    permanent: true,
  });
});

test("a development machine gets no www redirect", async () => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  const { default: config } = await import("../../next.config");
  expect(await config.redirects?.()).toEqual([]);
});

// ------------------------------------------------------- search engines

test("robots.txt keeps crawlers out of private pages and names the sitemap", async () => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://channeladda.com");
  const { default: robots } = await import("@/app/robots");
  const result = robots();
  const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;
  expect(rule?.allow).toBe("/");
  for (const path of ["/admin", "/dashboard", "/api/"]) {
    expect(rule?.disallow).toContain(path);
  }
  // Listing artwork is served from /uploads; private files there are
  // checked per request, and blocking the folder would hide the artwork
  // from search and link previews.
  expect(rule?.disallow).not.toContain("/uploads/");
  expect(result.sitemap).toBe("https://channeladda.com/sitemap.xml");
});

test(
  "the sitemap lists public pages and live listings, never a draft",
  withCleanDb(async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://channeladda.com");
    const live = await seedListing();
    const draft = await seedListing({ listingStatus: "DRAFT" });
    const { default: sitemap } = await import("@/app/sitemap");
    const urls = (await sitemap()).map((entry) => entry.url);

    expect(urls).toContain("https://channeladda.com/");
    expect(urls).toContain("https://channeladda.com/browse");
    expect(urls).toContain(
      `https://channeladda.com/listing/${live.listing.slug}`,
    );
    expect(urls).toContain(
      `https://channeladda.com/seller/${live.seller.slug}`,
    );
    expect(urls).not.toContain(
      `https://channeladda.com/listing/${draft.listing.slug}`,
    );
    expect(urls.some((url) => /\/(admin|dashboard|signin)/.test(url))).toBe(
      false,
    );
  }),
);

// ------------------------------------------------- a confirmed email address

test(
  "an unconfirmed email cannot open a deal",
  withCleanDb(async () => {
    // The dashboard promises buying and selling stay locked until the
    // address is confirmed; only offers were.
    vi.stubEnv("NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION", "true");
    const { listing, buyer } = await seedListing();
    fake.userId = buyer.id;
    fake.emailVerified = false;
    const { startDeal } = await import("@/server/actions/deals");

    const result = await startDeal(listing.id, "FASTEST", true);
    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? "" : result.error).toMatch(/confirm your email/i);
    expect(await db.order.count()).toBe(0);

    fake.emailVerified = true;
    expect(
      await startDeal(listing.id, "FASTEST", true, "buyer@gmail.com"),
    ).toMatchObject({ ok: true });
  }),
);

test(
  "with email confirmation turned off, an unconfirmed email can open a deal",
  withCleanDb(async () => {
    // NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION=false, as it was for testing
    // from 2026-10-24 to 2026-10-26.
    vi.stubEnv("NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION", "false");
    const { listing, buyer } = await seedListing();
    fake.userId = buyer.id;
    fake.emailVerified = false;
    const { startDeal } = await import("@/server/actions/deals");

    expect(
      await startDeal(listing.id, "FASTEST", true, "buyer@gmail.com"),
    ).toMatchObject({ ok: true });
  }),
);

test(
  "an unconfirmed email cannot send a listing for review",
  withCleanDb(async () => {
    const { listing, seller } = await seedListing({
      listingStatus: "CODE_CHECK",
    });
    vi.stubEnv("NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION", "true");
    fake.userId = seller.id;
    fake.emailVerified = false;
    const { submitForReview } = await import("@/server/actions/listings");
    const { checkOwnershipCode } = await import(
      "@/server/actions/channel-lookup"
    );

    const submitted = await submitForReview(listing.id);
    expect(submitted.ok).toBe(false);
    expect(JSON.stringify(submitted)).toMatch(/confirm your email/i);

    const checked = await checkOwnershipCode(listing.id);
    expect(checked.ok).toBe(false);
    expect(JSON.stringify(checked)).toMatch(/confirm your email/i);

    const row = await db.listing.findUniqueOrThrow({
      where: { id: listing.id },
      select: { status: true },
    });
    expect(row.status).toBe("CODE_CHECK");
  }),
);
