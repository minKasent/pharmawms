import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { MetricTile } from "@/components/ui/metric-tile";
import { TBody, THead, Table, Td, Th } from "@/components/ui/table";
import { backendGetOptional } from "@/lib/api/backend";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, formatDecimal, formatInteger, formatPercent } from "@/lib/format";

import { BarList } from "./bar-list";
import {
  type BacktestFold,
  type Baseline,
  type CanonicalBaseline,
  type Metrics,
  type ModelInfo,
  baselineLabel as schemaBaselineLabel,
  modelInfoSchema,
} from "./schemas";

const NOT_TRAINED = 404;
const AI_UNAVAILABLE = 503;
const TOP_FEATURES = 10;
const MODEL_LABEL = "LightGBM (mô hình AI)";

export const baselineLabel: Record<Baseline, string> = {
  ...schemaBaselineLabel,
  naive: "Naive (28 ngày gần nhất)",
  seasonalNaive: "Seasonal Naive (cùng kỳ năm trước)",
  movingAverage91: "Trung bình trượt 91 ngày",
  seasonal_naive: "Seasonal Naive (cùng kỳ năm trước)",
  moving_average_91: "Trung bình trượt 91 ngày",
};

const CANONICAL_BASELINES: readonly CanonicalBaseline[] = ["naive", "seasonalNaive", "movingAverage91"];
type Method = "model" | CanonicalBaseline;
const METHODS: readonly Method[] = ["model", ...CANONICAL_BASELINES];
const methodLabel = (method: Method) => (method === "model" ? MODEL_LABEL : baselineLabel[method]);
const methodShortLabel: Record<Method, string> = {
  model: "LightGBM",
  naive: "Naive",
  seasonalNaive: "Seasonal naive",
  movingAverage91: "TB trượt 91 ngày",
};

function formatSignedPercent(ratio: number | null | undefined): string {
  if (ratio == null) return formatPercent(ratio);
  return `${ratio > 0 ? "+" : ""}${formatPercent(ratio)}`;
}

function SummaryTiles({ model }: { model: ModelInfo }) {
  const { overall } = model.backtest;
  const best = overall.bestBaseline;
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <MetricTile label="WAPE của mô hình" value={formatPercent(overall.model.wape)} hint="Sai số tuyệt đối theo tỷ trọng; càng thấp càng tốt" emphasis />
      <MetricTile
        label="WAPE baseline tốt nhất"
        value={best ? formatPercent(overall[best].wape) : "—"}
        hint={best ? baselineLabel[best] : undefined}
      />
      <MetricTile
        label="Cải thiện so với baseline"
        value={formatPercent(overall.wapeImprovementVsBestBaseline)}
        hint="Mức giảm WAPE tương đối"
        emphasis
      />
      <MetricTile label="MASE" value={formatDecimal(overall.model.mase)} hint="< 1: tốt hơn dự báo naive" />
      <MetricTile label="Độ lệch (bias)" value={formatSignedPercent(overall.model.bias)} hint="Dương: dự báo cao hơn thực tế" />
    </dl>
  );
}

function MethodMetricsTable({ overall }: { overall: Record<Method, Metrics> }) {
  return (
    <Table caption="Chỉ số sai số tổng hợp của mô hình và các baseline">
      <THead>
        <tr>
          <Th>Phương pháp</Th>
          <Th numeric>WAPE</Th>
          <Th numeric>MAE</Th>
          <Th numeric>RMSE</Th>
          <Th numeric>MASE</Th>
          <Th numeric>Bias</Th>
        </tr>
      </THead>
      <TBody>
        {METHODS.map((method) => {
          const metrics = overall[method];
          return (
            <tr key={method} className={cn(method === "model" && "bg-brand-50/60 font-medium")}>
              <Td>{methodLabel(method)}</Td>
              <Td numeric>{formatPercent(metrics.wape)}</Td>
              <Td numeric>{formatDecimal(metrics.mae)}</Td>
              <Td numeric>{formatDecimal(metrics.rmse)}</Td>
              <Td numeric>{formatDecimal(metrics.mase)}</Td>
              <Td numeric>{formatSignedPercent(metrics.bias)}</Td>
            </tr>
          );
        })}
      </TBody>
    </Table>
  );
}

function bestMethodOf(fold: BacktestFold): Method | undefined {
  let best: Method | undefined;
  for (const method of METHODS) {
    const wape = fold[method].wape;
    if (wape != null && (best === undefined || wape < (fold[best].wape ?? Infinity))) best = method;
  }
  return best;
}

function FoldTable({ folds }: { folds: BacktestFold[] }) {
  return (
    <Table caption="WAPE theo từng lần cắt dữ liệu của backtest">
      <THead>
        <tr>
          <Th>Lần cắt</Th>
          <Th>Ngày cắt</Th>
          <Th numeric>Dòng huấn luyện</Th>
          <Th numeric>Dòng kiểm tra</Th>
          {METHODS.map((method) => (
            <Th key={method} numeric>
              {methodShortLabel[method]}
            </Th>
          ))}
        </tr>
      </THead>
      <TBody>
        {folds.map((fold) => {
          const best = bestMethodOf(fold);
          return (
            <tr key={fold.fold}>
              <Td>#{fold.fold}</Td>
              <Td className="tabular-nums">{formatDate(fold.cutoff)}</Td>
              <Td numeric>{formatInteger(fold.trainRows)}</Td>
              <Td numeric>{formatInteger(fold.testRows)}</Td>
              {METHODS.map((method) => (
                <Td key={method} numeric className={cn(method === best && "font-semibold text-brand-800")}>
                  {formatPercent(fold[method].wape)}
                </Td>
              ))}
            </tr>
          );
        })}
      </TBody>
    </Table>
  );
}

export async function ModelOverview() {
  const model = await backendGetOptional("/forecasting/model", modelInfoSchema, [NOT_TRAINED, AI_UNAVAILABLE]);
  if (!model) {
    return (
      <Alert tone="warning" title="Chưa có thông tin mô hình">
        Mô hình chưa được huấn luyện hoặc dịch vụ AI đang không phản hồi. Các lượt dự báo sẽ dùng phương án dự phòng (trung bình trượt).
      </Alert>
    );
  }
  const { overall, folds } = model.backtest;

  return (
    <div className="space-y-6">
      <SummaryTiles model={model} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Backtest walk-forward so với baseline"
            description={`${folds.length} lần cắt; mỗi lần huấn luyện trên dữ liệu trước ngày cắt và dự báo ${model.horizonDays} ngày tiếp theo chưa từng thấy.`}
          />
          <CardBody className="space-y-6">
            <BarList
              label="WAPE theo phương pháp, càng thấp càng tốt"
              items={METHODS.map((method) => ({
                key: method,
                label: methodLabel(method),
                value: overall[method].wape ?? 0,
                display: formatPercent(overall[method].wape),
                highlight: method === "model",
              }))}
            />
          </CardBody>
          <MethodMetricsTable overall={overall} />
        </Card>
        <Card>
          <CardHeader title="Đặc trưng ảnh hưởng nhiều nhất" description="Tỷ trọng mức giảm sai số (gain) khi mô hình dùng đặc trưng" />
          <CardBody>
            <BarList
              label="Tầm quan trọng của đặc trưng"
              items={model.featureImportance.slice(0, TOP_FEATURES).map((feature, index) => ({
                key: feature.feature,
                label: feature.label,
                value: feature.share,
                display: formatPercent(feature.share),
                highlight: index === 0,
              }))}
            />
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader
          title="Chi tiết từng lần cắt"
          description={`Mô hình ${model.modelVersion} · huấn luyện lúc ${formatDateTime(model.trainedAt)} · dữ liệu đến ${formatDate(model.asOfDate)} · ${formatInteger(model.trainingRows)} dòng · ${formatInteger(model.productCount)} thuốc`}
        />
        <FoldTable folds={folds} />
      </Card>
    </div>
  );
}
