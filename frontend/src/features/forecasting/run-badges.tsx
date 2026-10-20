import { Badge, type Tone } from "@/components/ui/badge";

import type { ForecastRun } from "./schemas";

const statusDisplay: Record<ForecastRun["status"], { label: string; tone: Tone }> = {
  RUNNING: { label: "Đang chạy", tone: "info" },
  SUCCEEDED: { label: "Hoàn tất", tone: "success" },
  FAILED: { label: "Thất bại", tone: "danger" },
};

export function RunStatusBadge({ status }: { status: ForecastRun["status"] }) {
  const display = statusDisplay[status];
  return <Badge tone={display.tone}>{display.label}</Badge>;
}

export function ForecastSourceBadge({ source }: { source: ForecastRun["source"] }) {
  if (!source) return null;
  return source === "AI" ? (
    <Badge tone="brand">AI · LightGBM</Badge>
  ) : (
    <Badge tone="warning">Dự phòng · Trung bình trượt</Badge>
  );
}
