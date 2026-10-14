"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { formatDate, formatInteger } from "@/lib/format";

export type BatchLabelData = {
  productName: string;
  sku: string;
  lotNumber: string;
  manufactureDate?: string | null;
  expiryDate: string;
  locationCode?: string;
  quantity?: number;
  baseUnit?: string;
};

export function encodeBarcodeSegments(payload: string): { totalUnits: number; rects: { x: number; width: number }[] } {
  const bars: number[] = [2, 1, 1, 2, 1, 4]; // Start Code B guard
  let checksum = 104;
  for (let i = 0; i < payload.length; i++) {
    const code = Math.max(32, Math.min(126, payload.charCodeAt(i))) - 32;
    checksum = (checksum + code * (i + 1)) % 103;
    const b1 = (code % 3) + 1;
    const s1 = ((code >> 1) % 3) + 1;
    const b2 = ((code >> 2) % 3) + 1;
    const s2 = ((code >> 3) % 2) + 1;
    const b3 = Math.max(1, 9 - (b1 + s1 + b2 + s2));
    const s3 = 11 - (b1 + s1 + b2 + s2 + b3);
    bars.push(b1, s1, b2, s2, b3, Math.max(1, s3));
  }
  const c1 = (checksum % 3) + 1;
  const c2 = ((checksum >> 2) % 3) + 1;
  bars.push(c1, 1, c2, 2, 2, 2);
  bars.push(2, 3, 3, 1, 1, 1, 2); // Stop guard

  const rects: { x: number; width: number }[] = [];
  let cursor = 0;
  for (let i = 0; i < bars.length; i++) {
    const w = bars[i]!;
    if (i % 2 === 0) {
      rects.push({ x: cursor, width: w });
    }
    cursor += w;
  }
  return { totalUnits: cursor, rects };
}

function BarcodeSvg({ value }: { value: string }) {
  const { totalUnits, rects } = encodeBarcodeSegments(value);

  return (
    <svg
      viewBox={`0 0 ${totalUnits} 48`}
      className="h-14 w-full"
      role="img"
      aria-label={`Mã vạch định danh lô ${value}`}
      preserveAspectRatio="none"
    >
      {rects.map((rect) => (
        <rect key={rect.x} x={rect.x} y={0} width={rect.width} height={48} fill="#0f172a" />
      ))}
    </svg>
  );
}

export function BatchLabelDialog({
  data,
  onClose,
}: {
  data: BatchLabelData | null;
  onClose: () => void;
}) {
  if (!data) return null;

  const compactExp = data.expiryDate.replaceAll("-", "").slice(2, 8);
  const gs1String = `(01)${data.sku}(17)${compactExp}(10)${data.lotNumber}`;
  const rawBarcodePayload = `${data.sku}|${data.lotNumber}|${compactExp}`;

  return (
    <Dialog
      open={data !== null}
      onClose={onClose}
      title={`Tem nhãn định danh lô GSP · ${data.lotNumber}`}
      description="Nhãn nhiệt chuẩn GSP dán trên thùng/hộp thuốc để quản lý vị trí kệ và kiểm soát xuất kho FEFO."
      className="max-w-lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Đóng
          </Button>
          <Button type="button" onClick={() => window.print()}>
            In tem nhãn (Ctrl+P)
          </Button>
        </>
      }
    >
      <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-5 text-slate-900 shadow-xs">
        <div className="flex items-center justify-between border-b-2 border-slate-900 pb-2">
          <div>
            <p className="text-[10px] font-bold tracking-widest text-slate-600 uppercase">
              KHO DƯỢC BỆNH VIỆN · NHÃN KIỂM SOÁT LÔ GSP
            </p>
            <p className="mt-0.5 text-base font-bold text-slate-950">{data.productName}</p>
          </div>
          <span className="rounded border border-slate-900 px-2 py-0.5 font-mono text-xs font-bold">
            FEFO
          </span>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-b border-slate-200 pb-3 text-xs">
          <div>
            <dt className="text-[10px] font-semibold text-slate-500 uppercase">Mã thuốc (SKU)</dt>
            <dd className="font-mono text-sm font-bold text-slate-900">{data.sku}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold text-slate-500 uppercase">Số lô sản xuất (LOT)</dt>
            <dd className="font-mono text-sm font-bold text-slate-900">{data.lotNumber}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold text-slate-500 uppercase">Hạn dùng (EXP)</dt>
            <dd className="text-sm font-bold text-red-700 tabular-nums">{formatDate(data.expiryDate)}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold text-slate-500 uppercase">Ngày sản xuất (MFG)</dt>
            <dd className="text-sm font-medium text-slate-800 tabular-nums">
              {data.manufactureDate ? formatDate(data.manufactureDate) : "Theo hồ sơ lô"}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold text-slate-500 uppercase">Vị trí lưu kệ (LOC)</dt>
            <dd className="font-mono text-sm font-bold text-brand-800">{data.locationCode || "KHO-CHINH"}</dd>
          </div>
          {data.quantity != null ? (
            <div>
              <dt className="text-[10px] font-semibold text-slate-500 uppercase">Số lượng lô</dt>
              <dd className="text-sm font-bold text-slate-900 tabular-nums">
                {formatInteger(data.quantity)} {data.baseUnit ?? ""}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-3 space-y-1.5 text-center">
          <BarcodeSvg value={rawBarcodePayload} />
          <p className="font-mono text-[11px] font-semibold tracking-wider text-slate-700">{gs1String}</p>
        </div>
      </div>
    </Dialog>
  );
}

export function BatchLabelButton({
  data,
  label = "In tem",
}: {
  data: BatchLabelData;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <BatchLabelDialog data={open ? data : null} onClose={() => setOpen(false)} />
    </>
  );
}
