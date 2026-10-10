import type { z } from "zod";

import { sessionExpiredPath } from "@/lib/session/paths";

import { ApiError, toApiError } from "./api-error";

const BFF_PREFIX = "/api/backend";
const NO_CONTENT = 204;

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
};

/** Calls the backend through the BFF route from Client Components (TanStack Query functions). */
export async function apiRequest<Schema extends z.ZodType>(
  path: string,
  schema: Schema,
  options?: RequestOptions,
): Promise<z.infer<Schema>> {
  const response = await send(path, options);
  return schema.parse(await response.json());
}

/** For endpoints that answer 204 No Content. */
export async function apiCommand(path: string, options?: RequestOptions): Promise<void> {
  const response = await send(path, { method: "POST", ...options });
  if (response.status !== NO_CONTENT) {
    await response.body?.cancel();
  }
}

async function send(path: string, { method = "GET", body, idempotencyKey, signal }: RequestOptions = {}) {
  const headers = new Headers({ Accept: "application/json" });
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (idempotencyKey) {
    headers.set("Idempotency-Key", idempotencyKey);
  }
  const response = await fetch(`${BFF_PREFIX}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (response.status === 401) {
    window.location.assign(sessionExpiredPath(window.location.pathname + window.location.search));
    throw new ApiError(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn.");
  }
  if (!response.ok) {
    throw await toApiError(response);
  }
  return response;
}
