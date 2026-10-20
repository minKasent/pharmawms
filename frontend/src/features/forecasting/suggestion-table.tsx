"use client";

import { useMutation } from "@tanstack/react-query";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import X from "lucide-react/dist/esm/icons/x";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";

import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { EmptyRow, TBody, THead, Table, Td, Th } from "@/components/ui/table";
import { errorMessage } from "@/lib/api/api-error";
import { apiCommand, apiRequest } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatDecimal, formatInteger } from "@/lib/format";

import { FormulaInspectorDialog } from "./formula-inspector-dialog";
import { type Suggestion, suggestionOrderResultSchema, suggestionStatusLabel } from "./schemas";
import { SuggestionBreakdown } from "./suggestion-breakdown";

const abcTone: Record<string, Tone> = { A: "violet", B: "info", C: "neutral" };
const FIXED_COLUMN_COUNT = 3;
const OPEN_METRIC_COLUMN_COUNT = 3;
const CLOSED_METRIC_COLUMN_COUNT = 2;

type Props = { suggestions: Suggestion[]; canOrder: boolean; isOpenList: boolean };

function CoverCell({ suggestion }: { suggestion: Suggestion }) {
  const { daysOfCover, leadTimeDays, reviewPeriodDays } = suggestion;
  if (daysOfCover == null) return <span className="text-slate-400">—</span>;
  const tone =
    daysOfCover < leadTimeDays ? "text-red-700 font-semibold" : daysOfCover < leadTimeDays + reviewPeriodDays ? "text-amber-700" : "text-slate-700";
  return (
    <span className={tone} title={daysOfCover < leadTimeDays ? "Hết hàng trước khi lô mới kịp về" : undefined}>
      {formatDecimal(daysOfCover)} ngày
    </span>
  );
}

function parseQuantity(value: string): number | undefined {
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : undefined;
}

export function SuggestionTable({ suggestions, canOrder, isOpenList }: Props) {
  const router = useRouter();
  const isSelectable = canOrder && isOpenList;
  const [selectedRows, setSelectedRows] = useState<ReadonlyMap<number, Suggestion>>(() => new Map());
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const [inspectTarget, setInspectTarget] = useState<Suggestion | null>(null);
  const [dismissTarget, setDismissTarget] = useState<Suggestion | null>(null);
  const [createdOrderIds, setCreatedOrderIds] = useState<number[]>([]);
  const [validationError, setValidationError] = useState<string>();

  const quantityOf = (suggestion: Suggestion) => quantities[suggestion.id] ?? String(suggestion.suggestedQuantity);
  const selectedList = Array.from(selectedRows.values());
  const supplierCount = new Set(selectedList.map((suggestion) => suggestion.supplierId)).size;

  const createOrders = useMutation({
    mutationFn: (items: { suggestionId: number; quantity: number }[]) =>
      apiRequest("/purchase-suggestions/orders", suggestionOrderResultSchema, { method: "POST", body: { items } }),
    onSuccess: ({ purchaseOrderBySuggestion }) => {
      setCreatedOrderIds([...new Set(Object.values(purchaseOrderBySuggestion))].sort((a, b) => a - b));
      setSelectedRows(new Map());
      router.refresh();
    },
  });

  const dismiss = useMutation({
    mutationFn: (id: number) => apiCommand(`/purchase-suggestions/${id}/dismiss`),
    onSuccess: (_, id) => {
      setSelectedRows((current) => {
        if (!current.has(id)) return current;
        const next = new Map(current);
        next.delete(id);
        return next;
      });
      setDismissTarget(null);
      router.refresh();
    },
  });

  function toggleSet(set: ReadonlySet<number>, id: number): Set<number> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  function toggleRow(suggestion: Suggestion) {
    if (suggestion.supplierId == null) return;
    setSelectedRows((current) => {
      const next = new Map(current);
      if (next.has(suggestion.id)) next.delete(suggestion.id);
      else next.set(suggestion.id, suggestion);
      return next;
    });
  }

  const orderableSuggestions = suggestions.filter((suggestion) => suggestion.supplierId != null);
  const allSelected =
    orderableSuggestions.length > 0 && orderableSuggestions.every((suggestion) => selectedRows.has(suggestion.id));

  function togglePage() {
    setSelectedRows((current) => {
      const next = new Map(current);
      if (allSelected) {
        for (const suggestion of orderableSuggestions) next.delete(suggestion.id);
      } else {
        for (const suggestion of orderableSuggestions) next.set(suggestion.id, suggestion);
      }
      return next;
    });
  }

  function submitOrders() {
    const items = [];
    for (const suggestion of Array.from(selectedRows.values())) {
      const quantity = parseQuantity(quantityOf(suggestion));
      if (!quantity) {
        setValidationError(`Số lượng của "${suggestion.productName}" phải là số nguyên dương.`);
        return;
      }
      items.push({ suggestionId: suggestion.id, quantity });
    }
    setValidationError(undefined);
    createOrders.mutate(items);
  }

  const columnCount =
    FIXED_COLUMN_COUNT + (isSelectable ? 1 : 0) + (isOpenList ? OPEN_METRIC_COLUMN_COUNT : CLOSED_METRIC_COLUMN_COUNT);

  return (
    <>
      {createdOrderIds.length > 0 ? (
        <div className="border-b border-slate-100 px-5 py-3">
          <Alert tone="success" title={`Đã tạo ${createdOrderIds.length} đơn mua nháp`}>
            <span className="flex flex-wrap gap-x-3">
              {createdOrderIds.map((id) => (
                <Link key={id} href={`/purchase-orders/${id}`} className="font-medium underline">
                  Mở đơn #{id}
                </Link>
              ))}
            </span>
          </Alert>
        </div>
      ) : null}
      {isSelectable ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-brand-50/60 px-5 py-3">
          <p className="text-sm text-brand-900" aria-live="polite">
            {selectedRows.size > 0
              ? `Đã chọn ${selectedRows.size} đề xuất → tạo ${supplierCount} đơn nháp (mỗi nhà cung cấp một đơn)`
              : "Chọn đề xuất để gộp thành đơn mua nháp; số lượng có thể điều chỉnh trước khi tạo."}
          </p>
          <Button size="sm" disabled={selectedRows.size === 0 || createOrders.isPending} onClick={submitOrders}>
            {createOrders.isPending ? "Đang tạo…" : "Tạo đơn mua nháp"}
          </Button>
        </div>
      ) : null}
      {validationError || createOrders.error ? (
        <div className="border-b border-slate-100 px-5 py-3">
          <Alert tone="danger">{validationError ?? errorMessage(createOrders.error)}</Alert>
        </div>
      ) : null}

      <Table caption="Đề xuất nhập hàng, khẩn cấp nhất trước">
        <THead>
          <tr>
            {isSelectable ? (
              <Th className="w-10">
                <input
                  type="checkbox"
                  aria-label="Chọn tất cả đề xuất"
                  checked={allSelected}
                  disabled={orderableSuggestions.length === 0}
                  onChange={togglePage}
                  className="size-4 accent-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
                />
              </Th>
            ) : null}
            <Th>Thuốc</Th>
            <Th>Nhà cung cấp</Th>
            {isOpenList ? (
              <>
                <Th numeric>Đủ dùng</Th>
                <Th numeric>IP / s</Th>
                <Th numeric>Đề xuất đặt</Th>
              </>
            ) : (
              <>
                <Th numeric>Lượng đề xuất</Th>
                <Th>Trạng thái</Th>
              </>
            )}
            <Th>
              <span className="sr-only">Thao tác</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          {suggestions.length === 0 ? (
            <EmptyRow colSpan={columnCount}>Không có đề xuất nào.</EmptyRow>
          ) : (
            suggestions.map((suggestion) => {
              const isExpanded = expanded.has(suggestion.id);
              const detailId = `suggestion-${suggestion.id}-detail`;
              return (
                <Fragment key={suggestion.id}>
                  <tr className={cn("hover:bg-slate-50", selectedRows.has(suggestion.id) && "bg-brand-50/50")}>
                    {isSelectable ? (
                      <Td>
                        <input
                          type="checkbox"
                          aria-label={`Chọn ${suggestion.productName}`}
                          checked={selectedRows.has(suggestion.id)}
                          disabled={suggestion.supplierId == null}
                          title={suggestion.supplierId == null ? "Chưa có nhà cung cấp ưu tiên" : undefined}
                          onChange={() => toggleRow(suggestion)}
                          className="size-4 accent-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </Td>
                    ) : null}
                    <Td className="min-w-56">
                      <div className="flex items-center gap-2">
                        <Badge tone={abcTone[suggestion.abcClass] ?? "neutral"}>{suggestion.abcClass}</Badge>
                        <Link href={`/products/${suggestion.productId}`} className="font-medium text-slate-900 hover:underline">
                          {suggestion.productName ?? `#${suggestion.productId}`}
                        </Link>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {suggestion.sku}
                        {suggestion.cappedByShelfLife ? " · giới hạn theo hạn dùng" : ""}
                      </p>
                    </Td>
                    <Td className="text-slate-600">{suggestion.supplierName ?? "Chưa có NCC"}</Td>
                    {isOpenList ? (
                      <>
                        <Td numeric>
                          <CoverCell suggestion={suggestion} />
                        </Td>
                        <Td numeric className="whitespace-nowrap">
                          {formatInteger(suggestion.inventoryPosition)}
                          <span className="text-slate-400"> / {formatInteger(suggestion.reorderPoint)}</span>
                        </Td>
                        <Td numeric>
                          {isSelectable ? (
                            <span className="inline-flex items-center gap-1.5">
                              <label htmlFor={`suggestion-${suggestion.id}-qty`} className="sr-only">
                                Số lượng đặt {suggestion.productName}
                              </label>
                              <Input
                                id={`suggestion-${suggestion.id}-qty`}
                                type="number"
                                inputMode="numeric"
                                min={1}
                                value={quantityOf(suggestion)}
                                onChange={(event) => setQuantities((current) => ({ ...current, [suggestion.id]: event.target.value }))}
                                className="w-28 text-right tabular-nums"
                              />
                              <span className="text-xs text-slate-500">{suggestion.baseUnit}</span>
                            </span>
                          ) : (
                            `${formatInteger(suggestion.suggestedQuantity)} ${suggestion.baseUnit ?? ""}`
                          )}
                        </Td>
                      </>
                    ) : (
                      <>
                        <Td numeric>
                          {formatInteger(suggestion.suggestedQuantity)} {suggestion.baseUnit}
                        </Td>
                        <Td>
                          {suggestion.purchaseOrderId ? (
                            <Link href={`/purchase-orders/${suggestion.purchaseOrderId}`} className="text-brand-700 hover:underline">
                              {suggestionStatusLabel[suggestion.status]} #{suggestion.purchaseOrderId}
                            </Link>
                          ) : (
                            suggestionStatusLabel[suggestion.status]
                          )}
                        </Td>
                      </>
                    )}
                    <Td className="text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setInspectTarget(suggestion)}
                        className="mr-1 inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
                      >
                        Giải phẫu công thức
                      </button>
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        aria-controls={detailId}
                        aria-label={`${isExpanded ? "Ẩn" : "Xem"} cách tính cho ${suggestion.productName}`}
                        onClick={() => setExpanded((current) => toggleSet(current, suggestion.id))}
                        className="inline-flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                      >
                        <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform", isExpanded && "rotate-180")} />
                      </button>
                      {isSelectable ? (
                        <button
                          type="button"
                          aria-label={`Bỏ qua đề xuất ${suggestion.productName}`}
                          onClick={() => setDismissTarget(suggestion)}
                          className="inline-flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700"
                        >
                          <X aria-hidden="true" className="size-4" />
                        </button>
                      ) : null}
                    </Td>
                  </tr>
                  {isExpanded ? (
                    <tr id={detailId} className="bg-slate-50/70">
                      <td colSpan={columnCount} className="px-5 py-4">
                        <SuggestionBreakdown suggestion={suggestion} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })
          )}
        </TBody>
      </Table>

      <FormulaInspectorDialog suggestion={inspectTarget} onClose={() => setInspectTarget(null)} />

      <Dialog
        open={dismissTarget !== null}
        onClose={() => {
          setDismissTarget(null);
          dismiss.reset();
        }}
        title="Bỏ qua đề xuất"
        description={dismissTarget ? `${dismissTarget.productName} · ${formatInteger(dismissTarget.suggestedQuantity)} ${dismissTarget.baseUnit ?? ""}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDismissTarget(null)}>
              Giữ lại
            </Button>
            <Button variant="danger" disabled={dismiss.isPending} onClick={() => dismissTarget && dismiss.mutate(dismissTarget.id)}>
              {dismiss.isPending ? "Đang xử lý…" : "Bỏ qua đề xuất"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Đề xuất sẽ không xuất hiện lại cho đến lượt dự báo kế tiếp. Dùng khi đã đặt hàng ngoài hệ thống hoặc thuốc sắp ngừng sử dụng.
        </p>
        {dismiss.error ? (
          <div className="mt-3">
            <Alert tone="danger">{errorMessage(dismiss.error)}</Alert>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
