import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/features/auth/current-user";
import { Forbidden } from "@/features/auth/forbidden";
import { can } from "@/features/auth/user";
import { toLocationOptions } from "@/features/inventory/locations";
import { ReceiptForm } from "@/features/inventory/receipt-form";
import { warehouseListSchema } from "@/features/inventory/schemas";
import { getSuppliers } from "@/features/purchasing/data";
import { backendGet } from "@/lib/api/backend";

export const metadata: Metadata = { title: "Nhập kho trực tiếp" };

async function ReceiptFormGate() {
  const [user, warehouses, suppliers] = await Promise.all([
    getCurrentUser(),
    backendGet("/warehouses", warehouseListSchema),
    getSuppliers(),
  ]);
  if (!can(user, "STOCK_RECEIVE")) {
    return <Forbidden action="nhập kho" />;
  }
  const activeSuppliers = suppliers?.filter((supplier) => supplier.active).map((supplier) => ({ id: supplier.id, name: supplier.name })) ?? null;
  return <ReceiptForm locations={toLocationOptions(warehouses)} suppliers={activeSuppliers} />;
}

export default function NewReceiptPage() {
  return (
    <>
      <PageHeader
        title="Nhập kho trực tiếp"
        description="Dùng cho hàng nhập ngoài đơn mua (điều chuyển, tài trợ, tồn đầu kỳ). Hàng theo đơn mua nhận tại trang chi tiết đơn."
      />
      <Suspense fallback={<LoadingCard label="Đang tải biểu mẫu" rows={6} />}>
        <ReceiptFormGate />
      </Suspense>
    </>
  );
}
