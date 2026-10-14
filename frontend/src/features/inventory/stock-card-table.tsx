import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyRow, TBody, THead, Table, Td, Th } from "@/components/ui/table";
import { backendGet } from "@/lib/api/backend";
import { withQuery } from "@/components/ui/pagination";
import { formatDate, formatDateTime, formatInteger } from "@/lib/format";

import { movementTypeLabel } from "./labels";
import { stockCardSchema } from "./schemas";

const REFERENCE_PATHS: Record<string, string> = {
  GOODS_RECEIPT: "/receipts",
  GOODS_ISSUE: "/issues",
  STOCK_TAKE: "/stock-takes",
  DISPOSAL: "/disposals",
};

function referenceHref(referenceType: string, referenceId: number): string | undefined {
  const base = REFERENCE_PATHS[referenceType];
  return base ? `${base}/${referenceId}` : undefined;
}

export async function StockCardTable({ productId, from, to }: { productId: number; from?: string; to?: string }) {
  const card = await backendGet(withQuery(`/products/${productId}/stock-card`, { from, to }), stockCardSchema);
  return (
    <Card>
      <CardHeader
        title="Thẻ kho"
        description={`Từ ${formatDate(card.from)} đến ${formatDate(card.to)} · Tồn đầu kỳ ${formatInteger(card.openingBalance)} · Tồn cuối kỳ ${formatInteger(card.closingBalance)} ${card.baseUnit}`}
      />
      <Table caption="Thẻ kho: các bút toán nhập, xuất, điều chỉnh và hủy">
        <THead>
          <tr>
            <Th>Thời gian</Th>
            <Th>Loại</Th>
            <Th>Chứng từ</Th>
            <Th>Lô · Vị trí</Th>
            <Th numeric>Nhập</Th>
            <Th numeric>Xuất</Th>
            <Th numeric>Tồn sau</Th>
            <Th>Người thực hiện</Th>
          </tr>
        </THead>
        <TBody>
          {card.entries.length === 0 ? (
            <EmptyRow colSpan={8}>Không có phát sinh trong kỳ.</EmptyRow>
          ) : (
            card.entries.map((entry) => {
              const type = movementTypeLabel[entry.movementType];
              const href = referenceHref(entry.referenceType, entry.referenceId);
              const code = entry.referenceCode ?? `#${entry.referenceId}`;
              return (
                <tr key={entry.movementId}>
                  <Td className="whitespace-nowrap tabular-nums">{formatDateTime(entry.occurredAt)}</Td>
                  <Td>
                    <Badge tone={type.tone}>{type.label}</Badge>
                  </Td>
                  <Td className="font-mono text-xs">
                    {href ? (
                      <Link href={href} className="text-brand-700 hover:underline">
                        {code}
                      </Link>
                    ) : (
                      code
                    )}
                  </Td>
                  <Td className="text-xs">
                    <span className="font-mono">{entry.lotNumber}</span> · {entry.locationCode}
                  </Td>
                  <Td numeric className={entry.quantityIn > 0 ? "text-emerald-700" : "text-slate-300"}>
                    {entry.quantityIn > 0 ? formatInteger(entry.quantityIn) : "—"}
                  </Td>
                  <Td numeric className={entry.quantityOut > 0 ? "text-rose-700" : "text-slate-300"}>
                    {entry.quantityOut > 0 ? formatInteger(entry.quantityOut) : "—"}
                  </Td>
                  <Td numeric className="font-medium">
                    {formatInteger(entry.balanceAfter)}
                  </Td>
                  <Td className="text-xs text-slate-600">{entry.performedByName ?? "—"}</Td>
                </tr>
              );
            })
          )}
        </TBody>
      </Table>
    </Card>
  );
}
