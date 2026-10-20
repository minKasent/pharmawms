import { z } from "zod";

import { isoDate, isoDateTime, pageOf } from "../../lib/api/schemas.ts";

export const RUN_STATUSES = ["RUNNING", "SUCCEEDED", "FAILED"] as const;
export const FORECAST_SOURCES = ["AI", "FALLBACK"] as const;

export const forecastRunSchema = z.object({
  id: z.number(),
  status: z.enum(RUN_STATUSES),
  triggerType: z.string(),
  asOfDate: isoDate,
  horizonDays: z.number(),
  modelVersion: z.string().nullish(),
  source: z.enum(FORECAST_SOURCES).nullish(),
  productCount: z.number().nullish(),
  note: z.string().nullish(),
  startedAt: isoDateTime,
  finishedAt: isoDateTime.nullish(),
  triggeredBy: z.number().nullish(),
});

export type ForecastRun = z.infer<typeof forecastRunSchema>;
export const forecastRunPageSchema = pageOf(forecastRunSchema);

export const explanationSchema = z.object({
  feature: z.string(),
  label: z.string(),
  value: z.number().nullish(),
  contribution: z.number(),
  effectPercent: z.number(),
});

export type Explanation = z.infer<typeof explanationSchema>;

export const productForecastSchema = z.object({
  productId: z.number(),
  runId: z.number().nullish(),
  asOfDate: isoDate.nullish(),
  source: z.enum(FORECAST_SOURCES).nullish(),
  modelVersion: z.string().nullish(),
  horizonDays: z.number().nullish(),
  forecastQuantity: z.number().nullish(),
  baselineQuantity: z.number().nullish(),
  dailyDemand: z.number().nullish(),
  dailyErrorStd: z.number().nullish(),
  explanation: z.array(explanationSchema).default([]),
  history: z.array(z.object({ day: isoDate, quantity: z.number() })).default([]),
});

export type ProductForecast = z.infer<typeof productForecastSchema>;

const metricsSchema = z.object({
  wape: z.number().nullish(),
  mae: z.number().nullish(),
  rmse: z.number().nullish(),
  mase: z.number().nullish(),
  bias: z.number().nullish(),
});

export type Metrics = z.infer<typeof metricsSchema>;

export const BASELINES = ["naive", "seasonalNaive", "movingAverage91", "seasonal_naive", "moving_average_91"] as const;
export type Baseline = (typeof BASELINES)[number];
export type CanonicalBaseline = "naive" | "seasonalNaive" | "movingAverage91";

export const baselineLabel: Record<Baseline, string> = {
  naive: "Naive (28 ngày gần nhất)",
  seasonalNaive: "Seasonal Naive (cùng kỳ năm trước)",
  movingAverage91: "Trung bình trượt 91 ngày",
  seasonal_naive: "Seasonal Naive (cùng kỳ năm trước)",
  moving_average_91: "Trung bình trượt 91 ngày",
};

const bestBaselineSchema = z.enum(BASELINES).transform((value): CanonicalBaseline => {
  if (value === "seasonal_naive") return "seasonalNaive";
  if (value === "moving_average_91") return "movingAverage91";
  return value;
});

export const backtestFoldSchema = z.object({
  fold: z.number(),
  cutoff: isoDate,
  trainRows: z.number(),
  testRows: z.number(),
  model: metricsSchema,
  naive: metricsSchema,
  seasonalNaive: metricsSchema,
  movingAverage91: metricsSchema,
});

export const modelInfoSchema = z.object({
  modelVersion: z.string(),
  trainedAt: isoDateTime,
  asOfDate: isoDate,
  horizonDays: z.number(),
  trainingRows: z.number(),
  productCount: z.number(),
  backtest: z.object({
    folds: z.array(backtestFoldSchema).default([]),
    overall: z.object({
      model: metricsSchema,
      naive: metricsSchema,
      seasonalNaive: metricsSchema,
      movingAverage91: metricsSchema,
      bestBaseline: bestBaselineSchema.nullish(),
      wapeImprovementVsBestBaseline: z.number().nullish(),
    }),
  }),
  featureImportance: z.array(z.object({ feature: z.string(), label: z.string(), share: z.number() })),
});

export type ModelInfo = z.infer<typeof modelInfoSchema>;
export type BacktestFold = z.infer<typeof backtestFoldSchema>;

export const SUGGESTION_STATUSES = ["OPEN", "ORDERED", "DISMISSED", "SUPERSEDED"] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export const suggestionStatusLabel: Record<SuggestionStatus, string> = {
  OPEN: "Đang mở",
  ORDERED: "Đã lập đơn",
  DISMISSED: "Đã bỏ qua",
  SUPERSEDED: "Bị thay thế",
};

export const suggestionSchema = z.object({
  id: z.number(),
  runId: z.number(),
  productId: z.number(),
  sku: z.string().nullish(),
  productName: z.string().nullish(),
  baseUnit: z.string().nullish(),
  supplierId: z.number().nullish(),
  supplierName: z.string().nullish(),
  status: z.enum(SUGGESTION_STATUSES),
  abcClass: z.string(),
  serviceLevel: z.number(),
  forecastQuantity: z.number().nullish(),
  horizonDays: z.number().nullish(),
  dailyDemand: z.number(),
  dailyErrorStd: z.number(),
  leadTimeDays: z.number(),
  leadTimeStdDays: z.number(),
  reviewPeriodDays: z.number(),
  safetyStock: z.number(),
  reorderPoint: z.number(),
  orderUpToLevel: z.number(),
  usableOnHand: z.number(),
  atRiskQuantity: z.number(),
  onOrder: z.number(),
  inventoryPosition: z.number(),
  daysOfCover: z.number().nullish(),
  suggestedQuantity: z.number(),
  cappedByShelfLife: z.boolean(),
  purchaseOrderId: z.number().nullish(),
});

export type Suggestion = z.infer<typeof suggestionSchema>;
export const suggestionPageSchema = pageOf(suggestionSchema);

export const suggestionOrderResultSchema = z.object({
  purchaseOrderBySuggestion: z.record(z.string(), z.number()),
});
