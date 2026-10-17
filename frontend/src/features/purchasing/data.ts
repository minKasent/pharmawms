import "server-only";

import { cache } from "react";

import { backendGet, backendGetOptional } from "@/lib/api/backend";

import { supplierListSchema, supplierSchema } from "./schemas";

const FORBIDDEN = 403;

/** Null when the signed-in role may not read suppliers (e.g. storekeepers); callers degrade gracefully. */
export const getSuppliers = cache(() => backendGetOptional("/suppliers", supplierListSchema, [FORBIDDEN]));

export const getSupplier = cache((id: number) => backendGet(`/suppliers/${id}`, supplierSchema));

export async function getSupplierNames(): Promise<Map<number, string>> {
  const suppliers = await getSuppliers();
  return new Map((suppliers ?? []).map((supplier) => [supplier.id, supplier.name]));
}
