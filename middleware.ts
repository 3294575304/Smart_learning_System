import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/services/auth/constants";

export function middleware(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE_NAME)) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set(
    "next",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/teacher/:path*",
    "/student/:path*",
  ],
};
