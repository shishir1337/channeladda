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
    return [{ source: "/:path*", headers: securityHeaders }];
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
