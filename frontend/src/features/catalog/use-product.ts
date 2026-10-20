"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";

import { apiRequest } from "@/lib/api/client";

import { productDetailSchema } from "./schemas";

const PRODUCT_STALE_MS = 5 * 60 * 1000;

/** Product detail for unit selection; master data changes rarely, so it is cached longer. */
export function productQuery(productId: number) {
  return queryOptions({
    queryKey: ["product", productId],
    queryFn: ({ signal }) => apiRequest(`/products/${productId}`, productDetailSchema, { signal }),
    staleTime: PRODUCT_STALE_MS,
  });
}

export function useProduct(productId: number) {
  return useQuery(productQuery(productId));
}
