import "server-only";

import { z } from "zod";

import { env } from "@/lib/env";

export const ACCESS_COOKIE = "pw_access";
export const REFRESH_COOKIE = "pw_refresh";

/** The access cookie disappears this long before the token expires, so the proxy refreshes ahead of time. */
const ACCESS_EXPIRY_SKEW_SECONDS = 60;
const MIN_ACCESS_COOKIE_SECONDS = 1;
const MILLIS_PER_SECOND = 1000;

export const authTokensSchema = z.object({
  accessToken: z.string().min(1),
  accessTokenExpiresAt: z.iso.datetime({ offset: true }),
  refreshToken: z.string().min(1),
  refreshTokenExpiresAt: z.iso.datetime({ offset: true }),
});

export type AuthTokens = z.infer<typeof authTokensSchema>;

type CookieOptions = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge?: number;
  expires?: Date;
};

export type CookieWriter = {
  set(name: string, value: string, options: CookieOptions): unknown;
  delete(name: string): unknown;
};

const baseOptions = { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: "lax", path: "/" } as const;

export function writeAuthCookies(cookies: CookieWriter, tokens: AuthTokens, now: number = Date.now()): void {
  const accessSeconds = Math.floor((Date.parse(tokens.accessTokenExpiresAt) - now) / MILLIS_PER_SECOND);
  cookies.set(ACCESS_COOKIE, tokens.accessToken, {
    ...baseOptions,
    maxAge: Math.max(MIN_ACCESS_COOKIE_SECONDS, accessSeconds - ACCESS_EXPIRY_SKEW_SECONDS),
  });
  cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseOptions,
    expires: new Date(tokens.refreshTokenExpiresAt),
  });
}

export function clearAuthCookies(cookies: CookieWriter): void {
  cookies.delete(ACCESS_COOKIE);
  cookies.delete(REFRESH_COOKIE);
}
