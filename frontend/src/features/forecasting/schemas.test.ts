import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { baselineLabel, modelInfoSchema, productForecastSchema } from "./schemas.ts";

describe("productForecastSchema", () => {
  it("parses null-safe product forecast when product has no forecast run yet", () => {
    const parsed = productForecastSchema.parse({
      productId: 101,
      runId: null,
      asOfDate: null,
      source: null,
      modelVersion: null,
      horizonDays: null,
      forecastQuantity: null,
      baselineQuantity: null,
      dailyDemand: null,
      dailyErrorStd: null,
      explanation: [],
      history: [{ day: "2026-10-01", quantity: 12 }],
    });
    assert.equal(parsed.productId, 101);
    assert.equal(parsed.runId, null);
    assert.equal(parsed.forecastQuantity, null);
    assert.equal(parsed.history.length, 1);
  });
});

describe("modelInfoSchema", () => {
  const basePayload = {
    modelVersion: "lgbm-v1",
    trainedAt: "2026-10-19T10:00:00Z",
    asOfDate: "2026-10-19",
    horizonDays: 28,
    trainingRows: 5000,
    productCount: 40,
    backtest: {
      overall: {
        model: { wape: 0.14, mae: 3.1, rmse: 4.2, mase: 0.82, bias: -0.01 },
        naive: { wape: 0.21, mae: 4.5, rmse: 6.0, mase: 1.0, bias: 0.02 },
        seasonalNaive: { wape: 0.18, mae: 3.9, rmse: 5.1, mase: 0.91, bias: 0.01 },
        movingAverage91: { wape: 0.19, mae: 4.0, rmse: 5.3, mase: 0.94, bias: -0.02 },
        bestBaseline: "seasonal_naive",
        wapeImprovementVsBestBaseline: 0.222,
      },
    },
    featureImportance: [{ feature: "lag_7", label: "Nhu cầu 7 ngày trước", share: 0.35 }],
  };

  it("accepts snake_case bestBaseline (seasonal_naive, moving_average_91) and defaults empty folds", () => {
    const parsed = modelInfoSchema.parse(basePayload);
    assert.equal(parsed.backtest.overall.bestBaseline, "seasonalNaive");
    assert.deepEqual(parsed.backtest.folds, []);
    assert.equal(baselineLabel.seasonal_naive, "Seasonal Naive (cùng kỳ năm trước)");
    assert.equal(baselineLabel.moving_average_91, "Trung bình trượt 91 ngày");
  });

  it("accepts camelCase bestBaseline (seasonalNaive, movingAverage91)", () => {
    const parsed = modelInfoSchema.parse({
      ...basePayload,
      backtest: {
        ...basePayload.backtest,
        overall: {
          ...basePayload.backtest.overall,
          bestBaseline: "seasonalNaive",
        },
      },
    });
    assert.equal(parsed.backtest.overall.bestBaseline, "seasonalNaive");
    assert.equal(baselineLabel.seasonalNaive, "Seasonal Naive (cùng kỳ năm trước)");
    assert.equal(baselineLabel.movingAverage91, "Trung bình trượt 91 ngày");
  });
});
