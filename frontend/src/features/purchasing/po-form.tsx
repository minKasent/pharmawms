"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ProductPicker, type ProductOption } from "@/features/catalog/product-picker";
import { errorMessage } from "@/lib/api/api-error";
import { apiRequest } from "@/lib/api/client";
import { formatCurrency, formatInteger } from "@/lib/format";
import { randomId } from "@/lib/random-id";

import { type SupplyTerms, purchaseOrderSchema, supplyTermsListSchema } from "./schemas";

const PICKER_RESULT_LIMIT = 8;

export type PoFormLine = {
  key: string;
  productId: number;
  productName: string;
  sku: string;
  baseUnit: string;
  packSize: number;
  minOrderQuantity: number;
  quantity: string;
  unitPrice: string;
};

export type PoFormInitial = { orderId: number; version: number; supplierId: number; note: string; lines: PoFormLine[] };

type Props = {
  suppliers: { id: number; name: string }[];
  initial?: PoFormInitial;
};

const orderLinesSchema = z
  .array(
    z.object({
      productId: z.number(),
      quantity: z.number({ error: "số lượng không hợp lệ" }).int("số lượng phải là số nguyên").positive("số lượng phải lớn hơn 0"),
      unitPrice: z.number({ error: "đơn giá không hợp lệ" }).min(0, "đơn giá không được âm").optional(),
    }),
  )
  .min(1, "Thêm ít nhất một thuốc.");

type TermsOption = ProductOption & { terms: SupplyTerms };

function termsOption(terms: SupplyTerms): TermsOption {
  return {
    id: terms.productId,
    name: terms.productName,
    sku: terms.sku,
    baseUnit: terms.baseUnit,
    detail: `quy cách ${formatInteger(terms.packSize)} · MOQ ${formatInteger(terms.minOrderQuantity)} · ${formatCurrency(terms.unitPrice)}/${terms.baseUnit}`,
    terms,
  };
}

function lineFromTerms(terms: SupplyTerms): PoFormLine {
  const quantity = Math.max(terms.minOrderQuantity, terms.packSize);
  return {
    key: randomId(),
    productId: terms.productId,
    productName: terms.productName,
    sku: terms.sku,
    baseUnit: terms.baseUnit,
    packSize: terms.packSize,
    minOrderQuantity: terms.minOrderQuantity,
    quantity: String(quantity),
    unitPrice: String(terms.unitPrice),
  };
}

function packWarning(line: PoFormLine): string | undefined {
  const quantity = Number(line.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) return undefined;
  if (quantity < line.minOrderQuantity) return `Dưới MOQ ${formatInteger(line.minOrderQuantity)}`;
  if (line.packSize > 1 && quantity % line.packSize !== 0) return `Không chẵn quy cách ${formatInteger(line.packSize)}`;
  return undefined;
}

export function PoForm({ suppliers, initial }: Props) {
  const router = useRouter();
  const supplierFieldId = useId();
  const noteId = useId();
  const [supplierId, setSupplierId] = useState(initial ? String(initial.supplierId) : "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [lines, setLines] = useState<PoFormLine[]>(initial?.lines ?? []);
  const [validationError, setValidationError] = useState<string>();

  const terms = useQuery({
    queryKey: ["supplier-terms", supplierId],
    queryFn: ({ signal }) => apiRequest(`/suppliers/${supplierId}/products`, supplyTermsListSchema, { signal }),
    enabled: supplierId !== "",
  });

  const save = useMutation({
    mutationFn: (body: object) =>
      initial
        ? apiRequest(`/purchase-orders/${initial.orderId}`, purchaseOrderSchema, { method: "PUT", body })
        : apiRequest("/purchase-orders", purchaseOrderSchema, { method: "POST", body }),
    onSuccess: (order) => {
      router.push(`/purchase-orders/${order.id}`);
      router.refresh();
    },
  });

  async function searchTerms(term: string): Promise<TermsOption[]> {
    const needle = term.toLocaleLowerCase("vi");
    return (terms.data ?? [])
      .filter((item) => !needle || item.productName.toLocaleLowerCase("vi").includes(needle) || item.sku.toLowerCase().includes(needle))
      .slice(0, PICKER_RESULT_LIMIT)
      .map(termsOption);
  }

  function updateLine(key: string, patch: Partial<PoFormLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supplierId) {
      setValidationError("Chọn nhà cung cấp.");
      return;
    }
    const parsed = orderLinesSchema.safeParse(
      lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity.trim() === "" ? Number.NaN : Number(line.quantity),
        unitPrice: line.unitPrice.trim() === "" ? undefined : Number(line.unitPrice),
      })),
    );
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const lineIndex = typeof issue?.path[0] === "number" ? issue.path[0] : undefined;
      setValidationError(lineIndex === undefined ? issue?.message : `Dòng ${lineIndex + 1}: ${issue?.message}.`);
      return;
    }
    setValidationError(undefined);
    const common = { note: note.trim() || undefined, lines: parsed.data };
    save.mutate(initial ? { ...common, version: initial.version } : { ...common, supplierId: Number(supplierId) });
  }

  const selectedIds = new Set(lines.map((line) => line.productId));
  const total = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0);

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <Card>
        <CardHeader title="Thông tin đơn" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field id={supplierFieldId} label="Nhà cung cấp" hint={initial ? "Không đổi được nhà cung cấp của đơn đã lập." : undefined}>
            <Select
              id={supplierFieldId}
              value={supplierId}
              disabled={Boolean(initial)}
              onChange={(event) => {
                setSupplierId(event.target.value);
                setLines([]);
              }}
            >
              <option value="">Chọn nhà cung cấp…</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id={noteId} label="Ghi chú">
            <Textarea id={noteId} rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Dòng hàng" description={`Số lượng tính theo đơn vị cơ sở · Tổng ${formatCurrency(total)}`} />
        <CardBody className="space-y-4">
          {supplierId ? (
            terms.isError ? (
              <Alert tone="danger">{errorMessage(terms.error)}</Alert>
            ) : (
              <ProductPicker
                label="Thêm thuốc từ bảng giá nhà cung cấp"
                queryKey={`terms-${supplierId}-${terms.dataUpdatedAt}`}
                search={searchTerms}
                excludeIds={selectedIds}
                onSelect={(option) => setLines((current) => [...current, lineFromTerms(option.terms)])}
              />
            )
          ) : (
            <p className="text-sm text-slate-500">Chọn nhà cung cấp để thêm thuốc.</p>
          )}
          {lines.length === 0 ? (
            <EmptyState title="Chưa có dòng nào" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Các dòng của đơn mua</caption>
                <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Thuốc
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Số lượng
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Đơn giá (₫)
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Thành tiền
                    </th>
                    <th scope="col" className="px-3 py-2">
                      <span className="sr-only">Thao tác</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line) => {
                    const warning = packWarning(line);
                    return (
                      <tr key={line.key}>
                        <td className="px-3 py-2 align-top">
                          <p className="font-medium text-slate-900">{line.productName}</p>
                          <p className="text-xs text-slate-500">
                            {line.sku} · quy cách {formatInteger(line.packSize)} {line.baseUnit}
                          </p>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <label htmlFor={`${line.key}-qty`} className="sr-only">
                            Số lượng {line.productName}
                          </label>
                          <Input
                            id={`${line.key}-qty`}
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={line.packSize}
                            value={line.quantity}
                            onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                            className="w-32 text-right tabular-nums"
                          />
                          {warning ? <p className="mt-1 text-xs text-amber-700">{warning}</p> : null}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <label htmlFor={`${line.key}-price`} className="sr-only">
                            Đơn giá {line.productName}
                          </label>
                          <Input
                            id={`${line.key}-price`}
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="any"
                            value={line.unitPrice}
                            onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })}
                            className="w-32 text-right tabular-nums"
                          />
                        </td>
                        <td className="px-3 py-2 text-right align-top tabular-nums">
                          {formatCurrency((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0))}
                        </td>
                        <td className="px-3 py-2 text-right align-top">
                          <button
                            type="button"
                            onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                            aria-label={`Bỏ ${line.productName}`}
                            className="inline-flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 aria-hidden="true" className="size-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {validationError ? <Alert tone="danger">{validationError}</Alert> : null}
      {save.error ? <Alert tone="danger">{errorMessage(save.error)}</Alert> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Đang lưu…" : initial ? "Lưu thay đổi" : "Lưu đơn nháp"}
        </Button>
      </div>
    </form>
  );
}
