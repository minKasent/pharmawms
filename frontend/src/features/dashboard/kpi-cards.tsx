import Link from "next/link";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/feedback";
import { cn } from "@/lib/cn";
import { formatCompactCurrency, formatCurrency, formatDate, formatInteger } from "@/lib/format";

import { getInventoryKpis } from "./data";

type StatProps = { label: string; value: string; title?: string; detail?: ReactNode; accent?: string; href?: string };

function Stat({ label, value, title, detail, accent = "border-l-brand-600", href }: StatProps) {
  const body = (
    <>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums" title={title}>
        {value}
      </p>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </>
  );
  const className = cn("block rounded-xl border border-l-4 border-slate-200 bg-white p-4 shadow-sm", accent);
  return href ? (
    <Link href={href} className={cn(className, "transition-colors hover:bg-slate-50")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export async function KpiCards() {
  const kpis = await getInventoryKpis();
  return (
    <section aria-label={`Chỉ số kho ngày ${formatDate(kpis.asOf)}`} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        label="Giá trị tồn khả dụng"
        value={formatCompactCurrency(kpis.usableStockValue)}
        title={formatCurrency(kpis.usableStockValue)}
        detail={`${formatInteger(kpis.productsInStock)} mặt hàng còn tồn`}
        href="/stock"
      />
      <Stat
        label="Cận hạn (≤ 90 ngày)"
        value={formatCompactCurrency(kpis.nearExpiryValue)}
        title={formatCurrency(kpis.nearExpiryValue)}
        detail={`${formatInteger(kpis.nearExpiryBatches)} lô cần ưu tiên xuất hoặc xử lý`}
        accent="border-l-amber-500"
        href="/batches?expiringWithinDays=90"
      />
      <Stat
        label="Hết hạn · Tạm khóa"
        value={formatCompactCurrency(kpis.expiredValue + kpis.onHoldValue)}
        title={`Hết hạn ${formatCurrency(kpis.expiredValue)} · Tạm khóa ${formatCurrency(kpis.onHoldValue)}`}
        detail={`Hết hạn ${formatCompactCurrency(kpis.expiredValue)} · Tạm khóa ${formatCompactCurrency(kpis.onHoldValue)}`}
        accent="border-l-red-500"
        href="/batches?status=EXPIRED"
      />
      <Stat
        label="Chứng từ hôm nay"
        value={`${formatInteger(kpis.receiptsToday)} nhập · ${formatInteger(kpis.issuesToday)} xuất`}
        detail={`Số liệu đến ngày ${formatDate(kpis.asOf)}`}
        accent="border-l-sky-500"
      />
    </section>
  );
}

export function KpiCardsSkeleton() {
  return (
    <div role="status" aria-label="Đang tải chỉ số kho" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-28 rounded-xl" />
      ))}
    </div>
  );
}
