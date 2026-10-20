import type { Metadata } from "next";
import { Suspense } from "react";

import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LoadingCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/features/auth/current-user";
import { can } from "@/features/auth/user";
import { getInventoryKpis } from "@/features/dashboard/data";
import { AtRiskBatchesCard, ExpiryHeatmapCard } from "@/features/dashboard/expiry-heatmap";
import { ForecastSummaryCard } from "@/features/dashboard/forecast-summary";
import { IssueTrendChartLazy } from "@/features/dashboard/issue-trend-chart-lazy";
import { KpiCards, KpiCardsSkeleton } from "@/features/dashboard/kpi-cards";

export const metadata: Metadata = { title: "Tổng quan" };

async function IssueTrendCard({ className }: { className?: string }) {
  const kpis = await getInventoryKpis();
  return (
    <Card className={className}>
      <CardHeader title="Giá trị xuất kho 30 ngày" description="Tổng giá trị thuốc xuất cho các khoa theo ngày" />
      <CardBody>
        <IssueTrendChartLazy points={kpis.issueTrend} />
      </CardBody>
    </Card>
  );
}

async function TrendAndForecastRow() {
  const user = await getCurrentUser();
  const showForecast = can(user, "FORECAST_READ");
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className={showForecast ? "xl:col-span-2" : "xl:col-span-3"}>
        <Suspense fallback={<LoadingCard label="Đang tải biểu đồ xuất kho" rows={4} />}>
          <IssueTrendCard className={showForecast ? "xl:col-span-2" : "xl:col-span-3"} />
        </Suspense>
      </div>
      {showForecast ? (
        <Suspense fallback={<LoadingCard label="Đang tải tóm tắt dự báo" rows={4} />}>
          <ForecastSummaryCard />
        </Suspense>
      ) : null}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Tổng quan kho" description="Tình trạng tồn kho, rủi ro hạn dùng và dự báo nhu cầu" />
      <Suspense fallback={<KpiCardsSkeleton />}>
        <KpiCards />
      </Suspense>
      <Suspense fallback={<LoadingCard label="Đang tải biểu đồ xuất kho" rows={4} />}>
        <TrendAndForecastRow />
      </Suspense>
      <Suspense fallback={<LoadingCard label="Đang tải bản đồ nhiệt hạn dùng" rows={8} />}>
        <ExpiryHeatmapCard />
      </Suspense>
      <Suspense fallback={<LoadingCard label="Đang tải danh sách lô rủi ro" />}>
        <AtRiskBatchesCard />
      </Suspense>
    </>
  );
}
