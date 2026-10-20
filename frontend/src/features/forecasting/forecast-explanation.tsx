import { cn } from "@/lib/cn";
import { formatDecimal, formatInteger } from "@/lib/format";

import type { Explanation } from "./schemas";

const PERCENT = 100;
/** Effects below this are shown as "no effect" rather than as a sliver of a bar. */
const NEGLIGIBLE_EFFECT_PERCENT = 0.05;
/** Bars grow from the centre line, so the largest effect spans half of the track. */
const HALF_TRACK_PERCENT = 50;

type Props = {
  explanation: Explanation[];
  baselineQuantity: number | null | undefined;
  forecastQuantity: number;
  horizonDays: number;
  unit: string;
};

/**
 * The model predicts log(demand) = log(baseline) + Σ contributions, so each feature multiplies
 * the baseline by (1 + effect). Features outside the top list are folded into one remainder row
 * so the factors shown multiply out exactly to the forecast.
 */
function remainderEffectPercent(explanation: Explanation[], baseline: number, forecast: number): number {
  const shownFactor = explanation.reduce((factor, item) => factor * (1 + item.effectPercent / PERCENT), 1);
  return ((forecast / baseline / shownFactor) - 1) * PERCENT;
}

export function ForecastExplanation({ explanation, baselineQuantity, forecastQuantity, horizonDays, unit }: Props) {
  if (!baselineQuantity || explanation.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Dự báo dự phòng (trung bình trượt) không có phần giải thích theo yếu tố.
      </p>
    );
  }
  const remainder = remainderEffectPercent(explanation, baselineQuantity, forecastQuantity);
  const rows = [
    ...explanation.map((item) => ({ key: item.feature, label: item.label, value: item.value, effect: item.effectPercent })),
    { key: "__other", label: "Yếu tố khác & hệ số chung của mô hình", value: undefined, effect: remainder },
  ];
  const maxAbs = Math.max(...rows.map((row) => Math.abs(row.effect)), NEGLIGIBLE_EFFECT_PERCENT);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm">
        <span className="text-slate-600">Mức nền (trung bình 28 & 91 ngày gần nhất × {horizonDays} ngày)</span>
        <span className="font-semibold tabular-nums">
          {formatInteger(baselineQuantity)} {unit}
        </span>
      </div>
      <ul className="space-y-2.5" aria-label="Tác động của từng yếu tố lên dự báo">
        {rows.map((row) => {
          const isNegligible = Math.abs(row.effect) < NEGLIGIBLE_EFFECT_PERCENT;
          const isPositive = row.effect > 0;
          const width = `${(Math.abs(row.effect) / maxAbs) * HALF_TRACK_PERCENT}%`;
          return (
            <li key={row.key} className="grid grid-cols-[minmax(0,14rem)_1fr_4.5rem] items-center gap-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800" title={row.label}>
                  {row.label}
                </p>
                {row.value != null ? <p className="text-xs text-slate-500 tabular-nums">Giá trị: {formatDecimal(row.value)}</p> : null}
              </div>
              <div className="relative h-5" aria-hidden="true">
                <div className="absolute inset-y-0 left-1/2 w-px bg-slate-300" />
                {!isNegligible ? (
                  <div
                    className={cn("absolute inset-y-0.5 rounded-sm", isPositive ? "left-1/2 bg-emerald-500" : "right-1/2 bg-rose-500")}
                    style={{ width }}
                  />
                ) : null}
              </div>
              <p className={cn("text-right font-semibold tabular-nums", isNegligible ? "text-slate-400" : isPositive ? "text-emerald-700" : "text-rose-700")}>
                {isNegligible ? "0%" : `${isPositive ? "+" : ""}${formatDecimal(row.effect)}%`}
              </p>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-900">
        <span>Dự báo {horizonDays} ngày tới</span>
        <span className="text-base font-semibold tabular-nums">
          {formatInteger(forecastQuantity)} {unit}
        </span>
      </div>
      <p className="text-xs text-slate-500">
        Tác động tính bằng SHAP trên thang logarit: mỗi yếu tố nhân mức nền với (1 + tác động). Thanh xanh làm tăng, thanh đỏ làm giảm dự báo.
      </p>
    </div>
  );
}
