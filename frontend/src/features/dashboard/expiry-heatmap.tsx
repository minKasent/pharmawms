import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { EmptyRow, TBody, THead, Table, Td, Th } from "@/components/ui/table";
import { getCurrentUser } from "@/features/auth/current-user";
import { can } from "@/features/auth/user";
import { BatchTraceabilityButton } from "@/features/inventory/batch-traceability-dialog";
import { batchStatus, expiryText, expiryTone } from "@/features/inventory/labels";
import { cn } from "@/lib/cn";
import { formatCompactCurrency, formatCurrency, formatDate, formatInteger } from "@/lib/format";

import { getExpiryHeatmap } from "./data";
import type { ExpiryBucket, HeatmapCell } from "./schemas";

const INTENSITY_LEVELS = 4;

/** Static class lists so Tailwind can see every shade; index = intensity level (0 = empty). */
const BUCKET_SHADES: Record<ExpiryBucket, readonly string[]> = {
  EXPIRED: ["bg-slate-50 text-slate-400", "bg-red-100 text-red-900", "bg-red-200 text-red-900", "bg-red-400 text-white", "bg-red-600 text-white"],
  DAYS_1_30: ["bg-slate-50 text-slate-400", "bg-orange-100 text-orange-900", "bg-orange-200 text-orange-900", "bg-orange-400 text-white", "bg-orange-600 text-white"],
  DAYS_31_90: ["bg-slate-50 text-slate-400", "bg-amber-100 text-amber-900", "bg-amber-200 text-amber-900", "bg-amber-400 text-amber-950", "bg-amber-500 text-white"],
  DAYS_91_180: ["bg-slate-50 text-slate-400", "bg-sky-100 text-sky-900", "bg-sky-200 text-sky-900", "bg-sky-400 text-white", "bg-sky-600 text-white"],
  OVER_180: ["bg-slate-50 text-slate-400", "bg-emerald-100 text-emerald-900", "bg-emerald-200 text-emerald-900", "bg-emerald-400 text-white", "bg-emerald-600 text-white"],
};

/** Where each column drills down to in the batch list. */
const BUCKET_FILTER: Record<ExpiryBucket, string> = {
  EXPIRED: "/batches?status=EXPIRED",
  DAYS_1_30: "/batches?expiringWithinDays=30",
  DAYS_31_90: "/batches?expiringWithinDays=90",
  DAYS_91_180: "/batches?expiringWithinDays=180",
  OVER_180: "/batches",
};

function intensity(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.max(1, Math.ceil((value / max) * INTENSITY_LEVELS));
}

function maxByBucket(rows: Array<{ cells: HeatmapCell[] }>): Map<ExpiryBucket, number> {
  const max = new Map<ExpiryBucket, number>();
  for (const row of rows) {
    for (const cell of row.cells) {
      max.set(cell.bucket, Math.max(max.get(cell.bucket) ?? 0, cell.value));
    }
  }
  return max;
}

export async function ExpiryHeatmapCard() {
  const heatmap = await getExpiryHeatmap();
  const max = maxByBucket(heatmap.rows);

  return (
    <Card>
      <CardHeader
        title="Bản đồ nhiệt rủi ro hạn dùng"
        description="Giá trị tồn theo nhóm thuốc và thời gian còn lại đến hạn. Màu càng đậm, giá trị càng lớn trong cột."
      />
      {heatmap.rows.length === 0 ? (
        <EmptyState title="Kho chưa có tồn" />
      ) : (
        <Table caption="Giá trị tồn theo nhóm thuốc và khoảng hạn dùng">
          <THead>
            <tr>
              <Th>Nhóm thuốc</Th>
              {heatmap.buckets.map((bucket) => (
                <Th key={bucket.bucket} className="text-center">
                  <Link href={BUCKET_FILTER[bucket.bucket]} className="hover:text-slate-900 hover:underline">
                    {bucket.label}
                  </Link>
                </Th>
              ))}
            </tr>
          </THead>
          <TBody>
            {heatmap.rows.map((row) => (
              <tr key={row.categoryName}>
                <Th scope="row" className="font-medium text-slate-800">
                  {row.categoryName}
                </Th>
                {row.cells.map((cell) => {
                  const level = intensity(cell.value, max.get(cell.bucket) ?? 0);
                  return (
                    <Td key={cell.bucket} className="p-1">
                      <div
                        className={cn("rounded-md px-2 py-2 text-center", BUCKET_SHADES[cell.bucket][level])}
                        title={`${formatCurrency(cell.value)} · ${formatInteger(cell.quantity)} đơn vị`}
                      >
                        {cell.batchCount > 0 ? (
                          <>
                            <span className="block text-sm font-semibold tabular-nums">{formatCompactCurrency(cell.value)}</span>
                            <span className="block text-xs opacity-80">{formatInteger(cell.batchCount)} lô</span>
                          </>
                        ) : (
                          <span className="text-xs">—</span>
                        )}
                      </div>
                    </Td>
                  );
                })}
              </tr>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}

export async function AtRiskBatchesCard() {
  const [heatmap, user] = await Promise.all([getExpiryHeatmap(), getCurrentUser()]);
  const canIssue = can(user, "STOCK_ISSUE");

  return (
    <Card>
      <CardHeader
        title="Lô cần xử lý trước"
        description="Giá trị lớn nhất trong các lô đã hết hạn, sắp hết hạn hoặc đang tạm khóa — kèm thao tác xử lý nhanh"
        actions={
          <Link href="/batches?expiringWithinDays=90" className="text-sm font-medium text-brand-700 hover:underline">
            Xem tất cả
          </Link>
        }
      />
      <Table caption="Lô có rủi ro hạn dùng">
        <THead>
          <tr>
            <Th>Thuốc</Th>
            <Th>Số lô</Th>
            <Th>Hạn dùng</Th>
            <Th numeric>Tồn</Th>
            <Th numeric>Giá trị</Th>
            <Th className="text-right">Thao tác xử lý</Th>
          </tr>
        </THead>
        <TBody>
          {heatmap.topAtRisk.length === 0 ? (
            <EmptyRow colSpan={6}>Không có lô nào cần xử lý.</EmptyRow>
          ) : (
            heatmap.topAtRisk.map((batch) => {
              const status = batchStatus(batch.status);
              const isExpired = batch.status === "EXPIRED" || batch.daysToExpiry <= 0;
              const isOnHold = batch.status === "ON_HOLD";
              return (
                <tr key={batch.batchId} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/products/${batch.productId}`} className="font-medium text-slate-900 hover:underline">
                      {batch.productName}
                    </Link>
                    <span className="block text-xs text-slate-500">{batch.sku}</span>
                  </Td>
                  <Td>
                    <span className="font-mono text-xs">{batch.lotNumber}</span>
                    {batch.status !== "AVAILABLE" ? (
                      <Badge tone={status.tone} className="ml-2">
                        {status.label}
                      </Badge>
                    ) : null}
                  </Td>
                  <Td>
                    <span className="block">{formatDate(batch.expiryDate)}</span>
                    <Badge tone={expiryTone(batch.daysToExpiry)}>{expiryText(batch.daysToExpiry)}</Badge>
                  </Td>
                  <Td numeric>
                    {formatInteger(batch.onHand)} <span className="text-xs text-slate-500">{batch.baseUnit}</span>
                  </Td>
                  <Td numeric title={formatCurrency(batch.value)}>
                    {formatCompactCurrency(batch.value)}
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <BatchTraceabilityButton batchId={batch.batchId} lotNumber={batch.lotNumber} label="Truy vết" />
                      {isExpired ? (
                        <Link
                          href={`/batches?status=EXPIRED&productId=${batch.productId}`}
                          className="inline-flex h-8 items-center rounded-lg bg-red-50 px-2.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100"
                        >
                          Hủy lô →
                        </Link>
                      ) : isOnHold ? (
                        <Link
                          href={`/batches?status=ON_HOLD&productId=${batch.productId}`}
                          className="inline-flex h-8 items-center rounded-lg bg-amber-50 px-2.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100"
                        >
                          Xử lý khóa →
                        </Link>
                      ) : canIssue ? (
                        <Link
                          href={`/issues/new?sku=${encodeURIComponent(batch.sku)}`}
                          className="inline-flex h-8 items-center rounded-lg bg-brand-50 px-2.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100"
                        >
                          Xuất FEFO →
                        </Link>
                      ) : (
                        <Link
                          href={`/batches?productId=${batch.productId}`}
                          className="inline-flex h-8 items-center rounded-lg bg-slate-100 px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200"
                        >
                          Xem lô →
                        </Link>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })
          )}
        </TBody>
      </Table>
    </Card>
  );
}
