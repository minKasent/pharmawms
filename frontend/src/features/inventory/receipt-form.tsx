"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Field, Select, Textarea } from "@/components/ui/field";
import { ProductPicker, type ProductOption } from "@/features/catalog/product-picker";
import { productPageSchema } from "@/features/catalog/schemas";
import { productQuery } from "@/features/catalog/use-product";
import { errorMessage } from "@/lib/api/api-error";
import { apiRequest } from "@/lib/api/client";
import { randomId } from "@/lib/random-id";

import { storageCondition } from "./labels";
import { type LocationOption, locationsFor } from "./locations";
import { ReceiptLineFields, type ReceiptLineDraft } from "./receipt-line-fields";
import { type ReceiptLinePayload, toReceiptLines } from "./receipt-payload";
import { receiptResultSchema } from "./schemas";

const PICKER_RESULT_LIMIT = 8;

type ReceiptPayload = { supplierId?: number; note?: string; lines: ReceiptLinePayload[] };

type Props = {
  locations: LocationOption[];
  /** Null when the user may not read suppliers; the receipt is then booked without one. */
  suppliers: { id: number; name: string }[] | null;
};

async function searchCatalog(term: string, signal: AbortSignal): Promise<ProductOption[]> {
  const query = new URLSearchParams({ size: String(PICKER_RESULT_LIMIT), active: "true" });
  if (term) query.set("search", term);
  const page = await apiRequest(`/products?${query}`, productPageSchema, { signal });
  return page.content.map((item) => ({
    id: item.id,
    name: item.name,
    sku: item.sku,
    baseUnit: item.baseUnit,
    detail: storageCondition(item.storageCondition).label,
  }));
}

export function ReceiptForm({ locations, suppliers }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const supplierId = useId();
  const noteId = useId();
  const [supplier, setSupplier] = useState("");
  const [note, setNote] = useState("");
  const [drafts, setDrafts] = useState<ReceiptLineDraft[]>([]);
  const [validationError, setValidationError] = useState<string>();
  const [isAdding, setAdding] = useState(false);
  const idempotency = useRef<{ payload: string; key: string } | null>(null);

  const submit = useMutation({
    mutationFn: ({ payload, key }: { payload: ReceiptPayload; key: string }) =>
      apiRequest("/goods-receipts", receiptResultSchema, { method: "POST", body: payload, idempotencyKey: key }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["product-picker"] });
      void queryClient.invalidateQueries({ queryKey: ["issue-preview"] });
      router.push(`/receipts/${result.receiptId}`);
    },
  });

  async function addProduct(option: ProductOption) {
    setAdding(true);
    try {
      const product = await queryClient.fetchQuery(productQuery(option.id));
      const defaultLocation = locationsFor(locations, product.storageCondition)[0];
      setDrafts((current) => [
        ...current,
        {
          key: randomId(),
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          baseUnit: product.baseUnit,
          lotNumber: "",
          manufactureDate: "",
          expiryDate: "",
          locationId: defaultLocation ? String(defaultLocation.id) : "",
          unitName: product.baseUnit,
          quantity: "",
          unitCost: String(product.referenceUnitCost),
        },
      ]);
    } catch (error) {
      setValidationError(errorMessage(error));
    } finally {
      setAdding(false);
    }
  }

  function idempotencyKeyFor(payload: ReceiptPayload): string {
    const serialized = JSON.stringify(payload);
    if (idempotency.current?.payload !== serialized) {
      idempotency.current = { payload: serialized, key: randomId() };
    }
    return idempotency.current.key;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = toReceiptLines(drafts);
    if (!result.ok) {
      setValidationError(result.error);
      return;
    }
    setValidationError(undefined);
    const payload: ReceiptPayload = {
      supplierId: supplier ? Number(supplier) : undefined,
      note: note.trim() || undefined,
      lines: result.lines,
    };
    submit.mutate({ payload, key: idempotencyKeyFor(payload) });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <Card>
        <CardHeader title="Thông tin phiếu nhập" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          {suppliers ? (
            <Field id={supplierId} label="Nhà cung cấp" hint="Bỏ trống nếu nhập từ nguồn khác (điều chuyển, tài trợ…).">
              <Select id={supplierId} value={supplier} onChange={(event) => setSupplier(event.target.value)}>
                <option value="">Không chọn</option>
                {suppliers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field id={noteId} label="Ghi chú" className={suppliers ? undefined : "sm:col-span-2"}>
            <Textarea id={noteId} rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Thuốc nhập kho"
          description="Mỗi dòng là một lô. Hệ thống kiểm tra điều kiện bảo quản của vị trí và hạn dùng tối thiểu khi nhập (GSP)."
        />
        <CardBody className="space-y-4">
          <ProductPicker label="Thêm thuốc" queryKey="catalog" search={searchCatalog} onSelect={addProduct} />
          {isAdding ? <p className="text-sm text-slate-500">Đang tải thông tin thuốc…</p> : null}
          {drafts.length === 0 ? (
            <EmptyState title="Chưa có dòng nào" description="Tìm và chọn thuốc ở ô phía trên để thêm lô cần nhập." />
          ) : (
            drafts.map((draft, index) => (
              <ReceiptLineFields
                key={draft.key}
                line={draft}
                index={index}
                locations={locations}
                onChange={(next) => setDrafts((current) => current.map((item) => (item.key === next.key ? next : item)))}
                onRemove={() => setDrafts((current) => current.filter((item) => item.key !== draft.key))}
              />
            ))
          )}
        </CardBody>
      </Card>

      {validationError ? <Alert tone="danger">{validationError}</Alert> : null}
      {submit.error ? <Alert tone="danger">{errorMessage(submit.error)}</Alert> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={submit.isPending || drafts.length === 0}>
          {submit.isPending ? "Đang nhập kho…" : "Xác nhận nhập kho"}
        </Button>
      </div>
    </form>
  );
}
