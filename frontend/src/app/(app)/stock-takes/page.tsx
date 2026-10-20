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
import { can } from "@/features/auth/user";
import { STOCK_TAKE_STATUS_LABEL } from "@/features/inventory/labels";
import { stockTakeListSchema } from "@/features/inventory/schemas";
import { backendGet } from "@/lib/api/backend";
import { formatDateTime, formatInteger } from "@/lib/format";

export const metadata: Metadata = { title: "Kiểm kê" };

const COLUMN_COUNT = 7;

async function StockTakeTable() {
  const takes = await backendGet("/stock-takes", stockTakeListSchema);
  return (
    <Table caption="Phiếu kiểm kê, mới nhất trước">
      <THead>
        <tr>
          <Th>Số phiếu</Th>
          <Th>Khu</Th>
          <Th>Trạng thái</Th>
          <Th>Ngày lập</Th>
          <Th numeric>Số dòng</Th>
          <Th numeric>Chênh lệch</Th>
          <Th>Người lập</Th>
        </tr>
      </THead>
      <TBody>
        {takes.length === 0 ? (
          <EmptyRow colSpan={COLUMN_COUNT}>Chưa có phiếu kiểm kê.</EmptyRow>
        ) : (
          takes.map((take) => {
            const status = STOCK_TAKE_STATUS_LABEL[take.status];
            return (
              <tr key={take.id} className="hover:bg-slate-50">
                <Td className="font-mono text-xs">
                  <Link href={`/stock-takes/${take.id}`} className="text-brand-700 hover:underline">
                    {take.code}
                  </Link>
                </Td>
                <Td>{take.zoneCode}</Td>
                <Td>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </Td>
                <Td className="whitespace-nowrap tabular-nums">{formatDateTime(take.createdAt)}</Td>
                <Td numeric>{formatInteger(take.lineCount)}</Td>
                <Td numeric className={take.differenceCount > 0 ? "font-medium text-amber-800" : "text-slate-400"}>
                  {formatInteger(take.differenceCount)}
                </Td>
                <Td className="text-slate-600">{take.createdByName ?? "—"}</Td>
              </tr>
            );
          })
        )}
      </TBody>
    </Table>
  );
}

async function NewAction() {
  const user = await getCurrentUser();
  return can(user, "STOCK_COUNT") ? (
    <ButtonLink href="/stock-takes/new">
      <Plus aria-hidden="true" className="size-4" />
      Lập phiếu kiểm kê
    </ButtonLink>
  ) : null;
}

export default function StockTakesPage() {
  return (
    <>
      <PageHeader
        title="Kiểm kê kho"
        description="Chụp snapshot tồn theo khu → nhập số thực tế → gửi duyệt → điều chỉnh sổ cái. Người lập không được tự duyệt."
        actions={
          <Suspense>
            <NewAction />
          </Suspense>
        }
      />
      <Card>
        <Suspense fallback={<LoadingCard label="Đang tải phiếu kiểm kê" rows={8} />}>
          <StockTakeTable />
        </Suspense>
      </Card>
    </>
  );
}
