import "server-only";

import { cache } from "react";

import { backendGet } from "@/lib/api/backend";

import { type SessionUser, toSessionUser, userSchema } from "./user";

/** One /me call per request, shared by the shell, pages and permission checks. */
export const getCurrentUser = cache(async (): Promise<SessionUser> => {
  const user = await backendGet("/me", userSchema);
  return toSessionUser(user);
});
