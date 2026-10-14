import Plus from "lucide-react/dist/esm/icons/plus";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, withQuery } from "@/components/ui/pagination";
import { EmptyRow, TBody, THead, Table, Td, Th } from "@/components/ui/table";
import { getCurrentUser } from "@/features/auth/current-user";
import { can } from "@/features/auth/user";
import { issuePageSchema } from "@/features/inventory/schemas";
import { backendGet } from "@/lib/api/backend";
import { formatDateTime, formatInteger } from "@/lib/format";
import { pageParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Xuất kho" };

const PAGE_SIZE = 20;

async function IssueTable({ page }: { page: number }) {
  const issues = await backendGet(withQuery("/goods-issues", { page, size: PAGE_SIZE }), issuePageSchema);
  return (
    <>
      <Table caption="Phiếu xuất kho, mới nhất trước">
        <THead>
          <tr>
            <Th>Số phiếu</Th>
            <Th>Thời gian</Th>
            <Th>Nơi nhận</Th>
            <Th numeric>Số dòng</Th>
            <Th numeric>Tổng SL (đv cơ sở)</Th>
            <Th>Người xuất</Th>
          </tr>
        </THead>
        <TBody>
          {issues.content.length === 0 ? (
            <EmptyRow colSpan={6}>Chưa có phiếu xuất nào.</EmptyRow>
          ) : (
            issues.content.map((issue) => (
              <tr key={issue.id} className="hover:bg-slate-50">
                <Td className="font-mono text-xs">
                  <Link href={`/issues/${issue.id}`} className="text-brand-700 hover:underline">
                    {issue.code}
                  </Link>
                </Td>
                <Td className="whitespace-nowrap tabular-nums">{formatDateTime(issue.issuedAt)}</Td>
                <Td>{issue.destination}</Td>
                <Td numeric>{formatInteger(issue.lineCount)}</Td>
                <Td numeric>{formatInteger(issue.totalQuantity)}</Td>
                <Td className="text-slate-600">{issue.issuedByName ?? "—"}</Td>
              </tr>
            ))
          )}
        </TBody>
      </Table>
      <Pagination
        page={issues.page}
        totalPages={issues.totalPages}
        totalElements={issues.totalElements}
        hrefFor={(target) => withQuery("/issues", { page: target })}
      />
    </>
  );
}

async function NewIssueAction() {
  const user = await getCurrentUser();
  return can(user, "STOCK_ISSUE") ? (
    <ButtonLink href="/issues/new">
      <Plus aria-hidden="true" className="size-4" />
      Lập phiếu xuất
    </ButtonLink>
  ) : null;
}

export default function IssuesPage({ searchParams }: PageProps<"/issues">) {
  return (
    <>
      <PageHeader
        title="Xuất kho (FEFO)"
        description="Phiếu xuất cấp phát cho khoa/phòng; mỗi dòng được phân bổ vào các lô hết hạn sớm nhất."
        actions={
          <Suspense>
            <NewIssueAction />
          </Suspense>
        }
      />
      <Card>
        <Suspense fallback={<LoadingCard label="Đang tải phiếu xuất" rows={10} />}>
          {searchParams.then((params) => (
            <IssueTable page={pageParam(params.page)} />
          ))}
        </Suspense>
      </Card>
    </>
  );
}
