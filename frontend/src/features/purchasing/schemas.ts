import { z } from "zod";

import type { Tone } from "@/components/ui/badge";
import { isoDateTime, pageOf } from "@/lib/api/schemas";

export const supplierSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  phone: z.string().nullish(),
  email: z.string().nullish(),
  address: z.string().nullish(),
  defaultLeadTimeDays: z.number(),
  active: z.boolean(),
});
export type Supplier = z.infer<typeof supplierSchema>;
export const supplierListSchema = z.array(supplierSchema);

export const supplyTermsSchema = z.object({
  supplierId: z.number(),
  productId: z.number(),
  sku: z.string(),
  productName: z.string(),
  baseUnit: z.string(),
  packSize: z.number(),
  minOrderQuantity: z.number(),
  unitPrice: z.number(),
  preferred: z.boolean(),
});
export type SupplyTerms = z.infer<typeof supplyTermsSchema>;
export const supplyTermsListSchema = z.array(supplyTermsSchema);

export const PO_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"] as const;
export type PurchaseOrderStatus = (typeof PO_STATUSES)[number];

export const poStatusLabel: Record<PurchaseOrderStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: "Nháp", tone: "neutral" },
  PENDING_APPROVAL: { label: "Chờ duyệt", tone: "warning" },
  APPROVED: { label: "Đã duyệt", tone: "info" },
  SENT: { label: "Đã gửi NCC", tone: "brand" },
  PARTIALLY_RECEIVED: { label: "Nhận một phần", tone: "violet" },
  RECEIVED: { label: "Hoàn tất", tone: "success" },
  CANCELLED: { label: "Đã hủy", tone: "danger" },
};

export const PO_SOURCES = ["MANUAL", "SUGGESTION"] as const;
export const poSourceLabel: Record<(typeof PO_SOURCES)[number], string> = {
  MANUAL: "Lập thủ công",
  SUGGESTION: "Từ đề xuất AI",
};

export const purchaseOrderSummarySchema = z.object({
  id: z.number(),
  code: z.string(),
  supplierId: z.number(),
  supplierName: z.string(),
  status: z.enum(PO_STATUSES),
  source: z.enum(PO_SOURCES),
  createdAt: isoDateTime,
  createdByName: z.string().nullish(),
  lineCount: z.number(),
  totalAmount: z.number(),
});
export const purchaseOrderPageSchema = pageOf(purchaseOrderSummarySchema);

export const purchaseOrderLineSchema = z.object({
  productId: z.number(),
  sku: z.string(),
  productName: z.string(),
  baseUnit: z.string(),
  quantity: z.number(),
  receivedQuantity: z.number(),
  remainingQuantity: z.number(),
  unitPrice: z.number(),
  lineTotal: z.number(),
  suggestionId: z.number().nullish(),
});
export type PurchaseOrderLine = z.infer<typeof purchaseOrderLineSchema>;

export const purchaseOrderSchema = z.object({
  id: z.number(),
  code: z.string(),
  supplierId: z.number(),
  supplierName: z.string(),
  status: z.enum(PO_STATUSES),
  source: z.enum(PO_SOURCES),
  note: z.string().nullish(),
  createdBy: z.number().nullish(),
  createdByName: z.string().nullish(),
  createdAt: isoDateTime,
  submittedAt: isoDateTime.nullish(),
  approvedByName: z.string().nullish(),
  approvedAt: isoDateTime.nullish(),
  rejectionReason: z.string().nullish(),
  sentAt: isoDateTime.nullish(),
  firstReceivedAt: isoDateTime.nullish(),
  completedAt: isoDateTime.nullish(),
  version: z.number(),
  totalAmount: z.number(),
  lines: z.array(purchaseOrderLineSchema),
  events: z.array(
    z.object({
      fromStatus: z.enum(PO_STATUSES).nullish(),
      toStatus: z.enum(PO_STATUSES),
      performedByName: z.string().nullish(),
      occurredAt: isoDateTime,
      note: z.string().nullish(),
    }),
  ),
});
export type PurchaseOrder = z.infer<typeof purchaseOrderSchema>;
