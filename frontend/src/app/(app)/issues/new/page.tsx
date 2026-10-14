import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/features/auth/current-user";
import { Forbidden } from "@/features/auth/forbidden";
import { can } from "@/features/auth/user";
import { IssueForm } from "@/features/inventory/issue-form";
import { stringParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Lập phiếu xuất" };

async function IssueFormGate({ initialSku }: { initialSku?: string }) {
  const user = await getCurrentUser();
  return can(user, "STOCK_ISSUE") ? <IssueForm initialSku={initialSku} /> : <Forbidden action="xuất kho" />;
}

export default function NewIssuePage({ searchParams }: PageProps<"/issues/new">) {
  return (
    <>
      <PageHeader
        title="Lập phiếu xuất kho"
        description="Hệ thống tự chọn lô theo FEFO (hết hạn trước – xuất trước), bỏ qua lô tạm khóa và lô không đủ hạn dùng còn lại."
      />
      <Suspense fallback={<LoadingCard label="Đang tải biểu mẫu" rows={6} />}>
        {searchParams.then((params) => (
          <IssueFormGate initialSku={stringParam(params.sku)} />
        ))}
      </Suspense>
    </>
  );
}
