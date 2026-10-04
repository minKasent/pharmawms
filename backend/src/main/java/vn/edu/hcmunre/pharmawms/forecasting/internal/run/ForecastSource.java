package vn.edu.hcmunre.pharmawms.forecasting.internal.run;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;

import vn.edu.hcmunre.pharmawms.catalog.ProductSummary;
import vn.edu.hcmunre.pharmawms.forecasting.internal.ForecastingProperties;
import vn.edu.hcmunre.pharmawms.forecasting.internal.ai.AiContracts.DemandDataset;
import vn.edu.hcmunre.pharmawms.forecasting.internal.ai.AiContracts.DemandObservation;
import vn.edu.hcmunre.pharmawms.forecasting.internal.ai.AiContracts.Explanation;
import vn.edu.hcmunre.pharmawms.forecasting.internal.ai.AiContracts.ForecastBatch;
import vn.edu.hcmunre.pharmawms.forecasting.internal.ai.AiContracts.JobStatus;
import vn.edu.hcmunre.pharmawms.forecasting.internal.ai.AiContracts.ModelInfo;
import vn.edu.hcmunre.pharmawms.forecasting.internal.ai.AiContracts.ProductInfo;
import vn.edu.hcmunre.pharmawms.forecasting.internal.ai.AiContracts.TrainingJob;
import vn.edu.hcmunre.pharmawms.forecasting.internal.ai.AiForecastClient;
import vn.edu.hcmunre.pharmawms.forecasting.internal.demand.DemandHistory;
import vn.edu.hcmunre.pharmawms.forecasting.internal.demand.MovingAverageForecaster;

/**
 * Produces one forecast per product: from the AI model when possible, otherwise from the moving
 * average fallback. A forecast run never fails just because the AI service is down.
 */
@Component
class ForecastSource {

	private static final Logger log = LoggerFactory.getLogger(ForecastSource.class);
	private static final Duration TRAINING_POLL_INTERVAL = Duration.ofSeconds(2);

	private final AiForecastClient ai;
	private final ForecastingProperties properties;
	private final Clock clock;

	ForecastSource(AiForecastClient ai, ForecastingProperties properties, Clock clock) {
		this.ai = ai;
		this.properties = properties;
		this.clock = clock;
	}

	enum Source {

		AI, FALLBACK

	}

	record ProductForecast(long productId, double quantity, Double baselineQuantity, double dailyErrorStd,
			List<Explanation> explanation) {
	}

	record Outcome(Source source, String modelVersion, String fallbackReason, Map<Long, ProductForecast> forecasts) {
	}

	Outcome forecast(DemandHistory history, List<ProductSummary> products) {
		DemandDataset dataset = toDataset(history, products);
		try {
			ensureFreshModel(dataset);
			ForecastBatch batch = ai.forecast(dataset);
			Map<Long, ProductForecast> forecasts = new HashMap<>();
			batch.forecasts()
				.forEach(f -> forecasts.put(f.productId(), new ProductForecast(f.productId(),
						Math.max(0.0, f.quantity()),
						Math.max(0.0, f.baselineQuantity()),
						Math.max(0.0, f.dailyErrorStd()),
						f.explanation() != null ? f.explanation() : List.of())));
			return new Outcome(Source.AI, batch.modelVersion(), null, forecasts);
		}
		catch (RuntimeException exception) {
			log.warn("AI forecast unavailable, using moving-average fallback: {}", exception.toString());
			return fallback(history, products, describe(exception));
		}
	}

	private Outcome fallback(DemandHistory history, List<ProductSummary> products, String reason) {
		Map<Long, ProductForecast> forecasts = new HashMap<>();
		for (ProductSummary product : products) {
			MovingAverageForecaster.Forecast f = MovingAverageForecaster.forecast(history, product.id(),
					properties.horizonDays());
			forecasts.put(product.id(),
					new ProductForecast(product.id(), f.quantity(), f.quantity(), f.dailyErrorStd(), List.of()));
		}
		return new Outcome(Source.FALLBACK, null, reason, forecasts);
	}

	private void ensureFreshModel(DemandDataset dataset) {
		Optional<ModelInfo> current = ai.currentModel();
		boolean fresh = current
			.filter(model -> model.horizonDays() == properties.horizonDays())
			.filter(model -> model.trainedAt().plus(properties.retrainAfter()).isAfter(clock.instant()))
			.isPresent();
		if (fresh) {
			return;
		}
		log.info("Training a new forecasting model (current: {})", current.map(ModelInfo::modelVersion).orElse("none"));
		try {
			awaitTraining(ai.submitTraining(dataset));
		}
		catch (RuntimeException exception) {
			if (current.filter(model -> model.horizonDays() == properties.horizonDays()).isEmpty()) {
				throw exception;
			}
			log.warn("Retraining failed, keeping model {}: {}", current.get().modelVersion(), exception.toString());
		}
	}

	private void awaitTraining(TrainingJob submitted) {
		Instant deadline = clock.instant().plus(properties.trainingTimeout());
		TrainingJob job = submitted;
		while (!job.status().isFinished()) {
			if (clock.instant().isAfter(deadline)) {
				throw new TrainingFailedException("did not finish within " + properties.trainingTimeout());
			}
			sleep(TRAINING_POLL_INTERVAL);
			job = ai.trainingJob(job.jobId());
		}
		if (job.status() != JobStatus.SUCCEEDED) {
			throw new TrainingFailedException(job.error());
		}
		log.info("Trained forecasting model {}", job.modelVersion());
	}

	private DemandDataset toDataset(DemandHistory history, List<ProductSummary> products) {
		List<ProductInfo> productInfos = products.stream()
			.map(product -> new ProductInfo(product.id(), product.categoryName()))
			.toList();
		List<DemandObservation> observations = history.nonZeroObservations()
			.stream()
			.map(o -> new DemandObservation(o.productId(), o.day(), o.quantity()))
			.toList();
		return new DemandDataset(history.asOf(), properties.horizonDays(), productInfos, observations);
	}

	private static String describe(RuntimeException exception) {
		if (exception instanceof AiForecastClient.ModelNotTrainedException) {
			return "AI chưa có mô hình";
		}
		if (exception instanceof CallNotPermittedException) {
			return "AI tạm ngắt (circuit breaker mở)";
		}
		if (exception instanceof TrainingFailedException) {
			return "Huấn luyện mô hình AI thất bại";
		}
		if (exception instanceof HttpClientErrorException rejected) {
			return "AI từ chối yêu cầu (HTTP %d)".formatted(rejected.getStatusCode().value());
		}
		return "AI không phản hồi";
	}

	static class TrainingFailedException extends RuntimeException {

		TrainingFailedException(String reason) {
			super("Model training failed: " + reason);
		}

	}

	private static void sleep(Duration duration) {
		try {
			Thread.sleep(duration);
		}
		catch (InterruptedException exception) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException("Interrupted while waiting for model training", exception);
		}
	}

}
