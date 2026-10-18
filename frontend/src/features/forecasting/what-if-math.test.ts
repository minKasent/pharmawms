import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { closestServiceLevelTier, computeWhatIfScenario } from "./what-if-math.ts";

describe("computeWhatIfScenario", () => {
  it("increases safety stock, reorder point, and order quantity when demand surges +50%", () => {
    const baseline = computeWhatIfScenario({
      baseDailyDemand: 20,
      dailyErrorStd: 4,
      reviewPeriodDays: 7,
      leadTimeStdDays: 1.5,
      inventoryPosition: 180,
      demandShockPct: 0,
      simulatedLeadTimeDays: 7,
      simulatedServiceLevel: 0.95,
    });
    const surge = computeWhatIfScenario({
      baseDailyDemand: 20,
      dailyErrorStd: 4,
      reviewPeriodDays: 7,
      leadTimeStdDays: 1.5,
      inventoryPosition: 180,
      demandShockPct: 50,
      simulatedLeadTimeDays: 7,
      simulatedServiceLevel: 0.95,
    });

    assert.ok(surge.safetyStock > baseline.safetyStock);
    assert.ok(surge.reorderPoint > baseline.reorderPoint);
    assert.ok(surge.orderUpToLevel > baseline.orderUpToLevel);
    assert.ok(surge.rawOrderQty > baseline.rawOrderQty);
  });

  it("maps service level tiers accurately", () => {
    assert.equal(closestServiceLevelTier(0.98), 0.98);
    assert.equal(closestServiceLevelTier(0.95), 0.95);
    assert.equal(closestServiceLevelTier(0.9), 0.9);
  });
});
