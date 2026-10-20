import type { Tone } from "@/components/ui/badge";

export const BATCH_STATUSES = ["QUARANTINE", "AVAILABLE", "ON_HOLD", "EXPIRED", "DISPOSED"] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export const batchStatusLabel: Record<BatchStatus, { label: string; tone: Tone }> = {
  QUARANTINE: { label: "Biệt trữ", tone: "violet" },
  AVAILABLE: { label: "Khả dụng", tone: "success" },
  ON_HOLD: { label: "Tạm khóa", tone: "warning" },
  EXPIRED: { label: "Hết hạn", tone: "danger" },
  DISPOSED: { label: "Đã hủy", tone: "neutral" },
};

export function batchStatus(status: string): { label: string; tone: Tone } {
  return status in batchStatusLabel ? batchStatusLabel[status as BatchStatus] : { label: status, tone: "neutral" };
}

export const STORAGE_CONDITIONS = ["NORMAL", "COOL", "COLD"] as const;
export type StorageCondition = (typeof STORAGE_CONDITIONS)[number];

export const storageConditionLabel: Record<StorageCondition, { label: string; tone: Tone }> = {
  NORMAL: { label: "Thường (≤ 30°C)", tone: "neutral" },
  COOL: { label: "Mát (8–15°C)", tone: "info" },
  COLD: { label: "Lạnh (2–8°C)", tone: "violet" },
};

export function storageCondition(value: string): { label: string; tone: Tone } {
  return value in storageConditionLabel ? storageConditionLabel[value as StorageCondition] : { label: value, tone: "neutral" };
}

export const STOCK_TAKE_STATUS_LABEL: Record<
  "COUNTING" | "SUBMITTED" | "APPROVED" | "CANCELLED",
  { label: string; tone: Tone }
> = {
  COUNTING: { label: "Đang kiểm", tone: "info" },
  SUBMITTED: { label: "Chờ duyệt", tone: "warning" },
  APPROVED: { label: "Đã duyệt", tone: "success" },
  CANCELLED: { label: "Đã hủy", tone: "neutral" },
};

export const MOVEMENT_TYPES = ["RECEIPT", "ISSUE", "ADJUSTMENT", "DISPOSAL"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const movementTypeLabel: Record<MovementType, { label: string; tone: Tone }> = {
  RECEIPT: { label: "Nhập", tone: "success" },
  ISSUE: { label: "Xuất", tone: "info" },
  ADJUSTMENT: { label: "Điều chỉnh", tone: "warning" },
  DISPOSAL: { label: "Hủy", tone: "danger" },
};

/** Days-to-expiry thresholds shared by badges and filters; they mirror the backend risk buckets. */
export const EXPIRY_CRITICAL_DAYS = 30;
export const EXPIRY_WARNING_DAYS = 90;
export const EXPIRY_WATCH_DAYS = 180;

export function expiryTone(daysToExpiry: number | null | undefined): Tone {
  if (daysToExpiry == null) return "neutral";
  if (daysToExpiry <= 0) return "danger";
  if (daysToExpiry <= EXPIRY_CRITICAL_DAYS) return "danger";
  if (daysToExpiry <= EXPIRY_WARNING_DAYS) return "warning";
  if (daysToExpiry <= EXPIRY_WATCH_DAYS) return "info";
  return "success";
}

export function expiryText(daysToExpiry: number | null | undefined): string {
  if (daysToExpiry == null) return "—";
  if (daysToExpiry <= 0) return "Đã hết hạn";
  return `Còn ${daysToExpiry} ngày`;
}
