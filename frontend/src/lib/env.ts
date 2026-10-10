import "server-only";

import { z } from "zod";

const envSchema = z.object({
  BACKEND_URL: z.url({ message: "BACKEND_URL must be the backend base URL, e.g. http://localhost:8080" }),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? process.env.NODE_ENV === "production" : value === "true")),
});

export const env = envSchema.parse(process.env);

export const backendApiUrl = `${env.BACKEND_URL.replace(/\/$/, "")}/api/v1`;
