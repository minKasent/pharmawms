import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, TBody, THead, Table, Td, Th } from "@/components/ui/table";
import { getCurrentUser } from "@/features/auth/current-user";
import { can } from "@/features/auth/user";
import { disposalListSchema } from "@/features/inventory/schemas";
import { backendGet } from "@/lib/api/backend";
import { formatCurrency, formatDateTime, formatInteger } from "@/lib/format";

export const metadata: Metadata = { title: "Hủy thuốc" };

async function DisposalTable() {
  const disposals = await backendGet("/disposals", disposalListSchema);
  return (
    <Table caption="Các biên bản hủy thuốc">
      <THead>
        <tr>
          <Th>Số biên bản</Th>
          <Th>Thời gian</Th>
          <Th>Lý do</Th>
          <Th numeric>Số dòng</Th>
          <Th numeric>Giá trị hủy</Th>
          <Th>Người lập</Th>
        </tr>
      </THead>
      <TBody>
        {disposals.length === 0 ? (
          <EmptyRow colSpan={6}>Chưa có biên bản hủy nào.</EmptyRow>
        ) : (
          disposals.map((disposal) => (
            <tr key={disposal.id} className="hover:bg-slate-50">
              <Td className="font-mono text-xs">
                <Link href={`/disposals/${disposal.id}`} className="text-brand-700 hover:underline">
                  {disposal.code}
                </Link>
              </Td>
              <Td className="whitespace-nowrap tabular-nums">{formatDateTime(disposal.disposedAt)}</Td>
              <Td className="max-w-md">{disposal.reason}</Td>
              <Td numeric>{formatInteger(disposal.lineCount)}</Td>
              <Td numeric className="font-medium text-red-700">
                {formatCurrency(disposal.totalValue)}
              </Td>
              <Td className="text-slate-600">{disposal.disposedByName ?? "—"}</Td>
            </tr>
          ))
        )}
      </TBody>
    </Table>
  );
}

async function DisposeAction() {
  const user = await getCurrentUser();
  return can(user, "STOCK_DISPOSE") ? (
    <ButtonLink href="/batches?status=EXPIRED" variant="secondary">
      Chọn lô hết hạn để hủy
    </ButtonLink>
  ) : null;
}

export default function DisposalsPage() {
  return (
    <>
      <PageHeader
        title="Hủy thuốc"
        description="Biên bản xuất hủy các lô hết hạn hoặc bị thu hồi. Mỗi biên bản ghi bút toán hủy vào sổ cái."
        actions={
          <Suspense>
            <DisposeAction />
          </Suspense>
        }
      />
      <Card>
        <Suspense fallback={<LoadingCard label="Đang tải biên bản hủy" />}>
          <DisposalTable />
        </Suspense>
      </Card>
    </>
  );
}
