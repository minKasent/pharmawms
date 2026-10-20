import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LoadingCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { PrintButton } from "@/components/ui/print-button";
import { TBody, THead, Table, Td, Th } from "@/components/ui/table";
import { receiptSchema } from "@/features/inventory/schemas";
import { getSupplierNames } from "@/features/purchasing/data";
import { backendGet } from "@/lib/api/backend";
import { formatCurrency, formatDate, formatDateTime, formatInteger } from "@/lib/format";
import { positiveIntParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Phiếu nhập" };

async function ReceiptView({ receiptId }: { receiptId: number }) {
  const [receipt, supplierNames] = await Promise.all([backendGet(`/goods-receipts/${receiptId}`, receiptSchema), getSupplierNames()]);
  const total = receipt.lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
  const facts = [
    { label: "Thời gian", value: formatDateTime(receipt.receivedAt) },
    { label: "Người nhận", value: receipt.receivedByName ?? "—" },
    { label: "Nhà cung cấp", value: receipt.supplierId ? (supplierNames.get(receipt.supplierId) ?? `#${receipt.supplierId}`) : "—" },
    { label: "Tổng giá trị", value: formatCurrency(total) },
  ];

  return (
    <>
      <PageHeader
        title={`Phiếu nhập ${receipt.code}`}
        description={
          receipt.purchaseOrderId ? (
            <>
              Nhận hàng theo{" "}
              <Link href={`/purchase-orders/${receipt.purchaseOrderId}`} className="text-brand-700 hover:underline">
                đơn mua #{receipt.purchaseOrderId}
              </Link>
              {receipt.note ? ` · ${receipt.note}` : null}
            </>
          ) : (
            (receipt.note ?? "Nhập kho trực tiếp")
          )
        }
        actions={<PrintButton label="In phiếu" />}
      />
      <Card>
        <CardBody>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt className="text-slate-500">{fact.label}</dt>
                <dd className="mt-0.5 font-medium text-slate-900">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Các lô đã nhập" description={`${formatInteger(receipt.lines.length)} dòng`} />
        <Table caption="Chi tiết lô nhập kho">
          <THead>
            <tr>
              <Th>Thuốc</Th>
              <Th>Số lô</Th>
              <Th>NSX</Th>
              <Th>Hạn dùng</Th>
              <Th>Vị trí</Th>
              <Th numeric>Số lượng</Th>
              <Th numeric>Đơn giá</Th>
              <Th numeric>Thành tiền</Th>
            </tr>
          </THead>
          <TBody>
            {receipt.lines.map((line) => (
              <tr key={`${line.batchId}-${line.locationId}`}>
                <Td>
                  <Link href={`/products/${line.productId}`} className="font-medium text-slate-900 hover:underline">
                    {line.productName}
                  </Link>
                  <span className="block text-xs text-slate-500">{line.sku}</span>
                </Td>
                <Td className="font-mono text-xs">{line.lotNumber}</Td>
                <Td>{line.manufactureDate ? formatDate(line.manufactureDate) : "—"}</Td>
                <Td>{formatDate(line.expiryDate)}</Td>
                <Td className="text-xs">{line.locationCode}</Td>
                <Td numeric>
                  {formatInteger(line.quantity)} <span className="text-xs text-slate-500">{line.baseUnit}</span>
                </Td>
                <Td numeric>{formatCurrency(line.unitCost)}</Td>
                <Td numeric>{formatCurrency(line.quantity * line.unitCost)}</Td>
              </tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}

export default function ReceiptPage({ params }: PageProps<"/receipts/[id]">) {
  return (
    <Suspense fallback={<LoadingCard label="Đang tải phiếu nhập" rows={6} />}>
      {params.then(({ id }) => {
        const receiptId = positiveIntParam(id);
        if (!receiptId) notFound();
        return <ReceiptView receiptId={receiptId} />;
      })}
    </Suspense>
  );
}
