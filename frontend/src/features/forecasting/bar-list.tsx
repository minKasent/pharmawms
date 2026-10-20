import { cn } from "@/lib/cn";

const FULL_PERCENT = 100;

export type BarItem = { key: string; label: string; value: number; display: string; highlight?: boolean };

/** Horizontal bars scaled to the largest value; the numbers stay in the text for screen readers. */
export function BarList({ items, label }: { items: BarItem[]; label: string }) {
  const max = Math.max(...items.map((item) => item.value), Number.EPSILON);
  return (
    <ul aria-label={label} className="space-y-3">
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className={cn(item.highlight ? "font-semibold text-slate-900" : "text-slate-600")}>{item.label}</span>
            <span className={cn("tabular-nums", item.highlight ? "font-semibold text-brand-800" : "text-slate-700")}>{item.display}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-slate-100" aria-hidden="true">
            <div
              className={cn("h-full rounded-full", item.highlight ? "bg-brand-600" : "bg-slate-400")}
              style={{ width: `${(item.value / max) * FULL_PERCENT}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
