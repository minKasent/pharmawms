import "server-only";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { z } from "zod";

import { backendApiUrl } from "@/lib/env";
import { ACCESS_COOKIE } from "@/lib/session/auth-cookies";
import { LOGIN_PATH, sessionExpiredPath } from "@/lib/session/paths";

import { toApiError } from "./api-error";

const BACKEND_TIMEOUT_MS = 15_000;
const NOT_FOUND = 404;

/**
 * Reads from the backend on behalf of the signed-in user (Server Components only). Reads the
 * session cookie, so callers must render behind a Suspense boundary.
 */
export async function backendGet<Schema extends z.ZodType>(path: string, schema: Schema): Promise<z.infer<Schema>> {
  const response = await authorizedGet(path);
  if (response.status === NOT_FOUND) {
    notFound();
  }
  return parse(response, schema);
}

/** Resolves to null when the backend answers with one of {@link missingStatuses} (e.g. model not trained yet). */
export async function backendGetOptional<Schema extends z.ZodType>(
  path: string,
  schema: Schema,
  missingStatuses: readonly number[] = [NOT_FOUND],
): Promise<z.infer<Schema> | null> {
  const response = await authorizedGet(path);
  if (missingStatuses.includes(response.status)) {
    return null;
  }
  return parse(response, schema);
}

async function authorizedGet(path: string): Promise<Response> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) {
    redirect(LOGIN_PATH);
  }
  const response = await fetch(`${backendApiUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    cache: "no-store",
  });
  if (response.status === 401) {
    redirect(sessionExpiredPath());
  }
  return response;
}

async function parse<Schema extends z.ZodType>(response: Response, schema: Schema): Promise<z.infer<Schema>> {
  if (!response.ok) {
    throw await toApiError(response);
  }
  return schema.parse(await response.json());
}
