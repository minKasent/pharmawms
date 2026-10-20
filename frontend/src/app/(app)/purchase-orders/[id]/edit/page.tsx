import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Alert, LoadingCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/features/auth/current-user";
import { Forbidden } from "@/features/auth/forbidden";
import { can } from "@/features/auth/user";
import { getSuppliers } from "@/features/purchasing/data";
import { PoForm, type PoFormLine } from "@/features/purchasing/po-form";
import { purchaseOrderSchema, supplyTermsListSchema } from "@/features/purchasing/schemas";
import { backendGet } from "@/lib/api/backend";
import { positiveIntParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Sửa đơn mua" };

const DEFAULT_PACK_SIZE = 1;

async function EditView({ orderId }: { orderId: number }) {
  const [order, user, suppliers] = await Promise.all([
    backendGet(`/purchase-orders/${orderId}`, purchaseOrderSchema),
    getCurrentUser(),
    getSuppliers(),
  ]);
  if (!can(user, "PURCHASE_ORDER_MANAGE") || !suppliers) {
    return <Forbidden action="sửa đơn mua" />;
  }
  if (order.status !== "DRAFT") {
    return <Alert tone="warning">Chỉ sửa được đơn ở trạng thái nháp.</Alert>;
  }
  const terms = await backendGet(`/suppliers/${order.supplierId}/products`, supplyTermsListSchema);
  const termsByProduct = new Map(terms.map((item) => [item.productId, item]));
  const lines: PoFormLine[] = order.lines.map((line) => ({
    key: String(line.productId),
    productId: line.productId,
    productName: line.productName,
    sku: line.sku,
    baseUnit: line.baseUnit,
    packSize: termsByProduct.get(line.productId)?.packSize ?? DEFAULT_PACK_SIZE,
    minOrderQuantity: termsByProduct.get(line.productId)?.minOrderQuantity ?? 0,
    quantity: String(line.quantity),
    unitPrice: String(line.unitPrice),
  }));

  return (
    <>
      <PageHeader title={`Sửa đơn ${order.code}`} description={`Nhà cung cấp: ${order.supplierName}`} />
      <PoForm
        key={order.version}
        suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
        initial={{ orderId: order.id, version: order.version, supplierId: order.supplierId, note: order.note ?? "", lines }}
      />
    </>
  );
}

export default function EditPurchaseOrderPage({ params }: PageProps<"/purchase-orders/[id]/edit">) {
  return (
    <Suspense fallback={<LoadingCard label="Đang tải đơn mua" rows={6} />}>
      {params.then(({ id }) => {
        const orderId = positiveIntParam(id);
        if (!orderId) notFound();
        return <EditView orderId={orderId} />;
      })}
    </Suspense>
  );
}
