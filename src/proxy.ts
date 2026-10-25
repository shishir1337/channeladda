import { type NextRequest, NextResponse } from "next/server";
import { PATH_HEADER, unknownPlatformPath } from "@/lib/proxy-rules";

/**
 * Two checks that have to happen before a page starts rendering.
 *
 * An unknown platform — /browse/myspace — showed the not-found page with a
 * 200: the browse pages stream behind a loading skeleton, and once a stream
 * has started its status cannot change. Search engines file that as a soft
 * 404. The five platforms are a fixed list, so the answer is known from the
 * address alone, and the request is sent to an address no route matches,
 * which renders the site's not-found page with a real 404.
 *
 * The staff area's layout sends a signed-out visitor to sign in, and has no
 * way to know which page they were opening: the address is handed to it in
 * a request header, so sign-in can bring them back to it. The header is set
 * here on every request to /admin, so a value sent by the browser is always
 * replaced, and `safeNext` checks it again where it is read.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const missing = unknownPlatformPath(pathname);
  if (missing) {
    return NextResponse.rewrite(new URL(missing, request.url));
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const headers = new Headers(request.headers);
    headers.set(PATH_HEADER, `${pathname}${search}`);
    return NextResponse.next({ request: { headers } });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/browse/:platform", "/admin", "/admin/:path*"],
};
