import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/features/auth/current-user";
import { Forbidden } from "@/features/auth/forbidden";
import { can } from "@/features/auth/user";
import { SupplierForm } from "@/features/purchasing/supplier-form";

export const metadata: Metadata = { title: "Thêm nhà cung cấp" };

async function FormGate() {
  const user = await getCurrentUser();
  return can(user, "SUPPLIER_MANAGE") ? <SupplierForm /> : <Forbidden action="thêm nhà cung cấp" />;
}

export default function NewSupplierPage() {
  return (
    <>
      <PageHeader title="Thêm nhà cung cấp" description="Mã nhà cung cấp không đổi được sau khi tạo." />
      <Suspense fallback={<LoadingCard label="Đang tải biểu mẫu" rows={5} />}>
        <FormGate />
      </Suspense>
    </>
  );
}
