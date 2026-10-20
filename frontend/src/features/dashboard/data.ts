import "server-only";

import { cache } from "react";

import { backendGet } from "@/lib/api/backend";

import { expiryHeatmapSchema, inventoryKpisSchema } from "./schemas";

/** Shared by the KPI cards and the trend chart, which render in separate Suspense boundaries. */
export const getInventoryKpis = cache(() => backendGet("/dashboard/inventory-kpis", inventoryKpisSchema));

export const getExpiryHeatmap = cache(() => backendGet("/dashboard/expiry-heatmap", expiryHeatmapSchema));
