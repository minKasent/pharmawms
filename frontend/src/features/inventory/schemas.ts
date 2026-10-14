import { z } from "zod";

import { isoDate, isoDateTime, pageOf } from "@/lib/api/schemas";

import { BATCH_STATUSES, MOVEMENT_TYPES, STORAGE_CONDITIONS } from "./labels";

export const productStockSchema = z.object({
  productId: z.number(),
  sku: z.string(),
  productName: z.string(),
  categoryName: z.string(),
  baseUnit: z.string(),
  storageCondition: z.string(),
  onHand: z.number(),
  available: z.number(),
  onHold: z.number(),
  expired: z.number(),
  nearestExpiry: isoDate.nullish(),
  daysToNearestExpiry: z.number().nullish(),
  batchCount: z.number(),
  stockValue: z.number(),
});
export type ProductStock = z.infer<typeof productStockSchema>;
export const productStockPageSchema = pageOf(productStockSchema);

export const batchSchema = z.object({
  id: z.number(),
  productId: z.number(),
  sku: z.string(),
  productName: z.string(),
  baseUnit: z.string(),
  lotNumber: z.string(),
  manufactureDate: isoDate.nullish(),
  expiryDate: isoDate,
  daysToExpiry: z.number(),
  status: z.enum(BATCH_STATUSES),
  holdReason: z.string().nullish(),
  unitCost: z.number(),
  supplierId: z.number().nullish(),
  receivedAt: isoDateTime,
  onHand: z.number(),
  balances: z.array(z.object({ locationId: z.number(), locationCode: z.string(), zoneCode: z.string(), onHand: z.number() })),
});
export type Batch = z.infer<typeof batchSchema>;
export const batchListSchema = z.array(batchSchema);

export const stockCardSchema = z.object({
  productId: z.number(),
  sku: z.string(),
  productName: z.string(),
  baseUnit: z.string(),
  from: isoDate,
  to: isoDate,
  openingBalance: z.number(),
  closingBalance: z.number(),
  entries: z.array(
    z.object({
      movementId: z.number(),
      occurredAt: isoDateTime,
      movementType: z.enum(MOVEMENT_TYPES),
      referenceType: z.string(),
      referenceId: z.number(),
      referenceCode: z.string().nullish(),
      lotNumber: z.string(),
      expiryDate: isoDate,
      locationCode: z.string(),
      quantityIn: z.number(),
      quantityOut: z.number(),
      balanceAfter: z.number(),
      performedByName: z.string().nullish(),
    }),
  ),
});
export type StockCard = z.infer<typeof stockCardSchema>;

export const receiptSummarySchema = z.object({
  id: z.number(),
  code: z.string(),
  supplierId: z.number().nullish(),
  purchaseOrderId: z.number().nullish(),
  receivedAt: isoDateTime,
  receivedByName: z.string().nullish(),
  lineCount: z.number(),
  totalValue: z.number(),
});
export const receiptPageSchema = pageOf(receiptSummarySchema);

export const receiptSchema = z.object({
  id: z.number(),
  code: z.string(),
  supplierId: z.number().nullish(),
  purchaseOrderId: z.number().nullish(),
  note: z.string().nullish(),
  receivedByName: z.string().nullish(),
  receivedAt: isoDateTime,
  lines: z.array(
    z.object({
      productId: z.number(),
      sku: z.string(),
      productName: z.string(),
      baseUnit: z.string(),
      batchId: z.number(),
      lotNumber: z.string(),
      manufactureDate: isoDate.nullish(),
      expiryDate: isoDate,
      locationId: z.number(),
      locationCode: z.string(),
      quantity: z.number(),
      unitCost: z.number(),
    }),
  ),
});
export type Receipt = z.infer<typeof receiptSchema>;

export const receiptResultSchema = z.object({
  receiptId: z.number(),
  code: z.string(),
  replayed: z.boolean(),
});

export const issueSummarySchema = z.object({
  id: z.number(),
  code: z.string(),
  destination: z.string(),
  issuedAt: isoDateTime,
  issuedBy: z.number().nullish(),
  issuedByName: z.string().nullish(),
  lineCount: z.number(),
  totalQuantity: z.number(),
});
export const issuePageSchema = pageOf(issueSummarySchema);

const allocationSchema = z.object({
  batchId: z.number(),
  lotNumber: z.string(),
  expiryDate: isoDate,
  locationId: z.number(),
  locationCode: z.string(),
  quantity: z.number(),
});
export type Allocation = z.infer<typeof allocationSchema>;

export const issueSchema = z.object({
  id: z.number(),
  code: z.string(),
  destination: z.string(),
  minRemainingShelfLifeDays: z.number(),
  note: z.string().nullish(),
  issuedByName: z.string().nullish(),
  issuedAt: isoDateTime,
  replayed: z.boolean().nullish(),
  lines: z.array(
    z.object({
      productId: z.number(),
      sku: z.string(),
      productName: z.string(),
      baseUnit: z.string(),
      quantity: z.number(),
      allocations: z.array(allocationSchema),
    }),
  ),
});
export type Issue = z.infer<typeof issueSchema>;

export const issuePreviewSchema = z.object({
  minExpiryDate: isoDate,
  fullyAllocatable: z.boolean(),
  lines: z.array(
    z.object({
      productId: z.number(),
      sku: z.string(),
      productName: z.string(),
      baseUnit: z.string(),
      requestedQuantity: z.number(),
      shortage: z.number(),
      allocations: z.array(allocationSchema),
    }),
  ),
});
export type IssuePreview = z.infer<typeof issuePreviewSchema>;

export const warehouseListSchema = z.array(
  z.object({
    id: z.number(),
    code: z.string(),
    name: z.string(),
    address: z.string().nullish(),
    zones: z.array(
      z.object({
        id: z.number(),
        code: z.string(),
        name: z.string(),
        storageCondition: z.enum(STORAGE_CONDITIONS),
        locations: z.array(z.object({ id: z.number(), code: z.string(), active: z.boolean() })),
      }),
    ),
  }),
);
export type Warehouse = z.infer<typeof warehouseListSchema>[number];

export const disposalSchema = z.object({
  id: z.number(),
  code: z.string(),
  reason: z.string(),
  disposedByName: z.string().nullish(),
  disposedAt: isoDateTime,
  lineCount: z.number(),
  totalValue: z.number(),
});
export type Disposal = z.infer<typeof disposalSchema>;
export const disposalListSchema = z.array(disposalSchema);

export const disposalLinesSchema = z.array(
  z.object({
    productId: z.number(),
    sku: z.string(),
    productName: z.string(),
    baseUnit: z.string(),
    batchId: z.number(),
    lotNumber: z.string(),
    expiryDate: isoDate,
    locationCode: z.string(),
    quantity: z.number(),
    value: z.number(),
  }),
);

export const STOCK_TAKE_STATUSES = ["COUNTING", "SUBMITTED", "APPROVED", "CANCELLED"] as const;
export type StockTakeStatus = (typeof STOCK_TAKE_STATUSES)[number];

export const stockTakeSummarySchema = z.object({
  id: z.number(),
  code: z.string(),
  zoneId: z.number(),
  zoneCode: z.string(),
  status: z.enum(STOCK_TAKE_STATUSES),
  createdBy: z.number(),
  createdByName: z.string().nullish(),
  createdAt: isoDateTime,
  approvedByName: z.string().nullish(),
  approvedAt: isoDateTime.nullish(),
  lineCount: z.number(),
  differenceCount: z.number(),
});
export type StockTakeSummary = z.infer<typeof stockTakeSummarySchema>;
export const stockTakeListSchema = z.array(stockTakeSummarySchema);

export const stockTakeLineSchema = z.object({
  lineId: z.number(),
  productId: z.number(),
  sku: z.string(),
  productName: z.string(),
  baseUnit: z.string(),
  batchId: z.number(),
  lotNumber: z.string(),
  expiryDate: isoDate,
  locationId: z.number(),
  locationCode: z.string(),
  systemQuantity: z.number(),
  countedQuantity: z.number().nullish(),
  difference: z.number().nullish(),
});
export type StockTakeLine = z.infer<typeof stockTakeLineSchema>;

export const stockTakeSchema = z.object({
  header: stockTakeSummarySchema,
  lines: z.array(stockTakeLineSchema),
});
export type StockTake = z.infer<typeof stockTakeSchema>;

export const reconciliationDiscrepancySchema = z.object({
  batchId: z.number(),
  lotNumber: z.string(),
  locationId: z.number(),
  locationCode: z.string(),
  productId: z.number(),
  balanceOnHand: z.number(),
  ledgerQuantity: z.number(),
  difference: z.number(),
});
export type ReconciliationDiscrepancy = z.infer<typeof reconciliationDiscrepancySchema>;

export const reconciliationReportSchema = z.object({
  checkedAt: isoDateTime,
  totalBalances: z.number(),
  discrepancyCount: z.number(),
  consistent: z.boolean(),
  discrepancies: z.array(reconciliationDiscrepancySchema),
});
export type ReconciliationReport = z.infer<typeof reconciliationReportSchema>;

export const batchMovementEntrySchema = z.object({
  movementId: z.number(),
  occurredAt: isoDateTime,
  movementType: z.enum(MOVEMENT_TYPES),
  referenceType: z.string(),
  referenceId: z.number(),
  referenceCode: z.string().nullish(),
  locationCode: z.string(),
  quantity: z.number(),
  performedByName: z.string().nullish(),
});
export type BatchMovementEntry = z.infer<typeof batchMovementEntrySchema>;

export const batchTraceabilitySchema = z.object({
  batch: batchSchema,
  totalReceived: z.number(),
  totalIssued: z.number(),
  totalAdjusted: z.number(),
  totalDisposed: z.number(),
  affectedIssueCount: z.number(),
  movements: z.array(batchMovementEntrySchema),
});
export type BatchTraceability = z.infer<typeof batchTraceabilitySchema>;


