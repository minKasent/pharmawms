import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/features/auth/current-user";
import { Forbidden } from "@/features/auth/forbidden";
import { can } from "@/features/auth/user";
import { ProductForm } from "@/features/catalog/product-form";
import { categoryListSchema } from "@/features/catalog/schemas";
import { backendGet } from "@/lib/api/backend";

export const metadata: Metadata = { title: "Thêm thuốc" };

async function NewProductView() {
  const [user, categories] = await Promise.all([getCurrentUser(), backendGet("/categories", categoryListSchema)]);
  return can(user, "CATALOG_MANAGE") ? <ProductForm categories={categories} /> : <Forbidden action="thêm thuốc vào danh mục" />;
}

export default function NewProductPage() {
  return (
    <>
      <PageHeader title="Thêm thuốc vào danh mục" description="Mã SKU và đơn vị cơ sở không đổi được sau khi tạo." />
      <Suspense fallback={<LoadingCard label="Đang tải biểu mẫu" rows={8} />}>
        <NewProductView />
      </Suspense>
    </>
  );
}
