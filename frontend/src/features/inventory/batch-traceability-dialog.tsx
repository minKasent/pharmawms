"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { EmptyRow, TBody, THead, Table, Td, Th } from "@/components/ui/table";
import { errorMessage } from "@/lib/api/api-error";
import { apiRequest } from "@/lib/api/client";
import { formatCurrency, formatDate, formatDateTime, formatInteger } from "@/lib/format";

import { BatchStatusBadge, ExpiryCell } from "./expiry-badge";
import { movementTypeLabel } from "./labels";
import { batchTraceabilitySchema } from "./schemas";

const REFERENCE_PATHS: Record<string, string> = {
  GOODS_RECEIPT: "/receipts",
  GOODS_ISSUE: "/issues",
  STOCK_TAKE: "/stock-takes",
  DISPOSAL: "/disposals",
};

function referenceHref(referenceType: string, referenceId: number): string | undefined {
  const base = REFERENCE_PATHS[referenceType];
  return base ? `${base}/${referenceId}` : undefined;
}

type DialogProps = {
  batchId: number | null;
  lotNumber?: string;
  onClose: () => void;
};

export function BatchTraceabilityDialog({ batchId, lotNumber, onClose }: DialogProps) {
  const query = useQuery({
    queryKey: ["batch-traceability", batchId],
    queryFn: ({ signal }) => apiRequest(`/batches/${batchId}/traceability`, batchTraceabilitySchema, { signal }),
    enabled: batchId !== null,
  });

  const data = query.data;
  const batch = data?.batch;
  const unit = batch?.baseUnit ?? "";

  const issueVouchers = data
    ? Array.from(
        new Map(
          data.movements
            .filter((m) => m.movementType === "ISSUE" || m.referenceType === "GOODS_ISSUE")
            .map((m) => [
              m.referenceId,
              {
                referenceId: m.referenceId,
                referenceCode: m.referenceCode ?? `GI-#${m.referenceId}`,
                occurredAt: m.occurredAt,
              },
            ]),
        ).values(),
      )
    : [];

  const activeBalances = batch?.balances.filter((b) => b.onHand > 0) ?? [];

  return (
    <Dialog
      open={batchId !== null}
      onClose={onClose}
      title={`Hồ sơ truy vết lô GSP ${batch?.lotNumber ?? lotNumber ?? ""}`}
      description="Truy xuất nguồn gốc từ lúc nhập kho, vị trí kệ lưu trữ đến từng phiếu xuất và mô phỏng phạm vi thu hồi khẩn cấp."
      className="max-w-4xl"
      footer={
        <Button type="button" variant="secondary" onClick={onClose}>
          Đóng hồ sơ
        </Button>
      }
    >
      <div className="max-h-[75vh] space-y-5 overflow-y-auto pr-1">
        {query.isPending ? (
          <div role="status" aria-label="Đang tải hồ sơ truy vết lô" className="space-y-3">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        ) : query.isError ? (
          <Alert tone="danger">{errorMessage(query.error)}</Alert>
        ) : data && batch ? (
          <>
            {/* 1. Batch Passport */}
            <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/80 pb-3">
                <div>
                  <span className="text-xs font-semibold tracking-wider text-brand-700 uppercase">
                    Hộ chiếu Lô thuốc GSP (Batch Passport)
                  </span>
                  <h3 className="mt-0.5 text-base font-semibold text-slate-900">
                    <Link href={`/products/${batch.productId}`} className="hover:underline" onClick={onClose}>
                      {batch.productName}
                    </Link>{" "}
                    <span className="font-mono text-xs font-normal text-slate-500">({batch.sku})</span>
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <BatchStatusBadge status={batch.status} />
                </div>
              </div>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-xs text-slate-500">Số lô sản xuất</dt>
                  <dd className="mt-0.5 font-mono font-semibold text-slate-900">{batch.lotNumber}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Ngày sản xuất</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">{formatDate(batch.manufactureDate)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Hạn dùng & thời hạn còn lại</dt>
                  <dd className="mt-0.5">
                    <ExpiryCell expiryDate={batch.expiryDate} daysToExpiry={batch.daysToExpiry} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Giá vốn đơn vị · Ngày nhập</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">
                    {formatCurrency(batch.unitCost)}/{unit} · {formatDate(batch.receivedAt)}
                  </dd>
                </div>
              </dl>
              {batch.holdReason ? (
                <p className="mt-2.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
                  Lý do tạm khóa: {batch.holdReason}
                </p>
              ) : null}
            </section>

            {/* 2. GSP Recall Impact Simulator */}
            <section className="space-y-3 rounded-xl border border-amber-200/80 bg-amber-50/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">
                    Mô phỏng Phong tỏa & Thu hồi Khẩn cấp (GSP Recall Impact Assessment)
                  </h4>
                  <p className="text-xs text-slate-600">
                    Đối chiếu cân bằng lượng nhập – xuất – tồn để khoanh vùng vị trí kệ cần khóa và các đơn vị đã nhận thuốc.
                  </p>
                </div>
                <Badge tone={batch.onHand > 0 ? "warning" : "neutral"}>
                  {batch.onHand > 0 ? `Cần phong tỏa ${formatInteger(batch.onHand)} ${unit}` : "Đã hết tồn tại kho"}
                </Badge>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-500">Tổng đã nhập</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-700">
                    {formatInteger(data.totalReceived)} <span className="text-xs font-normal text-slate-500">{unit}</span>
                  </p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-white p-3">
                  <p className="text-xs text-slate-500">Đang lưu kho cần phong tỏa</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-amber-800">
                    {formatInteger(batch.onHand)} <span className="text-xs font-normal text-slate-500">{unit}</span>
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-500">Đã xuất ra ngoài</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-brand-700">
                    {formatInteger(data.totalIssued)} <span className="text-xs font-normal text-slate-500">{unit}</span>
                  </p>
                  <p className="text-xs text-slate-500">Qua {formatInteger(data.affectedIssueCount)} phiếu xuất</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-500">Đã hủy / Điều chỉnh kiểm kê</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-slate-800">
                    Hủy: {formatInteger(data.totalDisposed)} · ĐC:{" "}
                    {data.totalAdjusted > 0 ? `+${formatInteger(data.totalAdjusted)}` : formatInteger(data.totalAdjusted)} {unit}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 pt-1 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold text-slate-700">Vị trí kệ đang lưu trữ lô này</p>
                  {activeBalances.length === 0 ? (
                    <p className="mt-1.5 text-xs text-slate-500">Không còn hàng trên kệ.</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {activeBalances.map((b) => (
                        <span
                          key={b.locationId}
                          className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900"
                        >
                          <span className="font-mono font-semibold">{b.locationCode}</span>
                          <span className="text-amber-700">({b.zoneCode})</span>
                          <span>· {formatInteger(b.onHand)} {unit}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold text-slate-700">
                    Phiếu xuất đã phân bổ lô này ({formatInteger(issueVouchers.length)})
                  </p>
                  {issueVouchers.length === 0 ? (
                    <p className="mt-1.5 text-xs text-slate-500">Lô này chưa từng được xuất ra ngoài.</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {issueVouchers.map((voucher) => (
                        <Link
                          key={voucher.referenceId}
                          href={`/issues/${voucher.referenceId}`}
                          onClick={onClose}
                          className="inline-flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 font-mono text-xs font-medium text-brand-800 hover:bg-brand-100 hover:underline"
                        >
                          {voucher.referenceCode}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* 3. Chronological Ledger Timeline */}
            <section className="overflow-hidden rounded-xl border border-slate-200">
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                <h4 className="text-sm font-semibold text-slate-900">
                  Dòng thời gian Biến động Sổ cái của Lô ({formatInteger(data.movements.length)} bút toán)
                </h4>
              </div>
              <Table caption="Lịch sử biến động sổ cái của lô thuốc">
                <THead>
                  <tr>
                    <Th>Thời gian</Th>
                    <Th>Loại</Th>
                    <Th>Chứng từ</Th>
                    <Th>Vị trí kệ</Th>
                    <Th numeric>Số lượng</Th>
                    <Th>Người thực hiện</Th>
                  </tr>
                </THead>
                <TBody>
                  {data.movements.length === 0 ? (
                    <EmptyRow colSpan={6}>Chưa có bút toán nào cho lô này.</EmptyRow>
                  ) : (
                    data.movements.map((m) => {
                      const type = movementTypeLabel[m.movementType];
                      const href = referenceHref(m.referenceType, m.referenceId);
                      const code = m.referenceCode ?? `#${m.referenceId}`;
                      return (
                        <tr key={m.movementId} className="hover:bg-slate-50">
                          <Td className="whitespace-nowrap tabular-nums text-xs">{formatDateTime(m.occurredAt)}</Td>
                          <Td>
                            <Badge tone={type.tone}>{type.label}</Badge>
                          </Td>
                          <Td className="font-mono text-xs">
                            {href ? (
                              <Link href={href} onClick={onClose} className="font-medium text-brand-700 hover:underline">
                                {code}
                              </Link>
                            ) : (
                              code
                            )}
                          </Td>
                          <Td className="font-mono text-xs">{m.locationCode}</Td>
                          <Td
                            numeric
                            className={m.quantity > 0 ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}
                          >
                            {m.quantity > 0 ? `+${formatInteger(m.quantity)}` : formatInteger(m.quantity)} {unit}
                          </Td>
                          <Td className="text-xs text-slate-600">{m.performedByName ?? "—"}</Td>
                        </tr>
                      );
                    })
                  )}
                </TBody>
              </Table>
            </section>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}

export function BatchTraceabilityButton({
  batchId,
  lotNumber,
  label = "Truy vết lô",
}: {
  batchId: number;
  lotNumber: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <BatchTraceabilityDialog batchId={open ? batchId : null} lotNumber={lotNumber} onClose={() => setOpen(false)} />
    </>
  );
}
