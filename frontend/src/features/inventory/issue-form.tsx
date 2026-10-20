"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useRef, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Textarea, describedBy } from "@/components/ui/field";
import { ProductPicker, type ProductOption } from "@/features/catalog/product-picker";
import { errorMessage } from "@/lib/api/api-error";
import { apiRequest } from "@/lib/api/client";
import { formatInteger } from "@/lib/format";
import { randomId } from "@/lib/random-id";
import { useDebouncedValue } from "@/lib/use-debounced-value";

import { IssueLineRow, type IssueLineDraft } from "./issue-line-row";
import { IssuePreviewPanel } from "./issue-preview-panel";
import { issuePreviewSchema, issueSchema, productStockPageSchema } from "./schemas";

const PREVIEW_DEBOUNCE_MS = 400;
const PICKER_RESULT_LIMIT = 8;
const MAX_SHELF_LIFE_DAYS = 3650;
/** Preview only needs the lines; the backend still requires a non-blank destination. */
const PREVIEW_DESTINATION = "Xem trước";
const COMMON_DESTINATIONS = ["Nhà thuốc bệnh viện", "Khoa Nội tổng hợp", "Khoa Nhi", "Khoa Ngoại", "Khoa Cấp cứu"];

const issueFormSchema = z.object({
  destination: z.string().trim().min(1, "Nhập nơi nhận (khoa/phòng).").max(200),
  minRemainingShelfLifeDays: z
    .number({ message: "Nhập số nguyên từ 1 đến 3.650." })
    .int("Nhập số nguyên từ 1 đến 3.650.")
    .min(1, "Tối thiểu 1 ngày.")
    .max(MAX_SHELF_LIFE_DAYS, `Tối đa ${MAX_SHELF_LIFE_DAYS} ngày.`)
    .optional(),
  note: z.string().trim().max(500).optional(),
  lines: z
    .array(
      z.object({
        productId: z.number(),
        unitName: z.string(),
        quantity: z
          .number({ message: "Số lượng xuất của mỗi dòng phải là số nguyên lớn hơn 0." })
          .int("Số lượng xuất của mỗi dòng phải là số nguyên lớn hơn 0.")
          .positive("Số lượng xuất của mỗi dòng phải là số nguyên lớn hơn 0."),
      }),
    )
    .min(1, "Thêm ít nhất một thuốc với số lượng lớn hơn 0."),
});

type IssuePayload = z.infer<typeof issueFormSchema>;
type FieldErrors = Partial<Record<"destination" | "minRemainingShelfLifeDays" | "lines", string>>;

type StockOption = ProductOption & { available: number };

async function searchStock(term: string, signal: AbortSignal): Promise<StockOption[]> {
  const query = new URLSearchParams({ size: String(PICKER_RESULT_LIMIT) });
  if (term) query.set("search", term);
  const page = await apiRequest(`/stock?${query}`, productStockPageSchema, { signal });
  return page.content.map((item) => ({
    id: item.productId,
    name: item.productName,
    sku: item.sku,
    baseUnit: item.baseUnit,
    detail: `khả dụng ${formatInteger(item.available)} ${item.baseUnit}`,
    available: item.available,
  }));
}

function toValidLines(drafts: IssueLineDraft[]) {
  return drafts
    .map((draft) => ({
      productId: draft.product.id,
      unitName: draft.unitName,
      quantity: draft.quantity.trim() === "" ? Number.NaN : Number(draft.quantity),
    }))
    .filter((line) => Number.isInteger(line.quantity) && line.quantity > 0);
}

function optionalNumber(value: string): number | undefined {
  return value.trim() === "" ? undefined : Number(value);
}

function validShelfLifeDays(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_SHELF_LIFE_DAYS ? parsed : undefined;
}

export function IssueForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const ids = { destination: useId(), minDays: useId(), note: useId(), destinations: useId() };
  const [destination, setDestination] = useState("");
  const [minDays, setMinDays] = useState("");
  const [note, setNote] = useState("");
  const [drafts, setDrafts] = useState<IssueLineDraft[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const idempotency = useRef<{ payload: string; key: string } | null>(null);

  const lines = toValidLines(drafts);
  const previewMinDays = validShelfLifeDays(minDays);
  // Debounce the serialized body: a fresh object every render would never settle.
  const previewInput = JSON.stringify({ lines, minRemainingShelfLifeDays: previewMinDays });
  const previewBody = useDebouncedValue(previewInput, PREVIEW_DEBOUNCE_MS);
  const debouncedPayload = JSON.parse(previewBody) as {
    lines: typeof lines;
    minRemainingShelfLifeDays?: number;
  };
  const isDebouncing = previewInput !== previewBody;

  const preview = useQuery({
    queryKey: ["issue-preview", previewBody],
    queryFn: ({ signal }) =>
      apiRequest("/goods-issues/preview", issuePreviewSchema, {
        method: "POST",
        body: { ...debouncedPayload, destination: PREVIEW_DESTINATION },
        signal,
      }),
    enabled: debouncedPayload.lines.length > 0,
    placeholderData: keepPreviousData,
  });

  const submit = useMutation({
    mutationFn: ({ payload, key }: { payload: IssuePayload; key: string }) =>
      apiRequest("/goods-issues", issueSchema, { method: "POST", body: payload, idempotencyKey: key }),
    onSuccess: (issue) => {
      void queryClient.invalidateQueries({ queryKey: ["product-picker"] });
      void queryClient.invalidateQueries({ queryKey: ["issue-preview"] });
      router.push(`/issues/${issue.id}`);
    },
  });

  /** A retry of the same payload reuses its key, so a lost response cannot issue stock twice. */
  function idempotencyKeyFor(payload: IssuePayload): string {
    const serialized = JSON.stringify(payload);
    if (idempotency.current?.payload !== serialized) {
      idempotency.current = { payload: serialized, key: randomId() };
    }
    return idempotency.current.key;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedLines = drafts.map((draft) => ({
      productId: draft.product.id,
      unitName: draft.unitName,
      quantity: draft.quantity.trim() === "" ? Number.NaN : Number(draft.quantity),
    }));
    const minRemainingShelfLifeDays = optionalNumber(minDays);
    const parsed = issueFormSchema.safeParse({
      destination,
      minRemainingShelfLifeDays,
      note: note || undefined,
      lines: submittedLines,
    });
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FieldErrors;
        errors[field] ??= issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    submit.mutate({ payload: parsed.data, key: idempotencyKeyFor(parsed.data) });
  }

  function addProduct(option: StockOption) {
    setDrafts((current) => [...current, { key: randomId(), product: option, unitName: option.baseUnit, quantity: "" }]);
  }

  const selectedIds = new Set(drafts.map((draft) => draft.product.id));
  const hasInvalidDrafts = drafts.length !== lines.length;
  const canSubmit =
    !submit.isPending &&
    lines.length > 0 &&
    !hasInvalidDrafts &&
    !isDebouncing &&
    (preview.data?.fullyAllocatable ?? false) &&
    !preview.isFetching;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Thông tin phiếu xuất" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field id={ids.destination} label="Nơi nhận" error={fieldErrors.destination}>
              <Input
                id={ids.destination}
                list={ids.destinations}
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                maxLength={200}
                aria-invalid={fieldErrors.destination ? true : undefined}
                aria-describedby={describedBy(ids.destination, fieldErrors.destination)}
              />
              <datalist id={ids.destinations}>
                {COMMON_DESTINATIONS.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </Field>
            <Field
              id={ids.minDays}
              label="Hạn dùng còn lại tối thiểu (ngày)"
              hint="Để trống để dùng mức mặc định của hệ thống."
              error={fieldErrors.minRemainingShelfLifeDays}
            >
              <Input
                id={ids.minDays}
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_SHELF_LIFE_DAYS}
                value={minDays}
                onChange={(event) => setMinDays(event.target.value)}
                aria-describedby={describedBy(ids.minDays, fieldErrors.minRemainingShelfLifeDays)}
              />
            </Field>
            <Field id={ids.note} label="Ghi chú" className="sm:col-span-2">
              <Textarea id={ids.note} rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Thuốc cần xuất" description="Nhập theo đơn vị bất kỳ; hệ thống quy đổi về đơn vị cơ sở." />
          <CardBody>
            <ProductPicker label="Thêm thuốc" queryKey="stock" search={searchStock} onSelect={addProduct} excludeIds={selectedIds} />
          </CardBody>
          {drafts.length > 0 ? (
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full text-sm">
                <caption className="sr-only">Các dòng thuốc trong phiếu xuất</caption>
                <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Thuốc
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Đơn vị
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Số lượng
                    </th>
                    <th scope="col" className="px-4 py-2.5">
                      <span className="sr-only">Thao tác</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {drafts.map((draft) => (
                    <IssueLineRow
                      key={draft.key}
                      line={draft}
                      onChange={(next) => setDrafts((current) => current.map((item) => (item.key === next.key ? next : item)))}
                      onRemove={() => setDrafts((current) => current.filter((item) => item.key !== draft.key))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {fieldErrors.lines ? (
            <p role="alert" className="border-t border-slate-100 px-5 py-3 text-sm font-medium text-red-600">
              {fieldErrors.lines}
            </p>
          ) : null}
        </Card>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start" aria-label="Phân bổ lô theo FEFO">
        <Card>
          <CardHeader title="Phân bổ FEFO" description="Cập nhật tự động khi bạn sửa số lượng" />
          <CardBody>
            <IssuePreviewPanel
              preview={preview.data}
              isFetching={preview.isFetching}
              error={preview.error ? errorMessage(preview.error) : undefined}
              hasLines={lines.length > 0}
            />
          </CardBody>
        </Card>
        {submit.error ? <Alert tone="danger">{errorMessage(submit.error)}</Alert> : null}
        <Button type="submit" className="w-full" disabled={!canSubmit}>
          {submit.isPending ? "Đang xuất kho…" : "Xác nhận xuất kho"}
        </Button>
      </aside>
    </form>
  );
}
