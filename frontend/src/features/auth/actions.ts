"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { toApiError } from "@/lib/api/api-error";
import { backendApiUrl } from "@/lib/env";
import { REFRESH_COOKIE, authTokensSchema, clearAuthCookies, writeAuthCookies } from "@/lib/session/auth-cookies";
import { LOGIN_PATH, resolveDemoTargetPath, safeReturnPath } from "@/lib/session/paths";

const AUTH_TIMEOUT_MS = 10_000;
const MAX_USERNAME_LENGTH = 64;
const MAX_PASSWORD_LENGTH = 128;

const DEMO_CREDENTIALS: Record<string, string> = {
  duocsi: "Demo@123",
  thukho: "Demo@123",
  muahang: "Demo@123",
  admin: "Demo@123",
};

const loginSchema = z.object({
  username: z.string().trim().min(1, "Vui lòng nhập tên đăng nhập.").max(MAX_USERNAME_LENGTH),
  password: z.string().min(1, "Vui lòng nhập mật khẩu.").max(MAX_PASSWORD_LENGTH),
  next: z.string().optional(),
});

export type LoginState = {
  username: string;
  formError?: string;
  fieldErrors?: { username?: string; password?: string };
};

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  const username = String(formData.get("username") ?? "");
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return { username, fieldErrors: { username: fieldErrors.username?.[0], password: fieldErrors.password?.[0] } };
  }

  let response: Response;
  try {
    response = await fetch(`${backendApiUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ username: parsed.data.username, password: parsed.data.password }),
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return { username, formError: "Không kết nối được máy chủ. Vui lòng thử lại sau." };
  }
  if (!response.ok) {
    return { username, formError: (await toApiError(response)).message };
  }

  const tokens = authTokensSchema.parse(await response.json());
  writeAuthCookies(await cookies(), tokens);
  redirect(safeReturnPath(parsed.data.next));
}

export async function logout(): Promise<void> {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    await fetch(`${backendApiUrl}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
      cache: "no-store",
    }).catch(() => undefined);
  }
  clearAuthCookies(store);
  redirect(LOGIN_PATH);
}

export async function switchDemoRole(formData: FormData): Promise<void> {
  const username = String(formData.get("username") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "/");
  const password = DEMO_CREDENTIALS[username];
  if (!password) {
    return;
  }

  const store = await cookies();
  const previousRefresh = store.get(REFRESH_COOKIE)?.value;
  if (previousRefresh) {
    await fetch(`${backendApiUrl}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: previousRefresh }),
      signal: AbortSignal.timeout(3_000),
      cache: "no-store",
    }).catch(() => undefined);
  }

  let response: Response;
  try {
    response = await fetch(`${backendApiUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    redirect(LOGIN_PATH);
  }
  if (!response.ok) {
    redirect(LOGIN_PATH);
  }

  const tokens = authTokensSchema.parse(await response.json());
  writeAuthCookies(store, tokens);
  redirect(resolveDemoTargetPath(username, returnTo));
}
