export type ServiceLevelTier = 0.9 | 0.95 | 0.98 | 0.99;

export const SERVICE_LEVEL_TIERS: readonly { value: ServiceLevelTier; label: string; zScore: number }[] = [
  { value: 0.9, label: "90% (Hạng C · z=1,28)", zScore: 1.2816 },
  { value: 0.95, label: "95% (Hạng B · z=1,64)", zScore: 1.6449 },
  { value: 0.98, label: "98% (Hạng A · z=2,05)", zScore: 2.0537 },
  { value: 0.99, label: "99% (Cấp cứu · z=2,33)", zScore: 2.3263 },
];

export function closestServiceLevelTier(serviceLevel: number): ServiceLevelTier {
  if (serviceLevel >= 0.985) return 0.99;
  if (serviceLevel >= 0.965) return 0.98;
  if (serviceLevel >= 0.925) return 0.95;
  return 0.9;
}

export function zScoreForServiceLevel(serviceLevel: number): number {
  const tier = SERVICE_LEVEL_TIERS.find((t) => Math.abs(t.value - serviceLevel) < 0.005);
  if (tier) return tier.zScore;
  if (serviceLevel >= 0.985) return 2.3263;
  if (serviceLevel >= 0.975) return 2.0537;
  if (serviceLevel >= 0.945) return 1.6449;
  return 1.2816;
}

export type WhatIfInput = {
  baseDailyDemand: number;
  dailyErrorStd: number;
  reviewPeriodDays: number;
  leadTimeStdDays: number;
  inventoryPosition: number;
  demandShockPct: number;
  simulatedLeadTimeDays: number;
  simulatedServiceLevel: number;
};

export type WhatIfOutput = {
  simulatedDailyDemand: number;
  protectionDays: number;
  safetyStock: number;
  reorderPoint: number;
  orderUpToLevel: number;
  rawOrderQty: number;
  daysOfCover: number | null;
};

export function computeWhatIfScenario(input: WhatIfInput): WhatIfOutput {
  const factor = Math.max(0.1, 1 + input.demandShockPct / 100);
  const simulatedDailyDemand = Math.max(0, input.baseDailyDemand * factor);
  const scaledErrorStd = Math.max(0, input.dailyErrorStd * Math.sqrt(factor));
  const protectionDays = Math.max(1, input.simulatedLeadTimeDays + input.reviewPeriodDays);
  const z = zScoreForServiceLevel(input.simulatedServiceLevel);

  const variance =
    protectionDays * scaledErrorStd * scaledErrorStd +
    simulatedDailyDemand * simulatedDailyDemand * input.leadTimeStdDays * input.leadTimeStdDays;
  const safetyStock = Math.max(0, Math.round(z * Math.sqrt(Math.max(0, variance))));
  const reorderPoint = Math.max(0, Math.round(simulatedDailyDemand * protectionDays + safetyStock));
  const orderUpToLevel = Math.max(reorderPoint, Math.round(reorderPoint + simulatedDailyDemand * input.reviewPeriodDays));
  const rawOrderQty = input.inventoryPosition <= reorderPoint ? Math.max(0, orderUpToLevel - input.inventoryPosition) : 0;
  const daysOfCover = simulatedDailyDemand > 0 ? input.inventoryPosition / simulatedDailyDemand : null;

  return {
    simulatedDailyDemand,
    protectionDays,
    safetyStock,
    reorderPoint,
    orderUpToLevel,
    rawOrderQty,
    daysOfCover,
  };
}
