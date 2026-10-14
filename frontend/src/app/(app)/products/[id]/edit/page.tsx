import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LoadingCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/features/auth/current-user";
import { Forbidden } from "@/features/auth/forbidden";
import { can } from "@/features/auth/user";
import { ProductForm } from "@/features/catalog/product-form";
import { categoryListSchema, productDetailSchema } from "@/features/catalog/schemas";
import { backendGet } from "@/lib/api/backend";
import { positiveIntParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Sửa thông tin thuốc" };

async function EditProductView({ productId }: { productId: number }) {
  const [user, product, categories] = await Promise.all([
    getCurrentUser(),
    backendGet(`/products/${productId}`, productDetailSchema),
    backendGet("/categories", categoryListSchema),
  ]);
  return (
    <>
      <PageHeader title={`Sửa ${product.name}`} description={`${product.sku} · đơn vị cơ sở ${product.baseUnit}`} />
      {can(user, "CATALOG_MANAGE") ? (
        <ProductForm key={product.version} categories={categories} product={product} />
      ) : (
        <Forbidden action="sửa danh mục thuốc" />
      )}
    </>
  );
}

export default function EditProductPage({ params }: PageProps<"/products/[id]/edit">) {
  return (
    <Suspense fallback={<LoadingCard label="Đang tải thông tin thuốc" rows={8} />}>
      {params.then(({ id }) => {
        const productId = positiveIntParam(id);
        if (!productId) notFound();
        return <EditProductView productId={productId} />;
      })}
    </Suspense>
  );
}
