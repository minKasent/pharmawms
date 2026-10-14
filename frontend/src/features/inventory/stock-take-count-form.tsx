"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { EmptyRow, TBody, THead, Table, Td, Th } from "@/components/ui/table";
import { errorMessage } from "@/lib/api/api-error";
import { apiRequest } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatDate, formatInteger } from "@/lib/format";

import { type StockTakeLine, stockTakeSchema } from "./schemas";

const COLUMN_COUNT = 7;

type Props = { stockTakeId: number; lines: StockTakeLine[]; editable: boolean };

export function StockTakeCountForm({ stockTakeId, lines, editable }: Props) {
  const router = useRouter();
  const [dirtyCounts, setDirtyCounts] = useState<Record<number, string>>({});
  const [validationError, setValidationError] = useState<string>();

  function countValueOf(line: StockTakeLine): string {
    if (Object.hasOwn(dirtyCounts, line.lineId)) {
      return dirtyCounts[line.lineId] ?? "";
    }
    return line.countedQuantity == null ? "" : String(line.countedQuantity);
  }

  const save = useMutation({
    mutationFn: (payload: { lineId: number; countedQuantity: number }[]) =>
      apiRequest(`/stock-takes/${stockTakeId}/counts`, stockTakeSchema, { method: "PUT", body: { counts: payload } }),
    onSuccess: () => {
      setDirtyCounts({});
      router.refresh();
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = [];
    for (const line of lines) {
      const raw = countValueOf(line).trim();
      if (raw === "") continue;
      const countedQuantity = Number(raw);
      if (!Number.isInteger(countedQuantity) || countedQuantity < 0) {
        setValidationError(`Dòng ${line.productName} (lô ${line.lotNumber}): số lượng phải là số nguyên ≥ 0.`);
        return;
      }
      payload.push({ lineId: line.lineId, countedQuantity });
    }
    if (payload.length === 0) {
      setValidationError("Nhập ít nhất một dòng trước khi lưu.");
      return;
    }
    setValidationError(undefined);
    save.mutate(payload);
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {editable ? (
        <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-brand-50/50 px-5 py-3">
          <p className="text-sm text-brand-900">Nhập số lượng thực tế theo từng lô; có thể lưu nhiều lần rồi mới gửi duyệt.</p>
          <Button type="submit" size="sm" disabled={save.isPending}>
            {save.isPending ? "Đang lưu…" : "Lưu số kiểm"}
          </Button>
        </div>
      ) : null}
      {validationError || save.error ? (
        <div className="border-b border-slate-100 px-5 py-3">
          <Alert tone="danger">{validationError ?? errorMessage(save.error)}</Alert>
        </div>
      ) : null}
      <Table caption="Các dòng kiểm kê theo lô và vị trí">
        <THead>
          <tr>
            <Th>Thuốc / lô</Th>
            <Th>Vị trí</Th>
            <Th>Hạn dùng</Th>
            <Th numeric>Hệ thống</Th>
            <Th numeric>Thực tế</Th>
            <Th numeric>Chênh lệch</Th>
            <Th>Đơn vị</Th>
          </tr>
        </THead>
        <TBody>
          {lines.length === 0 ? (
            <EmptyRow colSpan={COLUMN_COUNT}>Khu này không còn tồn để kiểm.</EmptyRow>
          ) : (
            lines.map((line) => {
              const raw = countValueOf(line);
              const counted = raw === "" ? null : Number(raw);
              const difference =
                counted != null && Number.isInteger(counted) ? counted - line.systemQuantity : line.difference;
              return (
                <tr key={line.lineId} className={cn(difference != null && difference !== 0 && "bg-amber-50/60")}>
                  <Td className="min-w-52">
                    <p className="font-medium text-slate-900">{line.productName}</p>
                    <p className="text-xs text-slate-500">
                      {line.sku} · lô {line.lotNumber}
                    </p>
                  </Td>
                  <Td className="font-mono text-xs">{line.locationCode}</Td>
                  <Td className="tabular-nums">{formatDate(line.expiryDate)}</Td>
                  <Td numeric>{formatInteger(line.systemQuantity)}</Td>
                  <Td numeric>
                    {editable ? (
                      <>
                        <label htmlFor={`count-${line.lineId}`} className="sr-only">
                          Số thực tế {line.productName} lô {line.lotNumber}
                        </label>
                        <Input
                          id={`count-${line.lineId}`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={raw}
                          onChange={(event) => setDirtyCounts((current) => ({ ...current, [line.lineId]: event.target.value }))}
                          className="ml-auto w-28 text-right tabular-nums"
                        />
                      </>
                    ) : (
                      formatInteger(line.countedQuantity)
                    )}
                  </Td>
                  <Td
                    numeric
                    className={cn(
                      difference == null && "text-slate-400",
                      difference != null && difference !== 0 && "font-semibold text-amber-800",
                    )}
                  >
                    {difference == null ? "—" : formatInteger(difference)}
                  </Td>
                  <Td className="text-slate-500">{line.baseUnit}</Td>
                </tr>
              );
            })
          )}
        </TBody>
      </Table>
    </form>
  );
}
