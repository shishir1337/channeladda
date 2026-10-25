import type { NextConfig } from "next";

/**
 * Headers are set here rather than only in nginx so they survive a change of
 * proxy, and so a developer running `next start` sees the same policy the
 * public site has. HSTS is deliberately *not* here — it belongs with whatever
 * terminates TLS, and setting it on a plain-HTTP dev server is a good way to
 * make localhost unreachable in your own browser for the next two years.
 */
const securityHeaders = [
  // Stops a browser second-guessing a Content-Type. Upload responses depend on
  // this: an uploaded file must never be re-interpreted as script.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Nothing on this site should ever be framed. Clickjacking a "confirm
  // handover" button is the obvious attack.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The site's own pages may ask for the camera and microphone — the ID
  // check records its selfie video on the page — and nothing framed in them
  // may. Location and payment stay off.
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=(), payment=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

/**
 * The parts of a Content-Security-Policy that cannot break a page: no
 * framing (the modern form of X-Frame-Options), no <base> pointing links
 * somewhere else, no form posting off the site, no plugins. Script and
 * style sources are deliberately not restricted — Next inlines its own
 * bootstrapping scripts, and a policy that blocked them would blank every
 * page. Payment pages are reached by navigation, not by a form, so
 * form-action 'self' leaves checkout alone.
 *
 * Not on /uploads: a header set here replaces the one a route sets, and the
 * uploads route sends its own, stricter `default-src 'none'; sandbox` so an
 * uploaded file can never run as a page on our origin.
 */
const pagePolicy = [
  {
    key: "Content-Security-Policy",
    value:
      "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
];

/**
 * Artwork shipped with the site: the sample covers and avatars, the email
 * mark. Without this Next sends them with max-age=0, so every page view
 * asked for every picture again. A month, then served stale while it is
 * fetched again, because these files can change on a deploy — they are not
 * named by their contents the way /_next/static is.
 */
const staticMediaCache = [
  {
    key: "Cache-Control",
    value: "public, max-age=2592000, stale-while-revalidate=86400",
  },
];

const nextConfig: NextConfig = {
  reactCompiler: true,

  // Fail the build on a type error rather than shipping one. This is the
  // default; it is written down because a future "just get it deployed"
  // afternoon is exactly when someone reaches for the override. (There is no
  // eslint key in Next 16, and this project lints with Biome regardless.)
  typescript: { ignoreBuildErrors: false },

  // The proxy sets X-Forwarded-*; without this Next builds absolute URLs from
  // the internal address and redirects land on http://localhost:3000.
  poweredByHeader: false,

  // Next logs every Server Function call with its arguments in development —
  // and the arguments here include passwords: accepting a staff invitation
  // printed the new teammate's password in the terminal. Dev logs get pasted
  // into chats and tickets, so the arguments are never logged.
  logging: { serverFunctions: false },

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/:path((?!uploads/).*)", headers: pagePolicy },
      { source: "/media/:path*", headers: staticMediaCache },
      { source: "/email/:path*", headers: staticMediaCache },
    ];
  },

  // Listing covers and account pictures are uploaded at full size — a
  // 1600-pixel cover was sent to a 290-pixel card, a 600-pixel avatar to a
  // 48-pixel circle. They go through the image optimiser, which resizes them
  // for the screen and caches the result. Only the public kinds: a proof
  // screenshot, a chat file or an ID photo is permission-checked, and the
  // optimiser fetches without the visitor's cookie, so those are never
  // allowed here (see `src/lib/image.ts`).
  images: {
    localPatterns: [
      { pathname: "/uploads/cover/**", search: "" },
      { pathname: "/uploads/avatar/**", search: "" },
    ],
    qualities: [75],
    // A file never changes under its key, so a resized copy is good for as
    // long as the original is.
    minimumCacheTTL: 31_536_000,
  },

  // One address for the whole site. Sign-in only answers requests from
  // BETTER_AUTH_URL's own origin, so on www every sign-in failed with a 403
  // that told the visitor nothing.
  async redirects() {
    const site = new URL(
      process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    );
    const bare =
      site.hostname.includes(".") &&
      !site.hostname.startsWith("www.") &&
      !/^[\d.]+$/.test(site.hostname);
    if (!bare) return [];
    return [
      {
        source: "/:path*",
        has: [{ type: "host" as const, value: `www.${site.hostname}` }],
        destination: `${site.origin}/:path*`,
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
