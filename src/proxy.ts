import { type NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/cookies";

const PRIVATE_ROUTE_PREFIX = "/dashboard";

const AUTH_ROUTES = ["/auth/v1/login", "/auth/v1/register", "/auth/v2/login", "/auth/v2/register"];

const DEFAULT_REDIRECT_AFTER_LOGIN = "/dashboard/default";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  const isPrivateRoute = pathname.startsWith(PRIVATE_ROUTE_PREFIX);
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  if (isPrivateRoute && !sessionCookie) {
    const loginUrl = new URL("/auth/v2/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthRoute && sessionCookie) {
    return NextResponse.redirect(new URL(DEFAULT_REDIRECT_AFTER_LOGIN, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/auth/v1/:path*", "/auth/v2/:path*"],
};
