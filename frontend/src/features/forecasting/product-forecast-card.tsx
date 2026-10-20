import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { MetricTile } from "@/components/ui/metric-tile";
import { backendGetOptional } from "@/lib/api/backend";
import { formatDate, formatDecimal, formatInteger } from "@/lib/format";

import { DemandChartLazy } from "./demand-chart-lazy";
import { ForecastExplanation } from "./forecast-explanation";
import { ForecastSourceBadge } from "./run-badges";
import { productForecastSchema } from "./schemas";
import { toWeeklySeries } from "./weekly-series";

const HISTORY_DAYS = 182;

export async function ProductForecastCard({ productId, unit }: { productId: number; unit: string }) {
  const forecast = await backendGetOptional(`/forecasting/products/${productId}?historyDays=${HISTORY_DAYS}`, productForecastSchema);
  if (
    !forecast ||
    forecast.runId == null ||
    forecast.forecastQuantity == null ||
    forecast.horizonDays == null ||
    !forecast.source ||
    !forecast.asOfDate
  ) {
    return (
      <Card>
        <CardHeader title="Dự báo nhu cầu" />
        <EmptyState
          title="Chưa có dữ liệu dự báo cho thuốc này"
          description="Chạy dự báo ở trang Dự báo nhu cầu để xem kết quả."
        />
      </Card>
    );
  }
  const dailyRate = forecast.dailyDemand ?? forecast.forecastQuantity / forecast.horizonDays;
  const weekly = toWeeklySeries(forecast.history, forecast.forecastQuantity, forecast.horizonDays, forecast.asOfDate);

  return (
    <Card>
      <CardHeader
        title="Dự báo nhu cầu"
        description={`Dữ liệu đến ${formatDate(forecast.asOfDate)} · lần chạy #${forecast.runId}${forecast.modelVersion ? ` · mô hình ${forecast.modelVersion}` : ""}`}
        actions={<ForecastSourceBadge source={forecast.source} />}
      />
      <CardBody className="space-y-6">
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricTile label={`Dự báo ${forecast.horizonDays} ngày tới`} value={`${formatInteger(forecast.forecastQuantity)} ${unit}`} />
          <MetricTile label="Bình quân mỗi ngày" value={`${formatDecimal(dailyRate)} ${unit}`} />
          <MetricTile
            label="Mức nền (chưa điều chỉnh)"
            value={forecast.baselineQuantity != null ? `${formatInteger(forecast.baselineQuantity)} ${unit}` : "—"}
            hint="Trung bình gần đây, trước khi mô hình điều chỉnh"
          />
          <MetricTile
            label="Sai số chuẩn theo ngày"
            value={forecast.dailyErrorStd != null ? `± ${formatDecimal(forecast.dailyErrorStd)}` : "—"}
            hint="Dùng để tính tồn kho an toàn"
          />
        </dl>
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Nhu cầu theo tuần: 26 tuần gần nhất và dự báo</h3>
          <div className="mt-3">
            <DemandChartLazy points={weekly} unit={unit} />
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Vì sao mô hình dự báo như vậy?</h3>
          <div className="mt-3">
            <ForecastExplanation
              explanation={forecast.explanation}
              baselineQuantity={forecast.baselineQuantity}
              forecastQuantity={forecast.forecastQuantity}
              horizonDays={forecast.horizonDays}
              unit={unit}
            />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
