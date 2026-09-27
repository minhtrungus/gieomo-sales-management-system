import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware ensuring 301 redirection from www to non-www (https://gieomo.store).
 */
export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";

  // Enforce 308 permanent redirect from www.gieomo.store to non-www https://gieomo.store
  if (host.startsWith("www.gieomo.store")) {
    const url = request.nextUrl.clone();
    url.host = "gieomo.store";
    url.protocol = "https";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     */
    "/((?!_next/static|_next/image).*)",
  ],
};
