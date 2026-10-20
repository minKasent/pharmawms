package vn.edu.hcmunre.pharmawms.forecasting.internal.ai;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * JSON contract of the AI forecasting service (see ai-service/app/schemas.py).
 */
public final class AiContracts {

	private AiContracts() {
	}

	public record DemandDataset(LocalDate asOfDate, int horizonDays, List<ProductInfo> products,
			List<DemandObservation> history) {
	}

	public record ProductInfo(long productId, String category) {
	}

	public record DemandObservation(long productId, LocalDate day, double quantity) {
	}

	public record ForecastBatch(String modelVersion, LocalDate asOfDate, int horizonDays,
			List<ProductForecast> forecasts) {
	}

	public record ProductForecast(long productId, int horizonDays, double quantity, double baselineQuantity,
			double dailyErrorStd, List<Explanation> explanation) {
	}

	public record Explanation(String feature, String label, Double value, double contribution,
			double effectPercent) {
	}

	public enum JobStatus {

		QUEUED, RUNNING, SUCCEEDED, FAILED;

		public boolean isFinished() {
			return this == SUCCEEDED || this == FAILED;
		}

	}

	public record TrainingJob(String jobId, JobStatus status, Instant submittedAt, Instant finishedAt,
			String modelVersion, String error) {
	}

	public record ModelInfo(String modelVersion, Instant trainedAt, LocalDate asOfDate, int horizonDays,
			int trainingRows, int productCount, Map<String, Object> backtest, List<Map<String, Object>> featureImportance) {
	}

}
