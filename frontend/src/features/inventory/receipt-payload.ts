import { z } from "zod";

import type { ReceiptLineDraft } from "./receipt-line-fields";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const receiptLineSchema = z
  .object({
    productId: z.number(),
    lotNumber: z.string().trim().min(1, "chưa nhập số lô").max(50),
    manufactureDate: z.string().regex(ISO_DATE).optional(),
    expiryDate: z.string().regex(ISO_DATE, "chưa nhập hạn dùng"),
    locationId: z.number({ error: "chưa chọn vị trí" }).int().positive("chưa chọn vị trí"),
    unitName: z.string().min(1),
    quantity: z.number({ error: "số lượng không hợp lệ" }).int("số lượng phải là số nguyên").positive("số lượng phải lớn hơn 0"),
    unitCostPerBaseUnit: z.number({ error: "đơn giá không hợp lệ" }).min(0, "đơn giá không được âm"),
  })
  .refine((line) => !line.manufactureDate || line.manufactureDate < line.expiryDate, {
    message: "ngày sản xuất phải trước hạn dùng",
  });

export type ReceiptLinePayload = z.infer<typeof receiptLineSchema>;

function numberOrNaN(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value);
}

function toCandidate(draft: ReceiptLineDraft) {
  return {
    productId: draft.productId,
    lotNumber: draft.lotNumber,
    manufactureDate: draft.manufactureDate || undefined,
    expiryDate: draft.expiryDate,
    locationId: numberOrNaN(draft.locationId),
    unitName: draft.unitName,
    quantity: numberOrNaN(draft.quantity),
    unitCostPerBaseUnit: numberOrNaN(draft.unitCost),
  };
}

export type ReceiptLinesResult = { ok: true; lines: ReceiptLinePayload[] } | { ok: false; error: string };

/** Validates every draft line; the first problem is reported with its line number, like the backend does. */
export function toReceiptLines(drafts: ReceiptLineDraft[]): ReceiptLinesResult {
  if (drafts.length === 0) {
    return { ok: false, error: "Thêm ít nhất một dòng thuốc." };
  }
  const lines: ReceiptLinePayload[] = [];
  for (const [index, draft] of drafts.entries()) {
    const parsed = receiptLineSchema.safeParse(toCandidate(draft));
    if (!parsed.success) {
      return { ok: false, error: `Dòng ${index + 1} (${draft.productName}): ${parsed.error.issues[0]?.message ?? "dữ liệu không hợp lệ"}.` };
    }
    lines.push(parsed.data);
  }
  return { ok: true, lines };
}
