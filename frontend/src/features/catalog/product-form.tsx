"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Plus from "lucide-react/dist/esm/icons/plus";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { z } from "zod";

import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/field";
import { STORAGE_CONDITIONS, type StorageCondition, storageConditionLabel } from "@/features/inventory/labels";
import { errorMessage } from "@/lib/api/api-error";
import { apiRequest } from "@/lib/api/client";
import { randomId } from "@/lib/random-id";

import { type Category, type ProductDetail, productDetailSchema } from "./schemas";

const MAX_PACKAGINGS = 10;
const DEFAULT_MIN_SHELF_LIFE_DAYS = "180";
const MAX_SHELF_LIFE_DAYS = 3650;

type PackagingDraft = { key: string; unitName: string; factorToBase: string; gtin: string };

type ProductDraft = {
  sku: string;
  name: string;
  activeIngredient: string;
  strength: string;
  dosageForm: string;
  registrationNumber: string;
  manufacturer: string;
  atcCode: string;
  categoryId: string;
  storageCondition: StorageCondition;
  prescriptionRequired: boolean;
  baseUnit: string;
  minShelfLifeOnReceiptDays: string;
  referenceUnitCost: string;
  packagings: PackagingDraft[];
};

type TextKey = Exclude<
  { [Key in keyof ProductDraft]: ProductDraft[Key] extends string ? Key : never }[keyof ProductDraft],
  "storageCondition"
>;

const optionalText = (max: number) => z.string().trim().max(max, `tối đa ${max} ký tự`);

const toNum = (value: string) => (value.trim() === "" ? Number.NaN : Number(value));

const productFieldsSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên thuốc").max(200),
  activeIngredient: z.string().trim().min(1, "Nhập hoạt chất").max(200),
  strength: optionalText(100),
  dosageForm: optionalText(50),
  registrationNumber: optionalText(50),
  manufacturer: optionalText(200),
  atcCode: optionalText(10),
  categoryId: z.number({ error: "Chọn nhóm thuốc" }).int().positive("Chọn nhóm thuốc"),
  storageCondition: z.enum(STORAGE_CONDITIONS),
  prescriptionRequired: z.boolean(),
  baseUnit: z.string().trim().min(1, "Nhập đơn vị cơ sở").max(20),
  minShelfLifeOnReceiptDays: z
    .number({ error: "Hạn dùng tối thiểu không hợp lệ" })
    .int("Hạn dùng tối thiểu phải là số nguyên")
    .min(0)
    .max(MAX_SHELF_LIFE_DAYS, `Tối đa ${MAX_SHELF_LIFE_DAYS} ngày`),
  referenceUnitCost: z.number({ error: "Giá tham chiếu không hợp lệ" }).min(0, "Giá không được âm"),
  units: z
    .array(
      z.object({
        unitName: z.string().trim().min(1, "Nhập tên đơn vị đóng gói").max(20),
        factorToBase: z.number({ error: "Hệ số quy đổi không hợp lệ" }).int().min(2, "Hệ số quy đổi phải lớn hơn 1"),
        gtin: z
          .string()
          .trim()
          .regex(/^(\d{8,14})?$/, "GTIN gồm 8–14 chữ số"),
      }),
    )
    .max(MAX_PACKAGINGS),
});

const skuSchema = z
  .string()
  .trim()
  .min(1, "Nhập mã SKU")
  .max(30)
  .regex(/^[A-Za-z0-9._-]+$/, "SKU chỉ gồm chữ, số và . _ -");

function emptyDraft(categories: Category[]): ProductDraft {
  return {
    sku: "",
    name: "",
    activeIngredient: "",
    strength: "",
    dosageForm: "",
    registrationNumber: "",
    manufacturer: "",
    atcCode: "",
    categoryId: categories[0] ? String(categories[0].id) : "",
    storageCondition: "NORMAL",
    prescriptionRequired: false,
    baseUnit: "",
    minShelfLifeOnReceiptDays: DEFAULT_MIN_SHELF_LIFE_DAYS,
    referenceUnitCost: "0",
    packagings: [],
  };
}

function draftFrom(product: ProductDetail): ProductDraft {
  return {
    sku: product.sku,
    name: product.name,
    activeIngredient: product.activeIngredient,
    strength: product.strength ?? "",
    dosageForm: product.dosageForm ?? "",
    registrationNumber: product.registrationNumber ?? "",
    manufacturer: product.manufacturer ?? "",
    atcCode: product.atcCode ?? "",
    categoryId: String(product.categoryId),
    storageCondition: product.storageCondition,
    prescriptionRequired: product.prescriptionRequired,
    baseUnit: product.baseUnit,
    minShelfLifeOnReceiptDays: String(product.minShelfLifeOnReceiptDays),
    referenceUnitCost: String(product.referenceUnitCost),
    packagings: product.units
      .filter((unit) => unit.unitName !== product.baseUnit)
      .map((unit) => ({ key: randomId(), unitName: unit.unitName, factorToBase: String(unit.factorToBase), gtin: unit.gtin ?? "" })),
  };
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Dữ liệu không hợp lệ.";
  const [head, index] = issue.path;
  return head === "units" && typeof index === "number" ? `Quy cách ${index + 1}: ${issue.message}.` : `${issue.message}.`;
}

type Props = { categories: Category[]; product?: ProductDetail };

export function ProductForm({ categories, product }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = product !== undefined;
  const [draft, setDraft] = useState<ProductDraft>(() => (product ? draftFrom(product) : emptyDraft(categories)));
  const [validationError, setValidationError] = useState<string>();

  const save = useMutation({
    mutationFn: (body: object) =>
      product
        ? apiRequest(`/products/${product.id}`, productDetailSchema, { method: "PUT", body })
        : apiRequest("/products", productDetailSchema, { method: "POST", body }),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["product"] });
      void queryClient.invalidateQueries({ queryKey: ["product-picker"] });
      router.push(`/products/${saved.id}`);
      router.refresh();
    },
  });

  function set<Key extends keyof ProductDraft>(key: Key, value: ProductDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setPackaging(key: string, patch: Partial<PackagingDraft>) {
    set(
      "packagings",
      draft.packagings.map((packaging) => (packaging.key === key ? { ...packaging, ...patch } : packaging)),
    );
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = productFieldsSchema.safeParse({
      ...draft,
      categoryId: toNum(draft.categoryId),
      minShelfLifeOnReceiptDays: toNum(draft.minShelfLifeOnReceiptDays),
      referenceUnitCost: toNum(draft.referenceUnitCost),
      units: draft.packagings.map((packaging) => ({
        ...packaging,
        factorToBase: toNum(packaging.factorToBase),
      })),
    });
    if (!parsed.success) {
      setValidationError(firstIssue(parsed.error));
      return;
    }
    const fields = { ...parsed.data, units: parsed.data.units.map((unit) => ({ ...unit, gtin: unit.gtin || undefined })) };
    if (product) {
      setValidationError(undefined);
      save.mutate({ version: product.version, product: fields });
      return;
    }
    const sku = skuSchema.safeParse(draft.sku);
    if (!sku.success) {
      setValidationError(firstIssue(sku.error));
      return;
    }
    setValidationError(undefined);
    save.mutate({ sku: sku.data, product: fields });
  }

  const text = (key: TextKey, label: string, options?: { placeholder?: string; disabled?: boolean; hint?: string }) => (
    <Field id={`product-${key}`} label={label} hint={options?.hint}>
      <Input
        id={`product-${key}`}
        value={draft[key]}
        disabled={options?.disabled}
        placeholder={options?.placeholder}
        onChange={(event) => set(key, event.target.value)}
      />
    </Field>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <Card>
        <CardHeader title="Thông tin dược" />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {text("sku", "Mã SKU", { disabled: isEdit, placeholder: "VD: PARA500", hint: isEdit ? "Không đổi được mã đã tạo" : undefined })}
          <div className="sm:col-span-1 lg:col-span-3">{text("name", "Tên thuốc", { placeholder: "VD: Paracetamol 500mg" })}</div>
          <div className="lg:col-span-2">{text("activeIngredient", "Hoạt chất", { placeholder: "VD: Paracetamol" })}</div>
          {text("strength", "Hàm lượng", { placeholder: "VD: 500mg" })}
          {text("dosageForm", "Dạng bào chế", { placeholder: "VD: Viên nén" })}
          {text("registrationNumber", "Số đăng ký", { placeholder: "VD: VD-12345-20" })}
          <div className="lg:col-span-2">{text("manufacturer", "Nhà sản xuất")}</div>
          {text("atcCode", "Mã ATC", { placeholder: "VD: N02BE01" })}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Phân loại & bảo quản" description="Điều kiện bảo quản quyết định vị trí được phép cất khi nhập kho (GSP)." />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="product-category" label="Nhóm thuốc">
            <Select id="product-category" value={draft.categoryId} onChange={(event) => set("categoryId", event.target.value)}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="product-storage" label="Điều kiện bảo quản">
            <Select
              id="product-storage"
              value={draft.storageCondition}
              onChange={(event) => set("storageCondition", event.target.value as StorageCondition)}
            >
              {STORAGE_CONDITIONS.map((condition) => (
                <option key={condition} value={condition}>
                  {storageConditionLabel[condition].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="product-shelf-life" label="Hạn dùng tối thiểu khi nhập (ngày)" hint="Lô còn hạn ngắn hơn sẽ bị từ chối khi nhập">
            <Input
              id="product-shelf-life"
              type="number"
              inputMode="numeric"
              min={0}
              value={draft.minShelfLifeOnReceiptDays}
              onChange={(event) => set("minShelfLifeOnReceiptDays", event.target.value)}
            />
          </Field>
          <Field id="product-cost" label="Giá tham chiếu / đơn vị cơ sở (₫)">
            <Input
              id="product-cost"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={draft.referenceUnitCost}
              onChange={(event) => set("referenceUnitCost", event.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
            <input
              type="checkbox"
              checked={draft.prescriptionRequired}
              onChange={(event) => set("prescriptionRequired", event.target.checked)}
              className="size-4 accent-brand-600"
            />
            Thuốc kê đơn
          </label>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Đơn vị & quy cách đóng gói"
          description="Tồn kho và sổ cái luôn tính theo đơn vị cơ sở; các quy cách khác được quy đổi khi nhập/xuất."
        />
        <CardBody className="space-y-4">
          <div className="max-w-xs">
            {text("baseUnit", "Đơn vị cơ sở (nhỏ nhất)", {
              disabled: isEdit,
              placeholder: "VD: Viên",
              hint: isEdit ? "Không đổi được vì tồn kho tính theo đơn vị này" : undefined,
            })}
          </div>
          {draft.packagings.map((packaging, index) => (
            <fieldset key={packaging.key} className="grid items-end gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <legend className="sr-only">Quy cách {index + 1}</legend>
              <Field id={`${packaging.key}-name`} label="Đơn vị đóng gói">
                <Input
                  id={`${packaging.key}-name`}
                  value={packaging.unitName}
                  placeholder="VD: Hộp"
                  onChange={(event) => setPackaging(packaging.key, { unitName: event.target.value })}
                />
              </Field>
              <Field id={`${packaging.key}-factor`} label={`Bằng bao nhiêu ${draft.baseUnit || "đơn vị cơ sở"}`}>
                <Input
                  id={`${packaging.key}-factor`}
                  type="number"
                  inputMode="numeric"
                  min={2}
                  value={packaging.factorToBase}
                  onChange={(event) => setPackaging(packaging.key, { factorToBase: event.target.value })}
                />
              </Field>
              <Field id={`${packaging.key}-gtin`} label="Mã vạch GTIN (tùy chọn)">
                <Input
                  id={`${packaging.key}-gtin`}
                  inputMode="numeric"
                  value={packaging.gtin}
                  onChange={(event) => setPackaging(packaging.key, { gtin: event.target.value })}
                />
              </Field>
              <button
                type="button"
                aria-label={`Bỏ quy cách ${packaging.unitName || index + 1}`}
                onClick={() => set("packagings", draft.packagings.filter((item) => item.key !== packaging.key))}
                className="inline-flex size-10 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </button>
            </fieldset>
          ))}
          <Button
            variant="secondary"
            size="sm"
            disabled={draft.packagings.length >= MAX_PACKAGINGS}
            onClick={() => set("packagings", [...draft.packagings, { key: randomId(), unitName: "", factorToBase: "", gtin: "" }])}
          >
            <Plus aria-hidden="true" className="size-4" />
            Thêm quy cách
          </Button>
        </CardBody>
      </Card>

      {validationError ? <Alert tone="danger">{validationError}</Alert> : null}
      {save.error ? <Alert tone="danger">{errorMessage(save.error)}</Alert> : null}
      <div className="flex justify-end gap-2">
        <ButtonLink href={product ? `/products/${product.id}` : "/products"} variant="secondary">
          Hủy
        </ButtonLink>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Thêm thuốc"}
        </Button>
      </div>
    </form>
  );
}
