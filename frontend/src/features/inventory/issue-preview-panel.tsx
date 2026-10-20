import { Alert } from "@/components/ui/feedback";
import { formatDate, formatInteger } from "@/lib/format";

import { AllocationTable } from "./allocation-table";
import type { IssuePreview } from "./schemas";

type Props = {
  preview: IssuePreview | undefined;
  isFetching: boolean;
  error: string | undefined;
  hasLines: boolean;
};

export function IssuePreviewPanel({ preview, isFetching, error, hasLines }: Props) {
  if (!hasLines) {
    return <p className="text-sm text-slate-500">Thêm thuốc và số lượng để xem hệ thống phân bổ lô theo FEFO.</p>;
  }
  if (error) {
    return <Alert tone="danger">{error}</Alert>;
  }
  if (!preview) {
    return <p className="text-sm text-slate-500">Đang tính phân bổ…</p>;
  }
  return (
    <div className="space-y-4" aria-busy={isFetching}>
      <p className="text-xs text-slate-500">
        Chỉ lấy lô có hạn dùng từ <span className="font-medium text-slate-700">{formatDate(preview.minExpiryDate)}</span> trở đi, lô hết hạn sớm
        hơn được lấy trước.
      </p>
      {preview.fullyAllocatable ? (
        <Alert tone="success">Đủ hàng cho toàn bộ phiếu xuất.</Alert>
      ) : (
        <Alert tone="warning" title="Không đủ hàng khả dụng">
          Giảm số lượng ở các dòng thiếu hàng hoặc bỏ chúng ra khỏi phiếu.
        </Alert>
      )}
      <ul className="space-y-3">
        {preview.lines.map((line) => (
          <li key={line.productId} className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-slate-900">{line.productName}</p>
              <p className="text-xs whitespace-nowrap text-slate-500 tabular-nums">
                {formatInteger(line.requestedQuantity)} {line.baseUnit}
              </p>
            </div>
            {line.allocations.length > 0 ? (
              <div className="mt-2">
                <AllocationTable allocations={line.allocations} unit={line.baseUnit} />
              </div>
            ) : null}
            {line.shortage > 0 ? (
              <p className="mt-2 text-xs font-medium text-red-700">
                Thiếu {formatInteger(line.shortage)} {line.baseUnit}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
