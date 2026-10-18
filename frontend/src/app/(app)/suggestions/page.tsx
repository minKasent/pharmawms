import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { LoadingCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, withQuery } from "@/components/ui/pagination";
import { getCurrentUser } from "@/features/auth/current-user";
import { Forbidden } from "@/features/auth/forbidden";
import { can } from "@/features/auth/user";
import { ForecastSourceBadge } from "@/features/forecasting/run-badges";
import {
  SUGGESTION_STATUSES,
  type SuggestionStatus,
  forecastRunPageSchema,
  suggestionPageSchema,
  suggestionStatusLabel,
} from "@/features/forecasting/schemas";
import { SuggestionTable } from "@/features/forecasting/suggestion-table";
import { backendGetOptional } from "@/lib/api/backend";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime } from "@/lib/format";
import { enumParam, pageParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Đề xuất nhập" };

const PAGE_SIZE = 50;
const FORBIDDEN = 403;
const DEFAULT_STATUS: SuggestionStatus = "OPEN";

function StatusTabs({ current }: { current: SuggestionStatus }) {
  return (
    <nav aria-label="Lọc theo trạng thái" className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3 py-2">
      {SUGGESTION_STATUSES.map((status) => (
        <Link
          key={status}
          href={withQuery("/suggestions", { status: status === DEFAULT_STATUS ? undefined : status })}
          aria-current={status === current ? "page" : undefined}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap",
            status === current ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-100",
          )}
        >
          {suggestionStatusLabel[status]}
        </Link>
      ))}
    </nav>
  );
}

async function SuggestionList({ status, page }: { status: SuggestionStatus; page: number }) {
  const [user, suggestions, runs] = await Promise.all([
    getCurrentUser(),
    backendGetOptional(withQuery("/purchase-suggestions", { status, page, size: PAGE_SIZE }), suggestionPageSchema, [FORBIDDEN]),
    backendGetOptional(withQuery("/forecasting/runs", { size: 1 }), forecastRunPageSchema, [FORBIDDEN]),
  ]);
  if (!suggestions) {
    return <Forbidden action="xem đề xuất nhập hàng" />;
  }
  const latestRun = runs?.content[0];
  return (
    <Card>
      {latestRun ? (
        <p className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3 text-sm text-slate-600">
          Lượt dự báo gần nhất #{latestRun.id} · dữ liệu đến {formatDate(latestRun.asOfDate)} · chạy lúc {formatDateTime(latestRun.startedAt)}
          <ForecastSourceBadge source={latestRun.source} />
          <Link href="/forecasting" className="ml-auto font-medium text-brand-700 hover:underline">
            Xem độ chính xác mô hình
          </Link>
        </p>
      ) : null}
      <StatusTabs current={status} />
      <SuggestionTable
        key={status}
        suggestions={suggestions.content}
        canOrder={can(user, "PURCHASE_ORDER_MANAGE")}
        isOpenList={status === "OPEN"}
      />
      <Pagination
        page={suggestions.page}
        totalPages={suggestions.totalPages}
        totalElements={suggestions.totalElements}
        hrefFor={(target) => withQuery("/suggestions", { status: status === DEFAULT_STATUS ? undefined : status, page: target })}
      />
    </Card>
  );
}

export default function SuggestionsPage({ searchParams }: PageProps<"/suggestions">) {
  return (
    <>
      <PageHeader
        title="Đề xuất nhập hàng"
        description="Tính từ dự báo nhu cầu của AI theo chính sách (R, s, S): đặt hàng khi vị thế tồn xuống dưới điểm đặt hàng s, bổ sung lên mức S; tồn sắp hết hạn không được tính."
      />
      <Suspense fallback={<LoadingCard label="Đang tải đề xuất" rows={10} />}>
        {searchParams.then((params) => (
          <SuggestionList status={enumParam(params.status, SUGGESTION_STATUSES) ?? DEFAULT_STATUS} page={pageParam(params.page)} />
        ))}
      </Suspense>
    </>
  );
}
