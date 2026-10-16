import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/features/auth/current-user";
import { Forbidden } from "@/features/auth/forbidden";
import { can } from "@/features/auth/user";
import { NewStockTakeForm } from "@/features/inventory/new-stock-take-form";
import { warehouseListSchema } from "@/features/inventory/schemas";
import { backendGet } from "@/lib/api/backend";

export const metadata: Metadata = { title: "Lập phiếu kiểm kê" };

async function FormGate() {
  const [user, warehouses] = await Promise.all([getCurrentUser(), backendGet("/warehouses", warehouseListSchema)]);
  return can(user, "STOCK_COUNT") ? <NewStockTakeForm warehouses={warehouses} /> : <Forbidden action="lập phiếu kiểm kê" />;
}

export default function NewStockTakePage() {
  return (
    <>
      <PageHeader title="Lập phiếu kiểm kê" description="Chọn khu vực; hệ thống khóa snapshot tồn tại thời điểm tạo phiếu." />
      <Suspense fallback={<LoadingCard label="Đang tải khu vực" rows={4} />}>
        <FormGate />
      </Suspense>
    </>
  );
}
