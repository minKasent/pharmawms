import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type AlertTone = "info" | "success" | "warning" | "danger";

const alertTones: Record<AlertTone, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-red-200 bg-red-50 text-red-900",
};

export function Alert({ tone = "info", title, children }: { tone?: AlertTone; title?: ReactNode; children?: ReactNode }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-sm", alertTones[tone])}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={cn(title ? "mt-1" : undefined)}>{children}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-slate-200/70", className)} />;
}

export function LoadingCard({ label, rows = 5 }: { label: string; rows?: number }) {
  return (
    <div role="status" aria-label={label} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <Skeleton className="h-5 w-48" />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-9 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {description ? <p className="max-w-md text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
