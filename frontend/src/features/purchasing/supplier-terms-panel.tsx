"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { EmptyRow, TBody, THead, Table, Td, Th } from "@/components/ui/table";
import { ProductPicker, type ProductOption } from "@/features/catalog/product-picker";
import { productPageSchema } from "@/features/catalog/schemas";
import { errorMessage } from "@/lib/api/api-error";
import { apiCommand, apiRequest } from "@/lib/api/client";
import { formatCurrency, formatInteger } from "@/lib/format";

import { type SupplyTerms, supplyTermsSchema } from "./schemas";

const PICKER_LIMIT = 8;
const BASE_COLUMN_COUNT = 5;

const toNum = (value: string) => (value.trim() === "" ? Number.NaN : Number(value));

const termsBodySchema = z.object({
  packSize: z.number({ error: "Quy cách không hợp lệ" }).int("Quy cách phải là số nguyên").positive("Quy cách phải lớn hơn 0"),
  minOrderQuantity: z.number({ error: "MOQ không hợp lệ" }).int("MOQ phải là số nguyên").min(0, "MOQ không được âm"),
  unitPrice: z.number({ error: "Đơn giá không hợp lệ" }).min(0, "Đơn giá không được âm"),
  preferred: z.boolean(),
});

type Draft = { product: ProductOption; packSize: string; minOrderQuantity: string; unitPrice: string; preferred: boolean };

type Props = { supplierId: number; terms: SupplyTerms[]; canManage: boolean };

export function SupplierTermsPanel({ supplierId, terms, canManage }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [validationError, setValidationError] = useState<string>();
  const existing = new Set(terms.map((term) => term.productId));

  const upsert = useMutation({
    mutationFn: ({ productId, body }: { productId: number; body: z.infer<typeof termsBodySchema> }) =>
      apiRequest(`/suppliers/${supplierId}/products/${productId}`, supplyTermsSchema, { method: "PUT", body }),
    onSuccess: () => {
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ["supplier-terms"] });
      router.refresh();
    },
  });

  const remove = useMutation({
    mutationFn: (productId: number) => apiCommand(`/suppliers/${supplierId}/products/${productId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["supplier-terms"] });
      router.refresh();
    },
  });

  function openEdit(term: SupplyTerms) {
    setValidationError(undefined);
    upsert.reset();
    remove.reset();
    setDraft({
      product: {
        id: term.productId,
        name: term.productName,
        sku: term.sku,
        baseUnit: term.baseUnit,
      },
      packSize: String(term.packSize),
      minOrderQuantity: String(term.minOrderQuantity),
      unitPrice: String(term.unitPrice),
      preferred: term.preferred,
    });
  }

  async function searchCatalog(term: string, signal: AbortSignal): Promise<ProductOption[]> {
    const page = await apiRequest(`/products?active=true&search=${encodeURIComponent(term)}&size=${PICKER_LIMIT}`, productPageSchema, { signal });
    return page.content.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      baseUnit: product.baseUnit,
      detail: product.categoryName,
    }));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const parsed = termsBodySchema.safeParse({
      packSize: toNum(draft.packSize),
      minOrderQuantity: toNum(draft.minOrderQuantity),
      unitPrice: toNum(draft.unitPrice),
      preferred: draft.preferred,
    });
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message);
      return;
    }
    setValidationError(undefined);
    upsert.mutate({ productId: draft.product.id, body: parsed.data });
  }

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="space-y-3 border-b border-slate-100 px-5 py-4">
          <ProductPicker
            label="Thêm thuốc vào bảng giá"
            queryKey={`supplier-terms-${supplierId}`}
            search={searchCatalog}
            excludeIds={existing}
            onSelect={(product) => {
              setValidationError(undefined);
              upsert.reset();
              remove.reset();
              setDraft({ product, packSize: "1", minOrderQuantity: "0", unitPrice: "0", preferred: false });
            }}
          />
          {draft ? (
            <form onSubmit={onSubmit} noValidate className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 sm:grid-cols-2 lg:grid-cols-5">
              <p className="text-sm font-medium text-slate-800 sm:col-span-2 lg:col-span-5">
                {draft.product.name} <span className="font-normal text-slate-500">· {draft.product.sku} · {draft.product.baseUnit}</span>
              </p>
              <Field id="terms-pack" label="Quy cách">
                <Input id="terms-pack" type="number" min={1} value={draft.packSize} onChange={(event) => setDraft({ ...draft, packSize: event.target.value })} />
              </Field>
              <Field id="terms-moq" label="MOQ">
                <Input id="terms-moq" type="number" min={0} value={draft.minOrderQuantity} onChange={(event) => setDraft({ ...draft, minOrderQuantity: event.target.value })} />
              </Field>
              <Field id="terms-price" label={`Đơn giá / ${draft.product.baseUnit} (₫)`}>
                <Input id="terms-price" type="number" min={0} step="any" value={draft.unitPrice} onChange={(event) => setDraft({ ...draft, unitPrice: event.target.value })} />
              </Field>
              <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
                <input type="checkbox" checked={draft.preferred} onChange={(event) => setDraft({ ...draft, preferred: event.target.checked })} className="size-4 accent-brand-600" />
                Ưu tiên
              </label>
              <div className="flex items-end gap-2">
                <Button type="submit" size="sm" disabled={upsert.isPending}>
                  {upsert.isPending ? "Đang lưu…" : "Lưu bảng giá"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft(null);
                    setValidationError(undefined);
                    upsert.reset();
                    remove.reset();
                  }}
                >
                  Hủy
                </Button>
              </div>
            </form>
          ) : null}
          {validationError || upsert.error || remove.error ? (
            <Alert tone="danger">{validationError ?? errorMessage(upsert.error ?? remove.error)}</Alert>
          ) : null}
        </div>
      ) : null}

      <Table caption="Bảng giá nhà cung cấp">
        <THead>
          <tr>
            <Th>Thuốc</Th>
            <Th numeric>Quy cách</Th>
            <Th numeric>MOQ</Th>
            <Th numeric>Đơn giá</Th>
            <Th>Ưu tiên</Th>
            {canManage ? (
              <Th>
                <span className="sr-only">Thao tác</span>
              </Th>
            ) : null}
          </tr>
        </THead>
        <TBody>
          {terms.length === 0 ? (
            <EmptyRow colSpan={BASE_COLUMN_COUNT + (canManage ? 1 : 0)}>Chưa có thuốc trong bảng giá.</EmptyRow>
          ) : (
            terms.map((term) => (
              <tr key={term.productId}>
                <Td className="min-w-48">
                  <p className="font-medium text-slate-900">{term.productName}</p>
                  <p className="text-xs text-slate-500">{term.sku}</p>
                </Td>
                <Td numeric>
                  {formatInteger(term.packSize)} {term.baseUnit}
                </Td>
                <Td numeric>{formatInteger(term.minOrderQuantity)}</Td>
                <Td numeric>
                  {formatCurrency(term.unitPrice)}/{term.baseUnit}
                </Td>
                <Td>{term.preferred ? "Có" : "—"}</Td>
                {canManage ? (
                  <Td className="text-right whitespace-nowrap">
                    <button
                      type="button"
                      aria-label={`Sửa ${term.productName}`}
                      onClick={() => openEdit(term)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      <Pencil aria-hidden="true" className="size-3.5" />
                      Sửa
                    </button>
                    <button
                      type="button"
                      aria-label={`Xóa ${term.productName} khỏi bảng giá`}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(term.productId)}
                      className="inline-flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  </Td>
                ) : null}
              </tr>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}
