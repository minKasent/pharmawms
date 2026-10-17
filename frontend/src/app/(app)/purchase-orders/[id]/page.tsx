import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, LoadingCard } from "@/components/ui/feedback";
import { PrintButton } from "@/components/ui/print-button";
import { TBody, THead, Table, Td, Th } from "@/components/ui/table";
import { getCurrentUser } from "@/features/auth/current-user";
import { can } from "@/features/auth/user";
import { PoActions } from "@/features/purchasing/po-actions";
import { PoStatusBadge } from "@/features/purchasing/po-status-badge";
import { PoTimeline } from "@/features/purchasing/po-timeline";
import { poSourceLabel, purchaseOrderSchema } from "@/features/purchasing/schemas";
import { backendGet } from "@/lib/api/backend";
import { formatCurrency, formatDateTime, formatInteger } from "@/lib/format";
import { positiveIntParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Đơn mua hàng" };

async function PurchaseOrderView({ orderId }: { orderId: number }) {
  const [order, user] = await Promise.all([backendGet(`/purchase-orders/${orderId}`, purchaseOrderSchema), getCurrentUser()]);
  const facts = [
    { label: "Nhà cung cấp", value: order.supplierName },
    { label: "Nguồn", value: poSourceLabel[order.source] },
    { label: "Người lập", value: `${order.createdByName ?? "—"} · ${formatDateTime(order.createdAt)}` },
    { label: "Người duyệt", value: order.approvedAt ? `${order.approvedByName ?? "—"} · ${formatDateTime(order.approvedAt)}` : "—" },
  ];

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <nav aria-label="Đường dẫn" className="no-print text-sm text-slate-500">
            <Link href="/purchase-orders" className="hover:underline">
              Đơn mua hàng
            </Link>{" "}
            / <span className="text-slate-700">{order.code}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Đơn mua {order.code}</h1>
            <PoStatusBadge status={order.status} />
            {order.source === "SUGGESTION" ? <Badge tone="violet">Từ đề xuất AI</Badge> : null}
          </div>
          {order.note ? <p className="text-sm text-slate-600">{order.note}</p> : null}
        </div>
        <div className="no-print flex flex-wrap items-start gap-2">
          <PrintButton label="In phiếu" />
          <PoActions
            orderId={order.id}
            status={order.status}
            canManage={can(user, "PURCHASE_ORDER_MANAGE")}
            canApprove={can(user, "PURCHASE_ORDER_APPROVE") && order.createdBy !== user.id}
            canReceive={can(user, "STOCK_RECEIVE")}
          />
        </div>
      </header>

      {order.status === "DRAFT" && order.rejectionReason ? (
        <Alert tone="warning" title="Đơn bị từ chối ở lần duyệt trước">
          {order.rejectionReason}
        </Alert>
      ) : null}

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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader title="Dòng hàng" description={`Tổng giá trị ${formatCurrency(order.totalAmount)}`} />
          <Table caption="Các dòng thuốc trong đơn mua">
            <THead>
              <tr>
                <Th>Thuốc</Th>
                <Th numeric>Đặt</Th>
                <Th numeric>Đã nhận</Th>
                <Th numeric>Còn lại</Th>
                <Th numeric>Đơn giá</Th>
                <Th numeric>Thành tiền</Th>
              </tr>
            </THead>
            <TBody>
              {order.lines.map((line) => (
                <tr key={line.productId}>
                  <Td className="min-w-48">
                    <Link href={`/products/${line.productId}`} className="font-medium text-slate-900 hover:underline">
                      {line.productName}
                    </Link>
                    <span className="block text-xs text-slate-500">
                      {line.sku}
                      {line.suggestionId ? " · theo đề xuất" : ""}
                    </span>
                  </Td>
                  <Td numeric>
                    {formatInteger(line.quantity)} <span className="text-xs text-slate-500">{line.baseUnit}</span>
                  </Td>
                  <Td numeric className={line.receivedQuantity > 0 ? "text-emerald-700" : "text-slate-400"}>
                    {formatInteger(line.receivedQuantity)}
                  </Td>
                  <Td numeric className={line.remainingQuantity > 0 ? "font-medium" : "text-slate-400"}>
                    {formatInteger(line.remainingQuantity)}
                  </Td>
                  <Td numeric>{formatCurrency(line.unitPrice)}</Td>
                  <Td numeric>{formatCurrency(line.lineTotal)}</Td>
                </tr>
              ))}
            </TBody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Lịch sử xử lý" />
          <CardBody>
            <PoTimeline events={order.events} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}

export default function PurchaseOrderPage({ params }: PageProps<"/purchase-orders/[id]">) {
  return (
    <Suspense fallback={<LoadingCard label="Đang tải đơn mua" rows={8} />}>
      {params.then(({ id }) => {
        const orderId = positiveIntParam(id);
        if (!orderId) notFound();
        return <PurchaseOrderView orderId={orderId} />;
      })}
    </Suspense>
  );
}
