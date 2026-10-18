import type { ReactNode } from "react";

import { formatDecimal, formatInteger, formatPercent } from "@/lib/format";

import type { Suggestion } from "./schemas";

const SCALE_HEADROOM = 1.15;
const FULL_PERCENT = 100;

function percentOf(value: number, max: number): string {
  return `${Math.min(FULL_PERCENT, (value / max) * FULL_PERCENT)}%`;
}

function PositionBar({ suggestion }: { suggestion: Suggestion }) {
  const { inventoryPosition, reorderPoint, orderUpToLevel, suggestedQuantity } = suggestion;
  const max = Math.max(orderUpToLevel, inventoryPosition + suggestedQuantity, 1) * SCALE_HEADROOM;
  return (
    <figure className="space-y-2">
      <div className="relative h-6 rounded-md bg-slate-100" aria-hidden="true">
        <div className="absolute inset-y-0 left-0 rounded-l-md bg-brand-600" style={{ width: percentOf(inventoryPosition, max) }} />
        <div
          className="absolute inset-y-0 rounded-r-md bg-brand-100 ring-1 ring-brand-500 ring-inset"
          style={{ left: percentOf(inventoryPosition, max), width: percentOf(suggestedQuantity, max) }}
        />
        <div className="absolute inset-y-[-4px] w-0.5 bg-amber-500" style={{ left: percentOf(reorderPoint, max) }} />
        <div className="absolute inset-y-[-4px] w-0.5 bg-slate-700" style={{ left: percentOf(orderUpToLevel, max) }} />
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-brand-600" aria-hidden="true" />
          Vị thế tồn IP = {formatInteger(inventoryPosition)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-brand-100 ring-1 ring-brand-500 ring-inset" aria-hidden="true" />
          Lượng đặt Q = {formatInteger(suggestedQuantity)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-amber-500" aria-hidden="true" />
          Điểm đặt hàng s = {formatInteger(reorderPoint)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-slate-700" aria-hidden="true" />
          Mức tối đa S = {formatInteger(orderUpToLevel)}
        </span>
      </figcaption>
    </figure>
  );
}

function Step({ term, formula, children }: { term: string; formula: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[11rem_1fr] sm:gap-3">
      <dt className="text-sm font-medium text-slate-700">{term}</dt>
      <dd className="text-sm text-slate-600">
        <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800">{formula}</code>
        <span className="ml-2 tabular-nums">{children}</span>
      </dd>
    </div>
  );
}

/** Mirrors the backend's periodic-review (R, s, S) calculation with the stored inputs. */
export function SuggestionBreakdown({ suggestion: s }: { suggestion: Suggestion }) {
  const unit = s.baseUnit ?? "";
  const protection = s.leadTimeDays + s.reviewPeriodDays;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <dl className="space-y-2.5">
        <Step term="Nhu cầu dự báo" formula="d, σ">
          {s.forecastQuantity != null && s.horizonDays
            ? `${formatInteger(s.forecastQuantity)} ${unit} / ${s.horizonDays} ngày → `
            : ""}
          d = {formatDecimal(s.dailyDemand)}/ngày, σ sai số = {formatDecimal(s.dailyErrorStd)}
        </Step>
        <Step term="Khoảng bảo vệ" formula="P = L + R">
          {formatDecimal(s.leadTimeDays)} (±{formatDecimal(s.leadTimeStdDays)}) + {s.reviewPeriodDays} = {formatDecimal(protection)} ngày
        </Step>
        <Step term="Tồn kho an toàn" formula="SS = z·√(P·σ² + d²·σL²)">
          {formatInteger(s.safetyStock)} {unit} · mức phục vụ {formatPercent(s.serviceLevel)} (nhóm {s.abcClass})
        </Step>
        <Step term="Điểm đặt hàng" formula="s = d·P + SS">
          {formatInteger(s.reorderPoint)} {unit}
        </Step>
        <Step term="Mức tối đa" formula="S = s + d·R">
          {formatInteger(s.orderUpToLevel)} {unit}
        </Step>
        <Step term="Vị thế tồn" formula="IP = tồn dùng được + đang về">
          {formatInteger(s.usableOnHand)} + {formatInteger(s.onOrder)} = {formatInteger(s.inventoryPosition)} {unit}
          {s.atRiskQuantity > 0 ? ` (đã loại ${formatInteger(s.atRiskQuantity)} sắp hết hạn)` : ""}
        </Step>
        <Step term="Lượng đề xuất" formula="Q = S − IP ↑ quy cách, MOQ">
          {formatInteger(s.suggestedQuantity)} {unit}
          {s.cappedByShelfLife ? " · đã giới hạn để kịp dùng trước hạn" : ""}
        </Step>
      </dl>
      <PositionBar suggestion={s} />
    </div>
  );
}
