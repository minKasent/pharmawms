import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { TBody, THead, Table, Td, Th } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatCompactCurrency, formatCurrency, formatInteger } from "@/lib/format";

type PolicyRow = {
  code: "P0" | "P1" | "P2" | "P3";
  name: string;
  subtitle: string;
  fillRateText: string;
  stockoutDays: number;
  expiredWasteValue: number;
  avgInventoryCapital: number;
  isCurrent?: boolean;
};

const POLICIES: readonly PolicyRow[] = [
  {
    code: "P0",
    name: "Min/Max cố định 14–42 ngày",
    subtitle: "Ngưỡng tĩnh theo kinh nghiệm thủ kho, không phân hạng ABC, không xét hạn dùng",
    fillRateText: "96,11%",
    stockoutDays: 387,
    expiredWasteValue: 860_339_950,
    avgInventoryCapital: 659_707_781,
  },
  {
    code: "P1",
    name: "(R, s, S) + Moving Average 28/91 ngày",
    subtitle: "Tồn kho an toàn theo công thức thống kê cổ điển, dự báo trung bình trượt",
    fillRateText: "98,04%",
    stockoutDays: 173,
    expiredWasteValue: 269_926_120,
    avgInventoryCapital: 481_872_503,
  },
  {
    code: "P2",
    name: "(R, s, S) + LightGBM AI",
    subtitle: "Dự báo nhu cầu 28 ngày bằng ML có biến mùa dịch, chưa lọc tồn cận hạn và trần SL hạn dùng",
    fillRateText: "98,63%",
    stockoutDays: 109,
    expiredWasteValue: 113_511_900,
    avgInventoryCapital: 471_734_424,
  },
  {
    code: "P3",
    name: "(R, s, S) + LightGBM AI + Expiry-Aware",
    subtitle: "Loại tồn cận hạn khỏi vị thế IP để đặt bù sớm & chặn trần lượng đặt theo hạn dùng còn lại",
    fillRateText: "99,66%",
    stockoutDays: 43,
    expiredWasteValue: 1_601_450,
    avgInventoryCapital: 398_095_427,
    isCurrent: true,
  },
];

const MAX_WASTE = 860_339_950;
const MAX_STOCKOUT = 387;
const MAX_CAPITAL = 659_707_781;

function widthPct(value: number, max: number): string {
  return `${Math.max(2, Math.min(100, Math.round((value / max) * 100)))}%`;
}

export function PolicyBenchmarkCard() {
  return (
    <Card>
      <CardHeader
        title="Đối chứng Thực nghiệm 4 Chính sách Tồn kho (180 ngày • 56 mặt hàng thuốc)"
        description="Kết quả mô phỏng đối chứng trên tập dữ liệu lịch sử xuất kho thực tế chứng minh hiệu quả vượt trội của mô hình kết hợp LightGBM AI + Chính sách (R, s, S) có xét hạn dùng GSP (P3)."
        actions={<Badge tone="brand">P3 đang áp dụng</Badge>}
      />

      {/* Top 4 Impact KPIs (P0 -> P3) */}
      <CardBody className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-600">Tỷ lệ đáp ứng (Fill Rate)</span>
              <Badge tone="success">+3,55 điểm %</Badge>
            </div>
            <p className="mt-1.5 text-lg font-bold tracking-tight text-slate-900 tabular-nums">
              <span className="text-sm font-normal text-slate-500 line-through">96,11%</span> →{" "}
              <span className="text-emerald-700">99,66%</span>
            </p>
            <p className="mt-0.5 text-xs text-slate-500">Đảm bảo thuốc thiết yếu nhóm A đạt SL ≥ 98%</p>
          </div>

          <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-600">Số ngày-SKU đứt hàng</span>
              <Badge tone="brand">Giảm 88,9%</Badge>
            </div>
            <p className="mt-1.5 text-lg font-bold tracking-tight text-slate-900 tabular-nums">
              <span className="text-sm font-normal text-slate-500 line-through">387</span> →{" "}
              <span className="text-brand-700">43 ngày-SKU</span>
            </p>
            <p className="mt-0.5 text-xs text-slate-500">Nhờ loại tồn cận hạn khỏi IP để chủ động đặt bù sớm</p>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-600">Giá trị thuốc hủy do hết hạn</span>
              <Badge tone="success">Giảm 99,8%</Badge>
            </div>
            <p className="mt-1.5 text-lg font-bold tracking-tight text-slate-900 tabular-nums" title={`${formatCurrency(860_339_950)} → ${formatCurrency(1_601_450)}`}>
              <span className="text-sm font-normal text-slate-500 line-through">860,34 tr ₫</span> →{" "}
              <span className="text-emerald-700">1,60 tr ₫</span>
            </p>
            <p className="mt-0.5 text-xs text-slate-500">Tiết kiệm 858.738.500 ₫ thuốc hết hạn phải tiêu hủy</p>
          </div>

          <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-600">Vốn tồn kho bình quân</span>
              <Badge tone="violet">Tiết kiệm 39,7%</Badge>
            </div>
            <p className="mt-1.5 text-lg font-bold tracking-tight text-slate-900 tabular-nums" title={`${formatCurrency(659_707_781)} → ${formatCurrency(398_095_427)}`}>
              <span className="text-sm font-normal text-slate-500 line-through">659,71 tr ₫</span> →{" "}
              <span className="text-violet-700">398,10 tr ₫</span>
            </p>
            <p className="mt-0.5 text-xs text-slate-500">Giải phóng hơn 261,6 triệu ₫ vốn lưu động của bệnh viện</p>
          </div>
        </div>

        {/* Visual Horizontal Comparison Bars */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <h4 className="text-xs font-semibold tracking-wider text-slate-700 uppercase">
              Giá trị thuốc hủy do hết hạn (Càng thấp càng tốt)
            </h4>
            <div className="space-y-2">
              {POLICIES.map((p) => (
                <div key={p.code} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className={cn("font-mono font-semibold", p.isCurrent ? "text-emerald-800" : "text-slate-600")}>
                      {p.code}
                    </span>
                    <span className={cn("tabular-nums", p.isCurrent ? "font-bold text-emerald-700" : "text-slate-700")}>
                      {formatCurrency(p.expiredWasteValue)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200/80" aria-hidden="true">
                    <div
                      className={cn("h-full rounded-full", p.isCurrent ? "bg-emerald-600" : "bg-rose-500/80")}
                      style={{ width: widthPct(p.expiredWasteValue, MAX_WASTE) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <h4 className="text-xs font-semibold tracking-wider text-slate-700 uppercase">
              Số ngày-SKU đứt hàng (Càng thấp càng tốt)
            </h4>
            <div className="space-y-2">
              {POLICIES.map((p) => (
                <div key={p.code} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className={cn("font-mono font-semibold", p.isCurrent ? "text-brand-800" : "text-slate-600")}>
                      {p.code}
                    </span>
                    <span className={cn("tabular-nums", p.isCurrent ? "font-bold text-brand-700" : "text-slate-700")}>
                      {formatInteger(p.stockoutDays)} ngày-SKU
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200/80" aria-hidden="true">
                    <div
                      className={cn("h-full rounded-full", p.isCurrent ? "bg-brand-600" : "bg-amber-500")}
                      style={{ width: widthPct(p.stockoutDays, MAX_STOCKOUT) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <h4 className="text-xs font-semibold tracking-wider text-slate-700 uppercase">
              Vốn tồn kho bình quân (Tối ưu vốn lưu động)
            </h4>
            <div className="space-y-2">
              {POLICIES.map((p) => (
                <div key={p.code} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className={cn("font-mono font-semibold", p.isCurrent ? "text-violet-800" : "text-slate-600")}>
                      {p.code}
                    </span>
                    <span className={cn("tabular-nums", p.isCurrent ? "font-bold text-violet-700" : "text-slate-700")}>
                      {formatCompactCurrency(p.avgInventoryCapital)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200/80" aria-hidden="true">
                    <div
                      className={cn("h-full rounded-full", p.isCurrent ? "bg-violet-600" : "bg-slate-500")}
                      style={{ width: widthPct(p.avgInventoryCapital, MAX_CAPITAL) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardBody>

      {/* Full Benchmark Table */}
      <Table caption="Bảng tổng hợp kết quả thực nghiệm đối chứng 4 chính sách điều độ tồn kho P0 – P3">
        <THead>
          <tr>
            <Th>Mã</Th>
            <Th>Chính sách điều độ & Mô hình dự báo</Th>
            <Th numeric>Tỷ lệ đáp ứng (Fill Rate)</Th>
            <Th numeric>Ngày-SKU đứt hàng</Th>
            <Th numeric>Giá trị hủy do hết hạn</Th>
            <Th numeric>Vốn tồn kho bình quân</Th>
          </tr>
        </THead>
        <TBody>
          {POLICIES.map((policy) => (
            <tr key={policy.code} className={cn("hover:bg-slate-50", policy.isCurrent && "bg-emerald-50/40")}>
              <Td className="font-mono text-xs font-bold">
                <Badge tone={policy.isCurrent ? "success" : "neutral"}>{policy.code}</Badge>
              </Td>
              <Td>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("font-semibold", policy.isCurrent ? "text-emerald-950" : "text-slate-900")}>
                    {policy.name}
                  </span>
                  {policy.isCurrent ? <Badge tone="brand">Đang áp dụng</Badge> : null}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{policy.subtitle}</p>
              </Td>
              <Td numeric className={cn("tabular-nums", policy.isCurrent && "font-bold text-emerald-700")}>
                {policy.fillRateText}
              </Td>
              <Td numeric className={cn("tabular-nums", policy.isCurrent && "font-bold text-brand-700")}>
                {formatInteger(policy.stockoutDays)}
              </Td>
              <Td numeric className={cn("tabular-nums", policy.isCurrent ? "font-bold text-emerald-700" : "text-rose-700")}>
                {formatCurrency(policy.expiredWasteValue)}
              </Td>
              <Td numeric className={cn("tabular-nums", policy.isCurrent && "font-bold text-violet-700")}>
                {formatCurrency(policy.avgInventoryCapital)}
              </Td>
            </tr>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}
