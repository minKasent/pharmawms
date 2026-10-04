package vn.edu.hcmunre.pharmawms.forecasting.internal.ai;

import java.net.http.HttpClient;
import java.util.Optional;

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import vn.edu.hcmunre.pharmawms.forecasting.internal.ai.AiContracts.DemandDataset;
import vn.edu.hcmunre.pharmawms.forecasting.internal.ai.AiContracts.ForecastBatch;
import vn.edu.hcmunre.pharmawms.forecasting.internal.ai.AiContracts.ModelInfo;
import vn.edu.hcmunre.pharmawms.forecasting.internal.ai.AiContracts.TrainingJob;

/**
 * HTTP client for the internal AI service. Every call has timeouts and passes through the
 * {@code aiService} circuit breaker; idempotent reads are also retried. Callers decide how to
 * degrade when a call fails.
 */
@Component
public class AiForecastClient {

	static final String API_KEY_HEADER = "X-Internal-Api-Key";
	private static final String CIRCUIT = "aiService";

	private final RestClient http;

	AiForecastClient(RestClient.Builder builder, AiServiceProperties properties) {
		// HTTP/1.1: the JDK client otherwise attempts an h2c upgrade, which uvicorn rejects by dropping the body.
		HttpClient httpClient = HttpClient.newBuilder()
			.version(HttpClient.Version.HTTP_1_1)
			.connectTimeout(properties.connectTimeout())
			.build();
		JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
		requestFactory.setReadTimeout(properties.readTimeout());
		this.http = builder.baseUrl(properties.baseUrl().toString())
			.requestFactory(requestFactory)
			.defaultHeader(API_KEY_HEADER, properties.apiKey())
			.build();
	}

	/**
	 * @throws ModelNotTrainedException when the service has no model yet
	 */
	@Retry(name = CIRCUIT)
	@CircuitBreaker(name = CIRCUIT)
	public ForecastBatch forecast(DemandDataset dataset) {
		try {
			return http.post()
				.uri("/v1/forecasts:batch")
				.contentType(MediaType.APPLICATION_JSON)
				.body(dataset)
				.retrieve()
				.body(ForecastBatch.class);
		}
		catch (HttpClientErrorException exception) {
			if (exception.getStatusCode().isSameCodeAs(HttpStatus.CONFLICT)) {
				throw new ModelNotTrainedException();
			}
			throw exception;
		}
	}

	/**
	 * Not retried: a repeated submission would start a second training job.
	 */
	@CircuitBreaker(name = CIRCUIT)
	public TrainingJob submitTraining(DemandDataset dataset) {
		return http.post()
			.uri("/v1/models:train")
			.contentType(MediaType.APPLICATION_JSON)
			.body(dataset)
			.retrieve()
			.body(TrainingJob.class);
	}

	@Retry(name = CIRCUIT)
	@CircuitBreaker(name = CIRCUIT)
	public TrainingJob trainingJob(String jobId) {
		return http.get().uri("/v1/models/jobs/{id}", jobId).retrieve().body(TrainingJob.class);
	}

	@Retry(name = CIRCUIT)
	@CircuitBreaker(name = CIRCUIT)
	public Optional<ModelInfo> currentModel() {
		try {
			return Optional.ofNullable(http.get().uri("/v1/models/current").retrieve().body(ModelInfo.class));
		}
		catch (HttpClientErrorException exception) {
			if (exception.getStatusCode().isSameCodeAs(HttpStatus.CONFLICT)) {
				return Optional.empty();
			}
			throw exception;
		}
	}

	public static class ModelNotTrainedException extends RuntimeException {

		ModelNotTrainedException() {
			super("AI service has no trained model");
		}

	}

}
