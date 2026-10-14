import { formatDate, formatInteger } from "@/lib/format";

import type { Allocation } from "./schemas";

/** Batches FEFO picked for one line, in the order they are taken from the shelf. */
export function AllocationTable({ allocations, unit }: { allocations: Allocation[]; unit: string }) {
  return (
    <table className="w-full text-xs">
      <caption className="sr-only">Lô được phân bổ theo FEFO</caption>
      <thead className="text-left text-slate-500">
        <tr>
          <th scope="col" className="py-1 pr-2 font-medium">
            Lô
          </th>
          <th scope="col" className="py-1 pr-2 font-medium">
            Hạn dùng
          </th>
          <th scope="col" className="py-1 pr-2 font-medium">
            Vị trí
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            Lấy
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {allocations.map((allocation) => (
          <tr key={`${allocation.batchId}-${allocation.locationId}`}>
            <td className="py-1 pr-2 font-mono">{allocation.lotNumber}</td>
            <td className="py-1 pr-2 tabular-nums">{formatDate(allocation.expiryDate)}</td>
            <td className="py-1 pr-2">{allocation.locationCode}</td>
            <td className="py-1 text-right font-medium tabular-nums">
              {formatInteger(allocation.quantity)} {unit}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
