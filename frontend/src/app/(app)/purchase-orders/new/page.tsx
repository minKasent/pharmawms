import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/features/auth/current-user";
import { Forbidden } from "@/features/auth/forbidden";
import { can } from "@/features/auth/user";
import { getSuppliers } from "@/features/purchasing/data";
import { PoForm } from "@/features/purchasing/po-form";

export const metadata: Metadata = { title: "Lập đơn mua" };

async function PoFormGate() {
  const [user, suppliers] = await Promise.all([getCurrentUser(), getSuppliers()]);
  if (!can(user, "PURCHASE_ORDER_MANAGE") || !suppliers) {
    return <Forbidden action="lập đơn mua" />;
  }
  return <PoForm suppliers={suppliers.filter((supplier) => supplier.active).map((supplier) => ({ id: supplier.id, name: supplier.name }))} />;
}

export default function NewPurchaseOrderPage() {
  return (
    <>
      <PageHeader title="Lập đơn mua hàng" description="Đơn được lưu ở trạng thái nháp; gửi duyệt khi đã hoàn tất." />
      <Suspense fallback={<LoadingCard label="Đang tải biểu mẫu" rows={6} />}>
        <PoFormGate />
      </Suspense>
    </>
  );
}
