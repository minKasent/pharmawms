import Plus from "lucide-react/dist/esm/icons/plus";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, withQuery } from "@/components/ui/pagination";
import { EmptyRow, TBody, THead, Table, Td, Th } from "@/components/ui/table";
import { getCurrentUser } from "@/features/auth/current-user";
import { can } from "@/features/auth/user";
import { receiptPageSchema } from "@/features/inventory/schemas";
import { getSupplierNames } from "@/features/purchasing/data";
import { backendGet } from "@/lib/api/backend";
import { formatCurrency, formatDateTime, formatInteger } from "@/lib/format";
import { pageParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Nhập kho" };

const PAGE_SIZE = 20;

async function ReceiptTable({ page }: { page: number }) {
  const [receipts, supplierNames] = await Promise.all([
    backendGet(withQuery("/goods-receipts", { page, size: PAGE_SIZE }), receiptPageSchema),
    getSupplierNames(),
  ]);
  return (
    <>
      <Table caption="Phiếu nhập kho, mới nhất trước">
        <THead>
          <tr>
            <Th>Số phiếu</Th>
            <Th>Thời gian</Th>
            <Th>Nhà cung cấp</Th>
            <Th>Đơn mua</Th>
            <Th numeric>Số dòng</Th>
            <Th numeric>Giá trị</Th>
            <Th>Người nhận</Th>
          </tr>
        </THead>
        <TBody>
          {receipts.content.length === 0 ? (
            <EmptyRow colSpan={7}>Chưa có phiếu nhập nào.</EmptyRow>
          ) : (
            receipts.content.map((receipt) => (
              <tr key={receipt.id} className="hover:bg-slate-50">
                <Td className="font-mono text-xs">
                  <Link href={`/receipts/${receipt.id}`} className="text-brand-700 hover:underline">
                    {receipt.code}
                  </Link>
                </Td>
                <Td className="whitespace-nowrap tabular-nums">{formatDateTime(receipt.receivedAt)}</Td>
                <Td>{receipt.supplierId ? (supplierNames.get(receipt.supplierId) ?? `#${receipt.supplierId}`) : "—"}</Td>
                <Td className="text-xs">
                  {receipt.purchaseOrderId ? (
                    <Link href={`/purchase-orders/${receipt.purchaseOrderId}`} className="text-brand-700 hover:underline">
                      Đơn #{receipt.purchaseOrderId}
                    </Link>
                  ) : (
                    <span className="text-slate-500">Nhập trực tiếp</span>
                  )}
                </Td>
                <Td numeric>{formatInteger(receipt.lineCount)}</Td>
                <Td numeric>{formatCurrency(receipt.totalValue)}</Td>
                <Td className="text-slate-600">{receipt.receivedByName ?? "—"}</Td>
              </tr>
            ))
          )}
        </TBody>
      </Table>
      <Pagination
        page={receipts.page}
        totalPages={receipts.totalPages}
        totalElements={receipts.totalElements}
        hrefFor={(target) => withQuery("/receipts", { page: target })}
      />
    </>
  );
}

async function NewReceiptAction() {
  const user = await getCurrentUser();
  return can(user, "STOCK_RECEIVE") ? (
    <ButtonLink href="/receipts/new">
      <Plus aria-hidden="true" className="size-4" />
      Nhập kho trực tiếp
    </ButtonLink>
  ) : null;
}

export default function ReceiptsPage({ searchParams }: PageProps<"/receipts">) {
  return (
    <>
      <PageHeader
        title="Nhập kho"
        description="Phiếu nhập theo đơn mua hoặc nhập trực tiếp; mỗi dòng tạo hoặc bổ sung một lô thuốc."
        actions={
          <Suspense>
            <NewReceiptAction />
          </Suspense>
        }
      />
      <Card>
        <Suspense fallback={<LoadingCard label="Đang tải phiếu nhập" rows={10} />}>
          {searchParams.then((params) => (
            <ReceiptTable page={pageParam(params.page)} />
          ))}
        </Suspense>
      </Card>
    </>
  );
}
