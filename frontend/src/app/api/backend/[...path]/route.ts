import type { NextRequest } from "next/server";

import { backendApiUrl } from "@/lib/env";
import { ACCESS_COOKIE } from "@/lib/session/auth-cookies";

const UPSTREAM_TIMEOUT_MS = 30_000;
/** Tokens are only ever handled by Server Functions; the browser must not reach auth endpoints. */
const BLOCKED_PREFIXES = ["auth"];
const FORWARDED_REQUEST_HEADERS = ["content-type", "idempotency-key"];
const FORWARDED_RESPONSE_HEADERS = ["content-type", "content-disposition", "location"];

/**
 * Backend-for-frontend pass-through for Client Components: attaches the access token from the
 * httpOnly cookie so it never reaches JavaScript. The backend still authorizes every call.
 */
async function forward(request: NextRequest, context: RouteContext<"/api/backend/[...path]">): Promise<Response> {
  const { path } = await context.params;
  if (BLOCKED_PREFIXES.includes(path[0] ?? "")) {
    return problem(404, "NOT_FOUND", "Không tìm thấy tài nguyên.");
  }
  if (request.method !== "GET" && !isSameOrigin(request)) {
    return problem(403, "CROSS_SITE_REQUEST", "Yêu cầu không hợp lệ.");
  }
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) {
    return problem(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  }

  const headers = new Headers({ Authorization: `Bearer ${token}`, Accept: "application/json, text/csv, */*" });
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  const target = `${backendApiUrl}/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;
  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
    const responseHeaders = new Headers({ "Cache-Control": "no-store" });
    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) {
        responseHeaders.set(name, value);
      }
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return problem(502, "BACKEND_UNAVAILABLE", "Không kết nối được máy chủ. Vui lòng thử lại sau.");
  }
}

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) {
    return false;
  }
  try {
    return new URL(origin).host === host.split(",")[0]!.trim();
  } catch {
    return false;
  }
}

function problem(status: number, code: string, detail: string): Response {
  return Response.json({ status, code, detail }, { status, headers: { "Content-Type": "application/problem+json" } });
}

export { forward as GET, forward as POST, forward as PUT, forward as DELETE };
