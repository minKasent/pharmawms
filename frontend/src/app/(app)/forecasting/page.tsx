import type { Metadata } from "next";
import { Suspense } from "react";

import { Card, CardHeader } from "@/components/ui/card";
import { LoadingCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, withQuery } from "@/components/ui/pagination";
import { EmptyRow, TBody, THead, Table, Td, Th } from "@/components/ui/table";
import { getCurrentUser } from "@/features/auth/current-user";
import { can } from "@/features/auth/user";
import { ModelOverview } from "@/features/forecasting/model-overview";
import { PolicyBenchmarkCard } from "@/features/forecasting/policy-benchmark-card";
import { ForecastSourceBadge, RunStatusBadge } from "@/features/forecasting/run-badges";
import { RunForecastButton } from "@/features/forecasting/run-forecast-button";
import { forecastRunPageSchema } from "@/features/forecasting/schemas";
import { backendGet } from "@/lib/api/backend";
import { formatDate, formatDateTime, formatInteger } from "@/lib/format";
import { pageParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Dự báo nhu cầu" };

const PAGE_SIZE = 10;
const RUN_COLUMN_COUNT = 7;
const triggerLabel: Record<string, string> = { MANUAL: "Thủ công", SCHEDULED: "Theo lịch" };

async function RunTable({ page }: { page: number }) {
  const runs = await backendGet(withQuery("/forecasting/runs", { page, size: PAGE_SIZE }), forecastRunPageSchema);
  return (
    <>
      <Table caption="Các lượt chạy dự báo, mới nhất trước">
        <THead>
          <tr>
            <Th>Lượt</Th>
            <Th>Trạng thái</Th>
            <Th>Kích hoạt</Th>
            <Th>Dữ liệu đến</Th>
            <Th>Nguồn dự báo</Th>
            <Th numeric>Số thuốc</Th>
            <Th>Thời gian</Th>
          </tr>
        </THead>
        <TBody>
          {runs.content.length === 0 ? (
            <EmptyRow colSpan={RUN_COLUMN_COUNT}>Chưa có lượt dự báo nào.</EmptyRow>
          ) : (
            runs.content.map((run) => (
              <tr key={run.id}>
                <Td className="font-mono text-xs">#{run.id}</Td>
                <Td>
                  <RunStatusBadge status={run.status} />
                  {run.note ? <p className="mt-1 max-w-xs text-xs text-slate-500">{run.note}</p> : null}
                </Td>
                <Td>{triggerLabel[run.triggerType] ?? run.triggerType}</Td>
                <Td className="tabular-nums">{formatDate(run.asOfDate)}</Td>
                <Td>
                  <ForecastSourceBadge source={run.source} />
                </Td>
                <Td numeric>{formatInteger(run.productCount)}</Td>
                <Td className="whitespace-nowrap tabular-nums text-slate-600">{formatDateTime(run.startedAt)}</Td>
              </tr>
            ))
          )}
        </TBody>
      </Table>
      <Pagination
        page={runs.page}
        totalPages={runs.totalPages}
        totalElements={runs.totalElements}
        hrefFor={(target) => withQuery("/forecasting", { page: target })}
      />
    </>
  );
}

async function RunAction() {
  const user = await getCurrentUser();
  return can(user, "FORECAST_RUN") ? <RunForecastButton /> : null;
}

export default function ForecastingPage({ searchParams }: PageProps<"/forecasting">) {
  return (
    <>
      <PageHeader
        title="Dự báo nhu cầu"
        description="Mô hình LightGBM dự báo lượng xuất 28 ngày tới cho từng thuốc; độ chính xác được kiểm chứng bằng backtest so với các phương pháp đơn giản."
        actions={
          <Suspense>
            <RunAction />
          </Suspense>
        }
      />
      <div className="space-y-6">
        <PolicyBenchmarkCard />
        <Suspense fallback={<LoadingCard label="Đang tải thông tin mô hình" rows={8} />}>
          <ModelOverview />
        </Suspense>
        <Card>
          <CardHeader title="Lịch sử chạy dự báo" description="Lượt theo lịch chạy hằng ngày; mỗi lượt tạo lại đề xuất nhập hàng." />
          <Suspense fallback={<LoadingCard label="Đang tải lịch sử chạy" rows={5} />}>
            {searchParams.then((params) => (
              <RunTable page={pageParam(params.page)} />
            ))}
          </Suspense>
        </Card>
      </div>
    </>
  );
}
