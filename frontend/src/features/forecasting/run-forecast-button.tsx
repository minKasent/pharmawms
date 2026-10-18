"use client";

import { useMutation } from "@tanstack/react-query";
import Play from "lucide-react/dist/esm/icons/play";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ApiError, errorMessage } from "@/lib/api/api-error";
import { apiRequest } from "@/lib/api/client";

import { type ForecastRun, forecastRunSchema } from "./schemas";

const POLL_INTERVAL_MS = 2_000;
const MAX_WAIT_MS = 10 * 60 * 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The backend answers 202 immediately; the run itself finishes in the background. */
async function runAndWait(): Promise<ForecastRun> {
  let run = await apiRequest("/forecasting/runs", forecastRunSchema, { method: "POST" });
  const deadline = Date.now() + MAX_WAIT_MS;
  while (run.status === "RUNNING") {
    if (Date.now() > deadline) {
      throw new ApiError(0, "FORECAST_RUN_TIMEOUT", `Lượt dự báo #${run.id} vẫn đang chạy; tải lại trang sau ít phút để xem kết quả.`);
    }
    await sleep(POLL_INTERVAL_MS);
    run = await apiRequest(`/forecasting/runs/${run.id}`, forecastRunSchema);
  }
  return run;
}

export function RunForecastButton() {
  const router = useRouter();
  const run = useMutation({
    mutationFn: runAndWait,
    onSettled: () => router.refresh(),
  });

  const outcome =
    run.isPending
      ? undefined
      : run.data?.status === "FAILED"
        ? `Lượt #${run.data.id} thất bại${run.data.note ? `: ${run.data.note}` : ""}`
        : run.data
          ? `Lượt #${run.data.id} hoàn tất · ${run.data.productCount ?? 0} thuốc`
          : undefined;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        disabled={run.isPending}
        onClick={() => {
          run.reset();
          run.mutate();
        }}
      >
        <Play aria-hidden="true" className="size-4" />
        {run.isPending ? "Đang chạy dự báo…" : "Chạy dự báo ngay"}
      </Button>
      <p className="text-xs text-slate-500" aria-live="polite">
        {run.error ? <span className="text-red-700">{errorMessage(run.error)}</span> : outcome}
      </p>
    </div>
  );
}
