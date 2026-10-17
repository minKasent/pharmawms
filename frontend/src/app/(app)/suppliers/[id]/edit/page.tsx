import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LoadingCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/features/auth/current-user";
import { Forbidden } from "@/features/auth/forbidden";
import { can } from "@/features/auth/user";
import { getSupplier } from "@/features/purchasing/data";
import { SupplierForm } from "@/features/purchasing/supplier-form";
import { positiveIntParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Sửa nhà cung cấp" };

async function EditView({ supplierId }: { supplierId: number }) {
  const [user, supplier] = await Promise.all([getCurrentUser(), getSupplier(supplierId)]);
  return (
    <>
      <PageHeader title={`Sửa ${supplier.name}`} description={`Mã ${supplier.code}`} />
      {can(user, "SUPPLIER_MANAGE") ? <SupplierForm supplier={supplier} /> : <Forbidden action="sửa nhà cung cấp" />}
    </>
  );
}

export default function EditSupplierPage({ params }: PageProps<"/suppliers/[id]/edit">) {
  return (
    <Suspense fallback={<LoadingCard label="Đang tải nhà cung cấp" rows={5} />}>
      {params.then(({ id }) => {
        const supplierId = positiveIntParam(id);
        if (!supplierId) notFound();
        return <EditView supplierId={supplierId} />;
      })}
    </Suspense>
  );
}
