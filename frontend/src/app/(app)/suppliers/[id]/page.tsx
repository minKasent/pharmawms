import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LoadingCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/features/auth/current-user";
import { can } from "@/features/auth/user";
import { getSupplier } from "@/features/purchasing/data";
import { supplyTermsListSchema } from "@/features/purchasing/schemas";
import { SupplierTermsPanel } from "@/features/purchasing/supplier-terms-panel";
import { backendGet } from "@/lib/api/backend";
import { formatInteger } from "@/lib/format";
import { positiveIntParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Nhà cung cấp" };

async function SupplierView({ supplierId }: { supplierId: number }) {
  const [user, supplier, terms] = await Promise.all([
    getCurrentUser(),
    getSupplier(supplierId),
    backendGet(`/suppliers/${supplierId}/products`, supplyTermsListSchema),
  ]);
  const canManage = can(user, "SUPPLIER_MANAGE");
  const facts = [
    { label: "Điện thoại", value: supplier.phone ?? "—" },
    { label: "Email", value: supplier.email ?? "—" },
    { label: "Lead time", value: `${formatInteger(supplier.defaultLeadTimeDays)} ngày` },
    { label: "Địa chỉ", value: supplier.address ?? "—" },
  ];

  return (
    <>
      <nav aria-label="Đường dẫn" className="text-sm text-slate-500">
        <Link href="/suppliers" className="hover:underline">
          Nhà cung cấp
        </Link>{" "}
        / <span className="text-slate-700">{supplier.code}</span>
      </nav>
      <PageHeader
        title={supplier.name}
        description={`Mã ${supplier.code}`}
        actions={
          <>
            {supplier.active ? <Badge tone="success">Đang hợp tác</Badge> : <Badge tone="neutral">Ngừng</Badge>}
            {canManage ? (
              <ButtonLink href={`/suppliers/${supplier.id}/edit`} variant="secondary">
                Sửa
              </ButtonLink>
            ) : null}
          </>
        }
      />
      <Card>
        <CardBody>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt className="text-slate-500">{fact.label}</dt>
                <dd className="mt-0.5 font-medium text-slate-900">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Bảng giá" description="Quy cách đóng gói, MOQ và đơn giá theo đơn vị cơ sở." />
        <SupplierTermsPanel supplierId={supplier.id} terms={terms} canManage={canManage} />
      </Card>
    </>
  );
}

export default function SupplierDetailPage({ params }: PageProps<"/suppliers/[id]">) {
  return (
    <Suspense fallback={<LoadingCard label="Đang tải nhà cung cấp" rows={8} />}>
      {params.then(({ id }) => {
        const supplierId = positiveIntParam(id);
        if (!supplierId) notFound();
        return <SupplierView supplierId={supplierId} />;
      })}
    </Suspense>
  );
}
