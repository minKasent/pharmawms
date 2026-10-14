"use client";

import Trash2 from "lucide-react/dist/esm/icons/trash-2";

import { Input, Select } from "@/components/ui/field";
import type { ProductOption } from "@/features/catalog/product-picker";
import { useProduct } from "@/features/catalog/use-product";
import { formatInteger } from "@/lib/format";

export type IssueLineDraft = {
  key: string;
  product: ProductOption & { available: number };
  unitName: string;
  quantity: string;
};

type Props = {
  line: IssueLineDraft;
  onChange: (line: IssueLineDraft) => void;
  onRemove: () => void;
};

export function IssueLineRow({ line, onChange, onRemove }: Props) {
  const product = useProduct(line.product.id);
  const units = product.data?.units ?? [{ unitName: line.product.baseUnit, factorToBase: 1 }];
  const factor = units.find((unit) => unit.unitName === line.unitName)?.factorToBase ?? 1;
  const quantity = Number(line.quantity);
  const baseQuantity = Number.isInteger(quantity) && quantity > 0 ? quantity * factor : 0;
  const isOverAvailable = baseQuantity > line.product.available;
  const unitId = `${line.key}-unit`;
  const quantityId = `${line.key}-quantity`;

  return (
    <tr>
      <td className="px-4 py-2.5 align-top">
        <p className="font-medium text-slate-900">{line.product.name}</p>
        <p className="text-xs text-slate-500">
          {line.product.sku} · khả dụng {formatInteger(line.product.available)} {line.product.baseUnit}
        </p>
      </td>
      <td className="px-4 py-2.5 align-top">
        <label htmlFor={unitId} className="sr-only">
          Đơn vị tính cho {line.product.name}
        </label>
        <Select id={unitId} value={line.unitName} onChange={(event) => onChange({ ...line, unitName: event.target.value })} className="w-32">
          {units.map((unit) => (
            <option key={unit.unitName} value={unit.unitName}>
              {unit.factorToBase === 1 ? unit.unitName : `${unit.unitName} (${formatInteger(unit.factorToBase)})`}
            </option>
          ))}
        </Select>
      </td>
      <td className="px-4 py-2.5 align-top">
        <label htmlFor={quantityId} className="sr-only">
          Số lượng {line.product.name}
        </label>
        <Input
          id={quantityId}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={line.quantity}
          onChange={(event) => onChange({ ...line, quantity: event.target.value })}
          aria-invalid={isOverAvailable ? true : undefined}
          className="w-28 text-right tabular-nums"
        />
        {factor !== 1 && baseQuantity > 0 ? (
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            = {formatInteger(baseQuantity)} {line.product.baseUnit}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-2.5 text-right align-top">
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Bỏ ${line.product.name} khỏi phiếu`}
          className="inline-flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700"
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </button>
      </td>
    </tr>
  );
}
