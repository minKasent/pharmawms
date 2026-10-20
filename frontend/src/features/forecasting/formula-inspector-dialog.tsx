"use client";

import Link from "next/link";

import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { formatDecimal, formatInteger, formatPercent } from "@/lib/format";

import type { Suggestion } from "./schemas";

const abcTone: Record<string, Tone> = { A: "violet", B: "info", C: "neutral" };

function zScoreFor(serviceLevel: number): string {
  if (serviceLevel >= 0.975) return "2,05";
  if (serviceLevel >= 0.945) return "1,64";
  return "1,28";
}

type Props = {
  suggestion: Suggestion | null;
  onClose: () => void;
};

export function FormulaInspectorDialog({ suggestion: s, onClose }: Props) {
  const unit = s?.baseUnit ?? "đv";
  const protection = s ? s.leadTimeDays + s.reviewPeriodDays : 0;
  const rawOrderNeed = s ? Math.max(0, s.orderUpToLevel - s.inventoryPosition) : 0;
  const totalPhysicalOnHand = s ? s.usableOnHand + s.atRiskQuantity : 0;

  return (
    <Dialog
      open={s !== null}
      onClose={onClose}
      title={s ? `Giải phẫu công thức (R, s, S) · ${s.productName ?? `#${s.productId}`}` : "Giải phẫu công thức (R, s, S)"}
      description="Chi tiết từng bước tính điểm đặt hàng, tồn kho an toàn và thác nước vị thế tồn kho có xét hạn dùng GSP."
      className="max-w-3xl"
      footer={
        <Button type="button" variant="secondary" onClick={onClose}>
          Đóng
        </Button>
      }
    >
      {s ? (
        <div className="max-h-[75vh] space-y-4 overflow-y-auto pr-1">
          {/* Header summary */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={abcTone[s.abcClass] ?? "neutral"}>Nhóm ABC: {s.abcClass}</Badge>
              <span className="font-mono text-xs text-slate-600">{s.sku}</span>
              <span className="text-xs text-slate-500">· NCC: {s.supplierName ?? "Chưa có NCC ưu tiên"}</span>
            </div>
            <Link
              href={`/products/${s.productId}`}
              onClick={onClose}
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              Mở hồ sơ thuốc & dự báo →
            </Link>
          </div>

          {/* Step 1: ABC Classification & Protection Period */}
          <section className="rounded-xl border border-slate-200 p-4">
            <h3 className="text-xs font-bold tracking-wider text-brand-700 uppercase">
              1. Phân hạng ABC & Chu kỳ bảo vệ (P = L + R)
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Hạng ABC · Mức phục vụ SL</p>
                <p className="mt-1 text-base font-bold text-slate-900">
                  Hạng {s.abcClass} · {formatPercent(s.serviceLevel)}
                </p>
                <p className="text-xs text-slate-500">Hệ số z ≈ {zScoreFor(s.serviceLevel)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Chu kỳ rà soát (R)</p>
                <p className="mt-1 text-base font-bold text-slate-900 tabular-nums">{s.reviewPeriodDays} ngày</p>
                <p className="text-xs text-slate-500">Định kỳ kiểm tra đặt hàng</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Thời gian giao hàng (L ± σL)</p>
                <p className="mt-1 text-base font-bold text-slate-900 tabular-nums">
                  {formatDecimal(s.leadTimeDays)} ± {formatDecimal(s.leadTimeStdDays)} ngày
                </p>
                <p className="text-xs text-slate-500">Theo hợp đồng nhà cung cấp</p>
              </div>
              <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-3">
                <p className="text-xs text-brand-800">Chu kỳ bảo vệ (P = L + R)</p>
                <p className="mt-1 text-base font-bold text-brand-900 tabular-nums">{formatDecimal(protection)} ngày</p>
                <p className="text-xs text-brand-700">Khoảng thời gian cần phủ tồn</p>
              </div>
            </div>
          </section>

          {/* Step 2: AI Forecast & (s, S) Thresholds */}
          <section className="rounded-xl border border-slate-200 p-4">
            <h3 className="text-xs font-bold tracking-wider text-brand-700 uppercase">
              2. Dự báo AI LightGBM & Ngưỡng tồn kho (SS, s, S)
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Dự báo nhu cầu ({s.horizonDays ?? 28} ngày)</p>
                <p className="mt-1 text-base font-bold text-slate-900 tabular-nums">
                  {s.forecastQuantity != null ? `${formatInteger(s.forecastQuantity)} ${unit}` : "—"}
                </p>
                <p className="text-xs text-slate-500">
                  d̂ = {formatDecimal(s.dailyDemand)}/ngày · σd = {formatDecimal(s.dailyErrorStd)}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Tồn kho an toàn (SS)</p>
                <p className="mt-1 text-base font-bold text-slate-900 tabular-nums">
                  {formatInteger(s.safetyStock)} {unit}
                </p>
                <p className="font-mono text-[11px] text-slate-500">z·√(P·σd² + d̂²·σL²)</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                <p className="text-xs text-amber-900">Điểm đặt hàng (s = ROP)</p>
                <p className="mt-1 text-base font-bold text-amber-900 tabular-nums">
                  {formatInteger(s.reorderPoint)} {unit}
                </p>
                <p className="font-mono text-[11px] text-amber-800">s = d̂·P + SS</p>
              </div>
              <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-3">
                <p className="text-xs text-violet-900">Mức đặt mục tiêu (S)</p>
                <p className="mt-1 text-base font-bold text-violet-900 tabular-nums">
                  {formatInteger(s.orderUpToLevel)} {unit}
                </p>
                <p className="font-mono text-[11px] text-violet-800">S = s + d̂·R</p>
              </div>
            </div>
          </section>

          {/* Step 3: Expiry-Aware Stock Waterfall */}
          <section className="space-y-3 rounded-xl border border-amber-200/90 bg-amber-50/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold tracking-wider text-amber-900 uppercase">
                3. Thác nước Vị thế Tồn kho Có xét Hạn dùng (Expiry-Aware Stock Waterfall)
              </h3>
              <Badge tone={s.atRiskQuantity > 0 ? "warning" : "success"}>
                {s.atRiskQuantity > 0
                  ? `Loại ${formatInteger(s.atRiskQuantity)} ${unit} cận hạn khỏi IP`
                  : "100% tồn kho dùng kịp trước hạn"}
              </Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs text-slate-500">Tổng tồn vật lý khả dụng</p>
                <p className="mt-1 text-base font-bold text-slate-900 tabular-nums">
                  {formatInteger(totalPhysicalOnHand)} {unit}
                </p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-white p-3">
                <p className="text-xs text-amber-800">Tồn cận hạn bị loại (−)</p>
                <p className="mt-1 text-base font-bold text-amber-700 tabular-nums">
                  −{formatInteger(s.atRiskQuantity)} {unit}
                </p>
                <p className="text-[11px] text-slate-500">Không kịp xuất theo tốc độ d̂</p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-white p-3">
                <p className="text-xs text-emerald-800">Tồn thực dùng kịp + Đang về</p>
                <p className="mt-1 text-base font-bold text-emerald-700 tabular-nums">
                  {formatInteger(s.usableOnHand)} + {formatInteger(s.onOrder)} {unit}
                </p>
              </div>
              <div className="rounded-lg border border-brand-300 bg-brand-50 p-3">
                <p className="text-xs font-semibold text-brand-900">Vị thế tồn hiệu dụng (IP)</p>
                <p className="mt-1 text-lg font-bold text-brand-900 tabular-nums">
                  {formatInteger(s.inventoryPosition)} {unit}
                </p>
                <p className="text-[11px] text-brand-700">
                  Đủ dùng: {s.daysOfCover != null ? `${formatDecimal(s.daysOfCover)} ngày` : "—"}
                </p>
              </div>
            </div>

            {s.atRiskQuantity > 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-100/70 px-3 py-2 text-xs text-amber-900">
                <strong>Cơ chế bảo vệ GSP:</strong> Có {formatInteger(s.atRiskQuantity)} {unit} trên kệ sẽ chạm ngưỡng ngừng xuất
                GSP trước khi kịp tiêu thụ hết theo tốc độ cầu dự báo ({formatDecimal(s.dailyDemand)} {unit}/ngày). Hệ thống đã tự
                động loại lượng hàng này khỏi vị thế tồn kho <code>IP</code> để kích hoạt đặt bù sớm, tránh đứt hàng đột ngột.
              </p>
            ) : null}
          </section>

          {/* Step 4: Final Order Quantity Conclusion */}
          <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h3 className="text-xs font-bold tracking-wider text-emerald-900 uppercase">
                  4. Kết luận Lượng đặt đề xuất (Q)
                </h3>
                <p className="text-xs text-slate-700">
                  Vì <code>IP = {formatInteger(s.inventoryPosition)}</code> ≤{" "}
                  <code>s = {formatInteger(s.reorderPoint)}</code> → Lượng thiếu hụt cơ sở{" "}
                  <code>S − IP = {formatInteger(rawOrderNeed)} {unit}</code>, sau khi quy đổi quy cách đóng gói / MOQ nhà cung cấp:
                </p>
                {s.cappedByShelfLife ? (
                  <p className="text-xs font-medium text-amber-800">
                    • Đã áp dụng <strong>Trần hạn dùng (Shelf-Life Cap)</strong> để đảm bảo lô mới nhập không bị tồn quá hạn dùng.
                  </p>
                ) : null}
              </div>
              <div className="rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-right shadow-2xs">
                <span className="block text-xs text-slate-500">Đề xuất đặt nhập (Q)</span>
                <span className="text-xl font-bold text-emerald-700 tabular-nums">
                  {formatInteger(s.suggestedQuantity)} {unit}
                </span>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </Dialog>
  );
}
