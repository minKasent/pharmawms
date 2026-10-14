"use client";

import Trash2 from "lucide-react/dist/esm/icons/trash-2";

import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/field";
import { useProduct } from "@/features/catalog/use-product";
import { formatCurrency, formatInteger } from "@/lib/format";

import { storageCondition } from "./labels";
import { type LocationOption, locationsFor } from "./locations";

export type ReceiptLineDraft = {
  key: string;
  productId: number;
  productName: string;
  sku: string;
  baseUnit: string;
  lotNumber: string;
  manufactureDate: string;
  expiryDate: string;
  locationId: string;
  unitName: string;
  quantity: string;
  unitCost: string;
};

type Props = {
  line: ReceiptLineDraft;
  index: number;
  locations: LocationOption[];
  onChange: (line: ReceiptLineDraft) => void;
  onRemove?: () => void;
  /** Ordered quantity still to receive (PO receipts); shown as a hint. */
  remainingQuantity?: number;
};

const LABEL = "block text-xs font-medium text-slate-600";

export function ReceiptLineFields({ line, index, locations, onChange, onRemove, remainingQuantity }: Props) {
  const product = useProduct(line.productId);
  const storage = product.data ? storageCondition(product.data.storageCondition) : undefined;
  const allowedLocations = locationsFor(locations, product.data?.storageCondition);
  const units = product.data?.units ?? [{ unitName: line.baseUnit, factorToBase: 1 }];
  const factor = units.find((unit) => unit.unitName === line.unitName)?.factorToBase ?? 1;
  const baseQuantity = Number(line.quantity) * factor;
  const id = (field: string) => `${line.key}-${field}`;
  const set = (patch: Partial<ReceiptLineDraft>) => onChange({ ...line, ...patch });

  return (
    <fieldset className="rounded-lg border border-slate-200 p-4">
      <legend className="sr-only">
        Dòng {index + 1}: {line.productName}
      </legend>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-900">
            {index + 1}. {line.productName}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {line.sku}
            {storage ? <Badge tone={storage.tone}>{storage.label}</Badge> : null}
            {product.data ? <span>HSD còn lại tối thiểu khi nhập: {formatInteger(product.data.minShelfLifeOnReceiptDays)} ngày</span> : null}
          </p>
        </div>
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Bỏ dòng ${line.productName}`}
            className="inline-flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <label htmlFor={id("lot")} className={LABEL}>
            Số lô
          </label>
          <Input
            id={id("lot")}
            value={line.lotNumber}
            onChange={(event) => set({ lotNumber: event.target.value.toUpperCase() })}
            maxLength={50}
            required
            className="font-mono uppercase"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={id("mfg")} className={LABEL}>
            Ngày sản xuất
          </label>
          <Input id={id("mfg")} type="date" value={line.manufactureDate} onChange={(event) => set({ manufactureDate: event.target.value })} />
        </div>
        <div className="space-y-1">
          <label htmlFor={id("exp")} className={LABEL}>
            Hạn dùng
          </label>
          <Input id={id("exp")} type="date" value={line.expiryDate} onChange={(event) => set({ expiryDate: event.target.value })} required />
        </div>
        <div className="space-y-1">
          <label htmlFor={id("location")} className={LABEL}>
            Vị trí cất
          </label>
          <Select id={id("location")} value={line.locationId} onChange={(event) => set({ locationId: event.target.value })} required>
            <option value="">Chọn vị trí…</option>
            {allowedLocations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.code} · {location.zoneName}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label htmlFor={id("unit")} className={LABEL}>
            Đơn vị
          </label>
          <Select id={id("unit")} value={line.unitName} onChange={(event) => set({ unitName: event.target.value })}>
            {units.map((unit) => (
              <option key={unit.unitName} value={unit.unitName}>
                {unit.factorToBase === 1 ? unit.unitName : `${unit.unitName} (${formatInteger(unit.factorToBase)} ${line.baseUnit})`}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label htmlFor={id("qty")} className={LABEL}>
            Số lượng
          </label>
          <Input
            id={id("qty")}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={line.quantity}
            onChange={(event) => set({ quantity: event.target.value })}
            required
            className="text-right tabular-nums"
          />
          <p className="text-xs text-slate-500 tabular-nums">
            {baseQuantity > 0 && factor !== 1 ? `= ${formatInteger(baseQuantity)} ${line.baseUnit}` : null}
            {remainingQuantity !== undefined ? ` Còn phải nhận ${formatInteger(remainingQuantity)} ${line.baseUnit}` : null}
          </p>
        </div>
        <div className="space-y-1 lg:col-span-2">
          <label htmlFor={id("cost")} className={LABEL}>
            Đơn giá / {line.baseUnit} (₫)
          </label>
          <Input
            id={id("cost")}
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={line.unitCost}
            onChange={(event) => set({ unitCost: event.target.value })}
            required
            className="text-right tabular-nums"
          />
          {baseQuantity > 0 && Number(line.unitCost) > 0 ? (
            <p className="text-xs text-slate-500 tabular-nums">Thành tiền {formatCurrency(baseQuantity * Number(line.unitCost))}</p>
          ) : null}
        </div>
      </div>
    </fieldset>
  );
}
