import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { can } from "@/features/auth/user";
import { getCurrentUser } from "@/features/auth/current-user";
import { ForecastSourceBadge, RunStatusBadge } from "@/features/forecasting/run-badges";
import { forecastRunPageSchema, suggestionPageSchema } from "@/features/forecasting/schemas";
import { backendGet } from "@/lib/api/backend";
import { formatDate, formatDateTime, formatInteger } from "@/lib/format";

export async function ForecastSummaryCard() {
  const user = await getCurrentUser();
  if (!can(user, "FORECAST_READ")) {
    return null;
  }
  const [runs, suggestions] = await Promise.all([
    backendGet("/forecasting/runs?size=1", forecastRunPageSchema),
    backendGet("/purchase-suggestions?status=OPEN&size=1", suggestionPageSchema),
  ]);
  const latest = runs.content[0];

  return (
    <Card>
      <CardHeader title="Dự báo & đề xuất nhập" description="Lần chạy gần nhất của mô hình dự báo nhu cầu" />
      <CardBody>
        {latest ? (
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-slate-500">Trạng thái</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                <RunStatusBadge status={latest.status} />
                <ForecastSourceBadge source={latest.source} />
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Dữ liệu đến ngày</dt>
              <dd className="mt-1 font-medium">{formatDate(latest.asOfDate)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Chân trời dự báo</dt>
              <dd className="mt-1 font-medium">{latest.horizonDays} ngày</dd>
            </div>
            <div>
              <dt className="text-slate-500">Hoàn tất lúc</dt>
              <dd className="mt-1 font-medium">{formatDateTime(latest.finishedAt)}</dd>
            </div>
            {latest.note ? <p className="col-span-2 rounded-md bg-amber-50 px-3 py-2 text-amber-900">{latest.note}</p> : null}
          </dl>
        ) : (
          <EmptyState title="Chưa có lần dự báo nào" description="Chạy dự báo để nhận đề xuất nhập hàng." />
        )}
        <div className="mt-5 flex items-center justify-between gap-3 rounded-lg bg-brand-50 px-4 py-3">
          <p className="text-sm text-brand-900">
            <span className="text-2xl font-semibold tabular-nums">{formatInteger(suggestions.totalElements)}</span> đề xuất nhập đang chờ xử lý
          </p>
          <ButtonLink href="/suggestions" size="sm">
            Xem đề xuất
          </ButtonLink>
        </div>
        <p className="mt-3 text-right text-sm">
          <Link href="/forecasting" className="font-medium text-brand-700 hover:underline">
            Chi tiết mô hình & backtest
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
