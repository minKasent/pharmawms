import { z } from "zod";

import { isoDate } from "@/lib/api/schemas";

export const EXPIRY_BUCKETS = ["EXPIRED", "DAYS_1_30", "DAYS_31_90", "DAYS_91_180", "OVER_180"] as const;
export type ExpiryBucket = (typeof EXPIRY_BUCKETS)[number];

export const inventoryKpisSchema = z.object({
  asOf: isoDate,
  usableStockValue: z.number(),
  productsInStock: z.number(),
  nearExpiryValue: z.number(),
  nearExpiryBatches: z.number(),
  expiredValue: z.number(),
  onHoldValue: z.number(),
  receiptsToday: z.number(),
  issuesToday: z.number(),
  issueTrend: z.array(z.object({ day: isoDate, quantity: z.number(), value: z.number() })),
});

export type InventoryKpis = z.infer<typeof inventoryKpisSchema>;
export type TrendPoint = InventoryKpis["issueTrend"][number];

const heatmapCellSchema = z.object({
  bucket: z.enum(EXPIRY_BUCKETS),
  batchCount: z.number(),
  quantity: z.number(),
  value: z.number(),
});

export const atRiskBatchSchema = z.object({
  batchId: z.number(),
  productId: z.number(),
  sku: z.string(),
  productName: z.string(),
  lotNumber: z.string(),
  expiryDate: isoDate,
  daysToExpiry: z.number(),
  status: z.string(),
  onHand: z.number(),
  baseUnit: z.string(),
  value: z.number(),
});

export const expiryHeatmapSchema = z.object({
  asOf: isoDate,
  buckets: z.array(z.object({ bucket: z.enum(EXPIRY_BUCKETS), label: z.string() })),
  rows: z.array(z.object({ categoryName: z.string(), cells: z.array(heatmapCellSchema) })),
  topAtRisk: z.array(atRiskBatchSchema),
});

export type ExpiryHeatmap = z.infer<typeof expiryHeatmapSchema>;
export type HeatmapCell = z.infer<typeof heatmapCellSchema>;
