import type { Metadata } from "next";
import { Suspense } from "react";

import { ButtonLink } from "@/components/ui/button";
import { LoadingCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/features/auth/current-user";
import { can } from "@/features/auth/user";
import { batchListSchema, warehouseListSchema } from "@/features/inventory/schemas";
import { WarehouseMap } from "@/features/inventory/warehouse-map";
import { backendGet } from "@/lib/api/backend";

export const metadata: Metadata = { title: "Sơ đồ kho GSP" };

async function WarehouseMapView() {
  const [warehouses, batches, user] = await Promise.all([
    backendGet("/warehouses", warehouseListSchema),
    backendGet("/batches", batchListSchema),
    getCurrentUser(),
  ]);

  return <WarehouseMap warehouses={warehouses} batches={batches} canManage={can(user, "WAREHOUSE_MANAGE")} />;
}

export default function WarehousesPage() {
  return (
    <>
      <PageHeader
        title="Sơ đồ kho GSP & Giám sát vùng nhiệt độ"
        description="Bản đồ 2D trực quan theo 3 dải nhiệt độ bảo quản chuẩn GSP (Thường 15–30°C · Mát 8–15°C · Lạnh 2–8°C), mật độ lưu kệ và truy vết từng lô thuốc."
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            <ButtonLink href="/stock" variant="secondary">
              Bảng tồn kho
            </ButtonLink>
            <ButtonLink href="/stock-takes" variant="secondary">
              Phiếu kiểm kê
            </ButtonLink>
          </div>
        }
      />
      <Suspense fallback={<LoadingCard label="Đang tải sơ đồ kho GSP" rows={10} />}>
        <WarehouseMapView />
      </Suspense>
    </>
  );
}
