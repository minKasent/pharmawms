import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";

import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingCard } from "@/components/ui/feedback";
import { Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { withQuery } from "@/components/ui/pagination";
import { EmptyRow, TBody, THead, Table, Td, Th } from "@/components/ui/table";
import { getCurrentUser } from "@/features/auth/current-user";
import { can } from "@/features/auth/user";
import { BatchActions } from "@/features/inventory/batch-actions";
import { DISPOSAL_FIELD } from "@/features/inventory/disposal-field";
import { DisposalForm } from "@/features/inventory/disposal-form";
import { BatchStatusBadge, ExpiryCell } from "@/features/inventory/expiry-badge";
import { BATCH_STATUSES, type BatchStatus, batchStatusLabel } from "@/features/inventory/labels";
import { type Batch, batchListSchema } from "@/features/inventory/schemas";
import { backendGet } from "@/lib/api/backend";
import { formatCompactCurrency, formatCurrency, formatInteger } from "@/lib/format";
import { enumParam, positiveIntParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Lô & hạn dùng" };

const FILTERABLE_STATUSES = BATCH_STATUSES.filter((status) => status !== "DISPOSED");
const DISPOSABLE_STATUSES: readonly BatchStatus[] = ["EXPIRED", "ON_HOLD"];
const EXPIRY_WINDOWS = [
  { days: 30, label: "Trong 30 ngày" },
  { days: 90, label: "Trong 90 ngày" },
  { days: 180, label: "Trong 180 ngày" },
  { days: 365, label: "Trong 1 năm" },
] as const;
const EXPIRY_WINDOW_VALUES = EXPIRY_WINDOWS.map((window) => String(window.days));
const BASE_COLUMN_COUNT = 7;

type Filters = { status?: BatchStatus; expiringWithinDays?: number; productId?: number };

function isDisposable(batch: Batch): boolean {
  return batch.onHand > 0 && (DISPOSABLE_STATUSES.includes(batch.status) || batch.daysToExpiry <= 0);
}

function FilterBar({ filters }: { filters: Filters }) {
  return (
    <Form action="/batches" className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-4">
      {filters.productId ? <input type="hidden" name="productId" value={filters.productId} /> : null}
      <div className="space-y-1.5">
        <label htmlFor="status" className="block text-xs font-medium text-slate-600">
          Trạng thái
        </label>
        <Select id="status" name="status" defaultValue={filters.status ?? ""} className="w-44">
          <option value="">Tất cả</option>
          {FILTERABLE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {batchStatusLabel[status].label}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="expiringWithinDays" className="block text-xs font-medium text-slate-600">
          Hạn dùng
        </label>
        <Select id="expiringWithinDays" name="expiringWithinDays" defaultValue={filters.expiringWithinDays ?? ""} className="w-44">
          <option value="">Mọi thời hạn</option>
          {EXPIRY_WINDOWS.map((window) => (
            <option key={window.days} value={window.days}>
              {window.label}
            </option>
          ))}
        </Select>
      </div>
      <button type="submit" className={buttonClass("secondary")}>
        Lọc
      </button>
      {filters.status || filters.expiringWithinDays || filters.productId ? (
        <Link href="/batches" className="pb-2.5 text-sm text-brand-700 hover:underline">
          Xóa bộ lọc
        </Link>
      ) : null}
    </Form>
  );
}

function BatchRow({ batch, canHold, isSelectable }: { batch: Batch; canHold: boolean; isSelectable: boolean }) {
  const value = batch.onHand * batch.unitCost;
  const checkboxId = `batch-${batch.id}`;
  return (
    <tr className="hover:bg-slate-50">
      {isSelectable ? (
        <Td className="w-10">
          {isDisposable(batch) ? (
            <>
              <label htmlFor={checkboxId} className="sr-only">
                Chọn lô {batch.lotNumber}
              </label>
              <input id={checkboxId} type="checkbox" name={DISPOSAL_FIELD} value={batch.id} className="size-4 accent-red-600" />
            </>
          ) : null}
        </Td>
      ) : null}
      <Td>
        <Link href={`/products/${batch.productId}`} className="font-medium text-slate-900 hover:underline">
          {batch.productName}
        </Link>
        <span className="block text-xs text-slate-500">{batch.sku}</span>
      </Td>
      <Td className="font-mono text-xs">{batch.lotNumber}</Td>
      <Td>
        <ExpiryCell expiryDate={batch.expiryDate} daysToExpiry={batch.daysToExpiry} />
      </Td>
      <Td>
        <BatchStatusBadge status={batch.status} />
        {batch.holdReason ? <span className="mt-1 block max-w-56 text-xs text-slate-500">{batch.holdReason}</span> : null}
      </Td>
      <Td className="text-xs">{batch.balances.map((balance) => balance.locationCode).join(", ")}</Td>
      <Td numeric>
        <span className="font-medium">{formatInteger(batch.onHand)}</span> <span className="text-xs text-slate-500">{batch.baseUnit}</span>
      </Td>
      <Td numeric title={formatCurrency(value)}>
        {formatCompactCurrency(value)}
      </Td>
      <Td className="text-right">
        <BatchActions batchId={batch.id} lotNumber={batch.lotNumber} status={batch.status} daysToExpiry={batch.daysToExpiry} canHold={canHold} />
      </Td>
    </tr>
  );
}

async function BatchTable({ filters }: { filters: Filters }) {
  const [batches, user] = await Promise.all([backendGet(withQuery("/batches", filters), batchListSchema), getCurrentUser()]);
  const canHold = can(user, "BATCH_HOLD");
  const isSelectable = can(user, "STOCK_DISPOSE") && batches.some(isDisposable);
  const totalValue = batches.reduce((sum, batch) => sum + batch.onHand * batch.unitCost, 0);
  const columnCount = BASE_COLUMN_COUNT + 1 + Number(isSelectable);

  const table = (
    <>
      <p className="px-5 py-3 text-sm text-slate-600">
        {formatInteger(batches.length)} lô · tổng giá trị {formatCurrency(totalValue)}
      </p>
      <Table caption="Danh sách lô thuốc theo hạn dùng tăng dần">
        <THead>
          <tr>
            {isSelectable ? (
              <Th>
                <span className="sr-only">Chọn</span>
              </Th>
            ) : null}
            <Th>Thuốc</Th>
            <Th>Số lô</Th>
            <Th>Hạn dùng</Th>
            <Th>Trạng thái</Th>
            <Th>Vị trí</Th>
            <Th numeric>Tồn</Th>
            <Th numeric>Giá trị</Th>
            <Th className="text-right">Thao tác</Th>
          </tr>
        </THead>
        <TBody>
          {batches.length === 0 ? (
            <EmptyRow colSpan={columnCount}>Không có lô nào phù hợp bộ lọc.</EmptyRow>
          ) : (
            batches.map((batch) => <BatchRow key={batch.id} batch={batch} canHold={canHold} isSelectable={isSelectable} />)
          )}
        </TBody>
      </Table>
    </>
  );

  return isSelectable && batches.length > 0 ? <DisposalForm>{table}</DisposalForm> : table;
}

export default function BatchesPage({ searchParams }: PageProps<"/batches">) {
  return (
    <>
      <PageHeader
        title="Lô & hạn dùng"
        description="Các lô còn tồn, sắp xếp theo hạn dùng (thứ tự xuất FEFO). Lọc lô hết hạn hoặc tạm khóa để lập biên bản hủy."
      />
      <Suspense fallback={<LoadingCard label="Đang tải danh sách lô" rows={10} />}>
        {searchParams.then((params) => {
          const windowDays = enumParam(params.expiringWithinDays, EXPIRY_WINDOW_VALUES);
          const filters: Filters = {
            status: enumParam(params.status, FILTERABLE_STATUSES),
            expiringWithinDays: windowDays ? Number(windowDays) : undefined,
            productId: positiveIntParam(params.productId),
          };
          return (
            <Card>
              <FilterBar filters={filters} />
              <BatchTable filters={filters} />
            </Card>
          );
        })}
      </Suspense>
    </>
  );
}
