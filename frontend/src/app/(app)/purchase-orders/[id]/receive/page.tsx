import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Alert, LoadingCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/features/auth/current-user";
import { Forbidden } from "@/features/auth/forbidden";
import { can } from "@/features/auth/user";
import { toLocationOptions } from "@/features/inventory/locations";
import { warehouseListSchema } from "@/features/inventory/schemas";
import { PoReceiveForm } from "@/features/purchasing/po-receive-form";
import { purchaseOrderSchema } from "@/features/purchasing/schemas";
import { backendGet } from "@/lib/api/backend";
import { positiveIntParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Nhận hàng theo đơn" };

const RECEIVABLE = new Set(["SENT", "PARTIALLY_RECEIVED"]);

async function ReceiveView({ orderId }: { orderId: number }) {
  const [order, warehouses, user] = await Promise.all([
    backendGet(`/purchase-orders/${orderId}`, purchaseOrderSchema),
    backendGet("/warehouses", warehouseListSchema),
    getCurrentUser(),
  ]);
  return (
    <>
      <PageHeader title={`Nhận hàng đơn ${order.code}`} description={`Nhà cung cấp: ${order.supplierName}`} />
      {!can(user, "STOCK_RECEIVE") ? (
        <Forbidden action="nhập kho" />
      ) : !RECEIVABLE.has(order.status) ? (
        <Alert tone="warning" title="Đơn này không ở trạng thái nhận hàng">
          Chỉ nhận hàng cho đơn đã gửi nhà cung cấp hoặc đang nhận một phần.
        </Alert>
      ) : (
        <PoReceiveForm key={order.version} orderId={order.id} lines={order.lines} locations={toLocationOptions(warehouses)} />
      )}
    </>
  );
}

export default function ReceiveOrderPage({ params }: PageProps<"/purchase-orders/[id]/receive">) {
  return (
    <Suspense fallback={<LoadingCard label="Đang tải đơn mua" rows={6} />}>
      {params.then(({ id }) => {
        const orderId = positiveIntParam(id);
        if (!orderId) notFound();
        return <ReceiveView orderId={orderId} />;
      })}
    </Suspense>
  );
}
