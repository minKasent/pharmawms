import { type NextRequest, NextResponse } from "next/server";

import { ACCESS_COOKIE, REFRESH_COOKIE, clearAuthCookies, writeAuthCookies } from "@/lib/session/auth-cookies";
import { HOME_PATH, LOGIN_PATH, RETURN_TO_PARAM, isSessionExpiredRedirect, safeReturnPath } from "@/lib/session/paths";
import { refreshSession } from "@/lib/session/refresh-session";

const API_PREFIX = "/api/";

/**
 * Optimistic session gate: keeps the access cookie fresh by rotating the refresh token before
 * pages, Server Functions and BFF calls run. Authorization itself is enforced by the backend.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isLoginPage = pathname === LOGIN_PATH;
  const isApi = pathname.startsWith(API_PREFIX);
  // The backend already rejected this access cookie (revoked, or signed with a rotated key), so
  // trusting it again would bounce between the login page and home forever.
  const isAccessRejected = isSessionExpiredRedirect(request.nextUrl);

  if (request.cookies.has(ACCESS_COOKIE) && !isAccessRejected) {
    return isLoginPage ? NextResponse.redirect(new URL(HOME_PATH, request.url)) : NextResponse.next();
  }

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    const response = isLoginPage ? NextResponse.next() : unauthenticated(request, isApi, `${pathname}${search}`);
    clearAuthCookies(response.cookies);
    return response;
  }

  const result = await refreshSession(refreshToken);
  if (result.kind === "unavailable") {
    return isApi ? problem(503, "BACKEND_UNAVAILABLE", "Máy chủ đang không phản hồi. Vui lòng thử lại sau.") : NextResponse.next();
  }
  if (result.kind === "invalid") {
    const response = isLoginPage ? NextResponse.next() : unauthenticated(request, isApi, `${pathname}${search}`);
    clearAuthCookies(response.cookies);
    return response;
  }

  request.cookies.set(ACCESS_COOKIE, result.tokens.accessToken);
  request.cookies.set(REFRESH_COOKIE, result.tokens.refreshToken);
  const response = isLoginPage
    ? NextResponse.redirect(new URL(safeReturnPath(request.nextUrl.searchParams.get(RETURN_TO_PARAM)), request.url))
    : NextResponse.next({ request: { headers: request.headers } });
  writeAuthCookies(response.cookies, result.tokens);
  return response;
}

function unauthenticated(request: NextRequest, isApi: boolean, returnTo: string): NextResponse {
  if (isApi) {
    return problem(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  }
  const loginUrl = new URL(LOGIN_PATH, request.url);
  if (returnTo !== HOME_PATH) {
    loginUrl.searchParams.set(RETURN_TO_PARAM, returnTo);
  }
  return NextResponse.redirect(loginUrl);
}

function problem(status: number, code: string, detail: string): NextResponse {
  return NextResponse.json({ status, code, detail }, { status, headers: { "Content-Type": "application/problem+json" } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
