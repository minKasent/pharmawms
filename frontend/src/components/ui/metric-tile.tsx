import { cn } from "@/lib/cn";

type MetricTileProps = { label: string; value: string; hint?: string; emphasis?: boolean };

/** Render inside a <dl>. */
export function MetricTile({ label, value, hint, emphasis = false }: MetricTileProps) {
  return (
    <div className={cn("rounded-lg border px-4 py-3", emphasis ? "border-brand-500 bg-brand-50" : "border-slate-200")}>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className={cn("mt-1 text-lg font-semibold tabular-nums", emphasis ? "text-brand-800" : "text-slate-900")}>{value}</dd>
      {hint ? <dd className="text-xs text-slate-500">{hint}</dd> : null}
    </div>
  );
}
