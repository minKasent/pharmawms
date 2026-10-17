import Plus from "lucide-react/dist/esm/icons/plus";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, withQuery } from "@/components/ui/pagination";
import { EmptyRow, TBody, THead, Table, Td, Th } from "@/components/ui/table";
import { getCurrentUser } from "@/features/auth/current-user";
import { can } from "@/features/auth/user";
import { PoStatusBadge } from "@/features/purchasing/po-status-badge";
import { PO_STATUSES, type PurchaseOrderStatus, poStatusLabel, purchaseOrderPageSchema } from "@/features/purchasing/schemas";
import { backendGet } from "@/lib/api/backend";
import { cn } from "@/lib/cn";
import { formatCurrency, formatDateTime, formatInteger } from "@/lib/format";
import { enumParam, pageParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Đơn mua hàng" };

const PAGE_SIZE = 20;

function StatusTabs({ current }: { current?: PurchaseOrderStatus }) {
  const tabs: { status?: PurchaseOrderStatus; label: string }[] = [
    { label: "Tất cả" },
    ...PO_STATUSES.map((status) => ({ status, label: poStatusLabel[status].label })),
  ];
  return (
    <nav aria-label="Lọc theo trạng thái" className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3 py-2">
      {tabs.map((tab) => {
        const isActive = tab.status === current;
        return (
          <Link
            key={tab.label}
            href={withQuery("/purchase-orders", { status: tab.status })}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap",
              isActive ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-100",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

async function OrderTable({ status, page }: { status?: PurchaseOrderStatus; page: number }) {
  const orders = await backendGet(withQuery("/purchase-orders", { status, page, size: PAGE_SIZE }), purchaseOrderPageSchema);
  return (
    <>
      <Table caption="Đơn mua hàng, mới nhất trước">
        <THead>
          <tr>
            <Th>Số đơn</Th>
            <Th>Nhà cung cấp</Th>
            <Th>Trạng thái</Th>
            <Th>Ngày lập</Th>
            <Th numeric>Số dòng</Th>
            <Th numeric>Giá trị</Th>
            <Th>Người lập</Th>
          </tr>
        </THead>
        <TBody>
          {orders.content.length === 0 ? (
            <EmptyRow colSpan={7}>Không có đơn mua nào.</EmptyRow>
          ) : (
            orders.content.map((order) => (
              <tr key={order.id} className="hover:bg-slate-50">
                <Td className="font-mono text-xs">
                  <Link href={`/purchase-orders/${order.id}`} className="text-brand-700 hover:underline">
                    {order.code}
                  </Link>
                  {order.source === "SUGGESTION" ? (
                    <span className="ml-2">
                      <Badge tone="violet">AI</Badge>
                    </span>
                  ) : null}
                </Td>
                <Td>{order.supplierName}</Td>
                <Td>
                  <PoStatusBadge status={order.status} />
                </Td>
                <Td className="whitespace-nowrap tabular-nums">{formatDateTime(order.createdAt)}</Td>
                <Td numeric>{formatInteger(order.lineCount)}</Td>
                <Td numeric>{formatCurrency(order.totalAmount)}</Td>
                <Td className="text-slate-600">{order.createdByName ?? "—"}</Td>
              </tr>
            ))
          )}
        </TBody>
      </Table>
      <Pagination
        page={orders.page}
        totalPages={orders.totalPages}
        totalElements={orders.totalElements}
        hrefFor={(target) => withQuery("/purchase-orders", { status, page: target })}
      />
    </>
  );
}

async function NewOrderAction() {
  const user = await getCurrentUser();
  return can(user, "PURCHASE_ORDER_MANAGE") ? (
    <ButtonLink href="/purchase-orders/new">
      <Plus aria-hidden="true" className="size-4" />
      Lập đơn mua
    </ButtonLink>
  ) : null;
}

export default function PurchaseOrdersPage({ searchParams }: PageProps<"/purchase-orders">) {
  return (
    <>
      <PageHeader
        title="Đơn mua hàng"
        description="Quy trình: nháp → chờ duyệt → đã duyệt → gửi nhà cung cấp → nhận hàng. Người lập không được tự duyệt đơn."
        actions={
          <Suspense>
            <NewOrderAction />
          </Suspense>
        }
      />
      <Suspense fallback={<LoadingCard label="Đang tải đơn mua" rows={10} />}>
        {searchParams.then((params) => {
          const status = enumParam(params.status, PO_STATUSES);
          return (
            <Card>
              <StatusTabs current={status} />
              <OrderTable status={status} page={pageParam(params.page)} />
            </Card>
          );
        })}
      </Suspense>
    </>
  );
}
