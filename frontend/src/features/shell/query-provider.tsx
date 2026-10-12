"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const STALE_TIME_MS = 30_000;

let browserQueryClient: QueryClient | undefined;

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: STALE_TIME_MS, refetchOnWindowFocus: false, retry: 1 },
      mutations: { retry: false },
    },
  });
}

function getQueryClient(): QueryClient {
  // Isolate server renders; reuse one client in the browser so the cache survives navigations.
  if (typeof window === "undefined") {
    return createQueryClient();
  }
  browserQueryClient ??= createQueryClient();
  return browserQueryClient;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
