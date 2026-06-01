import { NextResponse, type NextRequest } from "next/server";
import { isWebAuthEnabled, verifyWebAuthSessionToken, WEB_AUTH_COOKIE_NAME } from "@/lib/web-auth";

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/logout" ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  );
}

export async function middleware(request: NextRequest) {
  if (!isWebAuthEnabled() || isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const authenticated = await verifyWebAuthSessionToken(request.cookies.get(WEB_AUTH_COOKIE_NAME)?.value);
  if (authenticated) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
