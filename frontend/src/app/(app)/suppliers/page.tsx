import Plus from "lucide-react/dist/esm/icons/plus";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, TBody, THead, Table, Td, Th } from "@/components/ui/table";
import { getCurrentUser } from "@/features/auth/current-user";
import { Forbidden } from "@/features/auth/forbidden";
import { can } from "@/features/auth/user";
import { getSuppliers } from "@/features/purchasing/data";
import { formatInteger } from "@/lib/format";

export const metadata: Metadata = { title: "Nhà cung cấp" };

const COLUMN_COUNT = 5;

async function SupplierTable() {
  const suppliers = await getSuppliers();
  if (!suppliers) {
    return <Forbidden action="xem nhà cung cấp" />;
  }
  return (
    <Table caption="Danh sách nhà cung cấp">
      <THead>
        <tr>
          <Th>Nhà cung cấp</Th>
          <Th>Liên hệ</Th>
          <Th numeric>Lead time (ngày)</Th>
          <Th>Trạng thái</Th>
          <Th>
            <span className="sr-only">Chi tiết</span>
          </Th>
        </tr>
      </THead>
      <TBody>
        {suppliers.length === 0 ? (
          <EmptyRow colSpan={COLUMN_COUNT}>Chưa có nhà cung cấp.</EmptyRow>
        ) : (
          suppliers.map((supplier) => (
            <tr key={supplier.id} className="hover:bg-slate-50">
              <Td className="min-w-56">
                <Link href={`/suppliers/${supplier.id}`} className="font-medium text-slate-900 hover:underline">
                  {supplier.name}
                </Link>
                <span className="block font-mono text-xs text-slate-500">{supplier.code}</span>
              </Td>
              <Td className="text-slate-600">
                {[supplier.phone, supplier.email].filter(Boolean).join(" · ") || "—"}
              </Td>
              <Td numeric>{formatInteger(supplier.defaultLeadTimeDays)}</Td>
              <Td>{supplier.active ? <Badge tone="success">Đang hợp tác</Badge> : <Badge tone="neutral">Ngừng</Badge>}</Td>
              <Td className="text-right">
                <Link href={`/suppliers/${supplier.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                  Chi tiết
                </Link>
              </Td>
            </tr>
          ))
        )}
      </TBody>
    </Table>
  );
}

async function NewSupplierAction() {
  const user = await getCurrentUser();
  return can(user, "SUPPLIER_MANAGE") ? (
    <ButtonLink href="/suppliers/new">
      <Plus aria-hidden="true" className="size-4" />
      Thêm nhà cung cấp
    </ButtonLink>
  ) : null;
}

export default function SuppliersPage() {
  return (
    <>
      <PageHeader
        title="Nhà cung cấp"
        description="Thông tin liên hệ, lead time mặc định và bảng giá (quy cách, MOQ, đơn giá) dùng khi lập đơn mua."
        actions={
          <Suspense>
            <NewSupplierAction />
          </Suspense>
        }
      />
      <Card>
        <Suspense fallback={<LoadingCard label="Đang tải nhà cung cấp" rows={8} />}>
          <SupplierTable />
        </Suspense>
      </Card>
    </>
  );
}
