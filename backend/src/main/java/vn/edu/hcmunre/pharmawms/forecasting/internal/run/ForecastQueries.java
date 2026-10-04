package vn.edu.hcmunre.pharmawms.forecasting.internal.run;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

import vn.edu.hcmunre.pharmawms.forecasting.internal.ai.AiContracts.Explanation;
import vn.edu.hcmunre.pharmawms.forecasting.internal.demand.DemandHistory;
import vn.edu.hcmunre.pharmawms.inventory.InventoryApi;
import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;
import vn.edu.hcmunre.pharmawms.shared.web.PageResponse;

@Component
@Transactional(readOnly = true)
public class ForecastQueries {

	private static final String RUN_COLUMNS = """
			id, status, trigger_type, as_of_date, horizon_days, model_version, source, product_count,
			error_message AS note, started_at, finished_at, triggered_by
			""";

	private final JdbcClient jdbc;
	private final InventoryApi inventory;
	private final JsonMapper json;
	private final Clock clock;

	ForecastQueries(JdbcClient jdbc, InventoryApi inventory, JsonMapper json, Clock clock) {
		this.jdbc = jdbc;
		this.inventory = inventory;
		this.json = json;
		this.clock = clock;
	}

	public record RunView(long id, String status, String triggerType, LocalDate asOfDate, int horizonDays,
			String modelVersion, String source, Integer productCount, String note, OffsetDateTime startedAt,
			OffsetDateTime finishedAt, Long triggeredBy) {
	}

	public record DailyDemand(LocalDate day, double quantity) {
	}

	public record ProductForecastView(long productId, Long runId, LocalDate asOfDate, String source,
			String modelVersion, Integer horizonDays, BigDecimal forecastQuantity, BigDecimal baselineQuantity,
			BigDecimal dailyErrorStd, List<Explanation> explanation, List<DailyDemand> history) {
	}

	private record ResultRow(long runId, LocalDate asOfDate, String source, String modelVersion, int horizonDays,
			BigDecimal forecastQuantity, BigDecimal baselineQuantity, BigDecimal dailyErrorStd, String explanation) {
	}

	public PageResponse<RunView> runs(int page, int size) {
		long total = jdbc.sql("SELECT count(*) FROM forecasting.forecast_run").query(Long.class).single();
		List<RunView> content = jdbc.sql("SELECT " + RUN_COLUMNS + """
				FROM forecasting.forecast_run ORDER BY started_at DESC, id DESC LIMIT :limit OFFSET :offset
				""")
			.param("limit", size)
			.param("offset", (long) page * size)
			.query(RunView.class)
			.list();
		return PageResponse.of(content, page, size, total);
	}

	public RunView run(long id) {
		return jdbc.sql("SELECT " + RUN_COLUMNS + " FROM forecasting.forecast_run WHERE id = :id")
			.param("id", id)
			.query(RunView.class)
			.optional()
			.orElseThrow(() -> BusinessException.notFound("FORECAST_RUN_NOT_FOUND", "Không tìm thấy lượt dự báo #" + id));
	}

	/**
	 * Latest successful forecast for a product plus its recent daily demand (zero-filled), for charting.
	 */
	public ProductForecastView productForecast(long productId, int historyDays) {
		Optional<ResultRow> latest = jdbc.sql("""
				SELECT fr.run_id, r.as_of_date, r.source, r.model_version, fr.horizon_days, fr.forecast_quantity,
				       fr.baseline_quantity, fr.daily_error_std, fr.explanation
				FROM forecasting.forecast_result fr
				JOIN forecasting.forecast_run r ON r.id = fr.run_id
				WHERE fr.product_id = :product AND r.status = 'SUCCEEDED'
				ORDER BY fr.run_id DESC
				LIMIT 1
				""")
			.param("product", productId)
			.query(ResultRow.class)
			.optional();

		LocalDate asOf = latest.map(ResultRow::asOfDate).orElse(LocalDate.now(clock).minusDays(1));
		DemandHistory history = DemandHistory.of(asOf, historyDays, List.of(productId),
				inventory.dailyDemand(asOf.minusDays(historyDays - 1L), asOf));
		double[] daily = history.daily(productId, historyDays);
		List<DailyDemand> points = new ArrayList<>(daily.length);
		for (int i = 0; i < daily.length; i++) {
			points.add(new DailyDemand(history.start().plusDays(i), daily[i]));
		}

		return latest
			.map(row -> new ProductForecastView(productId, row.runId(), row.asOfDate(), row.source(),
					row.modelVersion(), row.horizonDays(), row.forecastQuantity(), row.baselineQuantity(),
					row.dailyErrorStd(), explanation(row.explanation()), points))
			.orElseGet(() -> new ProductForecastView(productId, null, null, null, null, null, null, null, null,
					List.of(), points));
	}

	private List<Explanation> explanation(String stored) {
		return stored == null ? List.of() : Arrays.asList(json.readValue(stored, Explanation[].class));
	}

}
