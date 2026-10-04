package vn.edu.hcmunre.pharmawms.forecasting.internal.run;

import java.util.Optional;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.edu.hcmunre.pharmawms.forecasting.internal.ai.AiContracts.ModelInfo;
import vn.edu.hcmunre.pharmawms.forecasting.internal.ai.AiForecastClient;
import vn.edu.hcmunre.pharmawms.forecasting.internal.run.ForecastQueries.ProductForecastView;
import vn.edu.hcmunre.pharmawms.forecasting.internal.run.ForecastQueries.RunView;
import vn.edu.hcmunre.pharmawms.iam.CurrentUser;
import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;
import vn.edu.hcmunre.pharmawms.shared.web.PageResponse;

@Tag(name = "Forecasting")
@RestController
@RequestMapping("/api/v1/forecasting")
class ForecastingController {

	private static final int MAX_PAGE_SIZE = 100;
	private static final int MAX_CHART_DAYS = 730;
	private static final int DEFAULT_CHART_DAYS = 180;

	private final ForecastRunService runs;
	private final ForecastQueries queries;
	private final AiForecastClient ai;
	private final CurrentUser currentUser;

	ForecastingController(ForecastRunService runs, ForecastQueries queries, AiForecastClient ai,
			CurrentUser currentUser) {
		this.runs = runs;
		this.queries = queries;
		this.ai = ai;
		this.currentUser = currentUser;
	}

	@GetMapping("/runs")
	@PreAuthorize("hasAuthority('FORECAST_READ')")
	PageResponse<RunView> list(@RequestParam(defaultValue = "0") @Min(0) int page,
			@RequestParam(defaultValue = "20") @Min(1) @Max(MAX_PAGE_SIZE) int size) {
		return queries.runs(page, size);
	}

	@GetMapping("/runs/{id}")
	@PreAuthorize("hasAuthority('FORECAST_READ')")
	RunView get(@PathVariable long id) {
		return queries.run(id);
	}

	/**
	 * Starts a run in the background; poll {@code GET /runs/{id}} until it leaves RUNNING.
	 */
	@PostMapping("/runs")
	@ResponseStatus(HttpStatus.ACCEPTED)
	@PreAuthorize("hasAuthority('FORECAST_RUN')")
	RunView start() {
		return queries.run(runs.startManual(currentUser.id()));
	}

	@GetMapping("/products/{productId}")
	@PreAuthorize("hasAuthority('FORECAST_READ')")
	ProductForecastView product(@PathVariable long productId,
			@RequestParam(defaultValue = "" + DEFAULT_CHART_DAYS) @Min(1) @Max(MAX_CHART_DAYS) int historyDays) {
		return queries.productForecast(productId, historyDays);
	}

	/**
	 * Current model metadata, including the backtest against naive baselines.
	 */
	@GetMapping("/model")
	@PreAuthorize("hasAuthority('FORECAST_READ')")
	ModelInfo model() {
		Optional<ModelInfo> current;
		try {
			current = ai.currentModel();
		}
		catch (RuntimeException exception) {
			throw BusinessException.serviceUnavailable("AI_UNAVAILABLE", "Dịch vụ AI tạm thời không phản hồi.");
		}
		return current.orElseThrow(
				() -> BusinessException.notFound("MODEL_NOT_TRAINED", "Chưa có mô hình dự báo nào được huấn luyện."));
	}

}
