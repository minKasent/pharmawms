import { Card, CardHeader } from "@/components/ui/card";
import { EmptyRow, TBody, THead, Table, Td, Th } from "@/components/ui/table";
import { backendGet } from "@/lib/api/backend";
import { formatCurrency, formatDate, formatInteger } from "@/lib/format";

import { BatchActions } from "./batch-actions";
import { BatchStatusBadge, ExpiryCell } from "./expiry-badge";
import { batchListSchema } from "./schemas";

type Props = { productId: number; canHold: boolean; canDispose?: boolean };

export async function ProductBatchesCard({ productId, canHold, canDispose = false }: Props) {
  const batches = await backendGet(`/batches?productId=${productId}`, batchListSchema);
  const inStock = batches.filter((batch) => batch.onHand > 0);
  const totals = {
    available: inStock
      .filter((batch) => batch.status === "AVAILABLE" && batch.daysToExpiry > 0)
      .reduce((sum, batch) => sum + batch.onHand, 0),
    expired: inStock
      .filter((batch) => batch.status === "EXPIRED" || (batch.status !== "DISPOSED" && batch.daysToExpiry <= 0))
      .reduce((sum, batch) => sum + batch.onHand, 0),
    blocked: inStock
      .filter((batch) => !(batch.status === "AVAILABLE" && batch.daysToExpiry > 0))
      .reduce((sum, batch) => sum + batch.onHand, 0),
  };
  const unit = batches[0]?.baseUnit ?? "";

  return (
    <Card>
      <CardHeader
        title="Lô đang tồn (thứ tự xuất FEFO)"
        description={`Khả dụng ${formatInteger(totals.available)} ${unit} · Không xuất được ${formatInteger(totals.blocked)} ${unit}${totals.expired > 0 ? ` (trong đó hết hạn ${formatInteger(totals.expired)} ${unit})` : ""}`}
      />
      <Table caption="Các lô còn tồn của thuốc, sắp xếp theo hạn dùng">
        <THead>
          <tr>
            <Th>Số lô</Th>
            <Th>Hạn dùng</Th>
            <Th>Trạng thái</Th>
            <Th>Vị trí</Th>
            <Th numeric>Tồn</Th>
            <Th numeric>Đơn giá</Th>
            <Th>Ngày nhận</Th>
            <Th className="text-right">Thao tác</Th>
          </tr>
        </THead>
        <TBody>
          {inStock.length === 0 ? (
            <EmptyRow colSpan={8}>Không còn lô nào trong kho.</EmptyRow>
          ) : (
            inStock.map((batch) => (
              <tr key={batch.id}>
                <Td className="font-mono text-xs">{batch.lotNumber}</Td>
                <Td>
                  <ExpiryCell expiryDate={batch.expiryDate} daysToExpiry={batch.daysToExpiry} />
                </Td>
                <Td>
                  <BatchStatusBadge status={batch.status} />
                  {batch.holdReason ? <span className="mt-1 block max-w-56 text-xs text-slate-500">{batch.holdReason}</span> : null}
                </Td>
                <Td className="text-xs">{batch.balances.map((balance) => `${balance.locationCode} (${formatInteger(balance.onHand)})`).join(", ")}</Td>
                <Td numeric className="font-medium">
                  {formatInteger(batch.onHand)}
                </Td>
                <Td numeric>{formatCurrency(batch.unitCost)}</Td>
                <Td>{formatDate(batch.receivedAt)}</Td>
                <Td className="text-right">
                  <BatchActions
                    batchId={batch.id}
                    productId={productId}
                    lotNumber={batch.lotNumber}
                    status={batch.status}
                    daysToExpiry={batch.daysToExpiry}
                    onHand={batch.onHand}
                    canHold={canHold}
                    canDispose={canDispose}
                  />
                </Td>
              </tr>
            ))
          )}
        </TBody>
      </Table>
    </Card>
  );
}
