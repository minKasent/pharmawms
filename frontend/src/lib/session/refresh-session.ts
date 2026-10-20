import "server-only";

import { backendApiUrl } from "@/lib/env";

import { type AuthTokens, authTokensSchema } from "./auth-cookies";

export type RefreshResult =
  | { kind: "refreshed"; tokens: AuthTokens }
  | { kind: "invalid" }
  | { kind: "unavailable" };

const REFRESH_TIMEOUT_MS = 5_000;
/**
 * The backend rotates refresh tokens and treats a reused token as theft. Parallel requests that
 * arrive with the same expired session (navigation, prefetches, client queries) must therefore
 * share one rotation instead of each presenting the old token.
 */
const SHARED_RESULT_TTL_MS = 10_000;

const inFlight = new Map<string, { result: Promise<RefreshResult>; expiresAt: number }>();

export function refreshSession(refreshToken: string): Promise<RefreshResult> {
  const now = Date.now();
  for (const [token, entry] of inFlight) {
    if (entry.expiresAt <= now) {
      inFlight.delete(token);
    }
  }
  const existing = inFlight.get(refreshToken);
  if (existing) {
    return existing.result;
  }
  const result = rotate(refreshToken);
  inFlight.set(refreshToken, { result, expiresAt: now + SHARED_RESULT_TTL_MS });
  return result;
}

async function rotate(refreshToken: string): Promise<RefreshResult> {
  try {
    const response = await fetch(`${backendApiUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refreshToken }),
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (response.status === 401 || response.status === 400) {
      return { kind: "invalid" };
    }
    if (!response.ok) {
      return { kind: "unavailable" };
    }
    const tokens = authTokensSchema.safeParse(await response.json());
    return tokens.success ? { kind: "refreshed", tokens: tokens.data } : { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}
