package vn.edu.hcmunre.pharmawms.forecasting.internal.run;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

import vn.edu.hcmunre.pharmawms.forecasting.internal.replenishment.AbcClass;
import vn.edu.hcmunre.pharmawms.forecasting.internal.run.ForecastSource.Outcome;
import vn.edu.hcmunre.pharmawms.forecasting.internal.run.ForecastSource.ProductForecast;
import vn.edu.hcmunre.pharmawms.forecasting.internal.run.ReplenishmentPlanner.ProductPlan;
import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;

@Component
class ForecastRunStore {

	static final int MAX_ERROR_LENGTH = 1000;
	private static final int QUANTITY_SCALE = 2;
	private static final int RATE_SCALE = 4;

	private final JdbcClient jdbc;
	private final NamedParameterJdbcTemplate batch;
	private final JsonMapper json;

	ForecastRunStore(JdbcClient jdbc, NamedParameterJdbcTemplate batch, JsonMapper json) {
		this.jdbc = jdbc;
		this.batch = batch;
		this.json = json;
	}

	enum Trigger {

		SCHEDULED, MANUAL

	}

	record Policy(long productId, Double serviceLevel, Integer reviewPeriodDays) {
	}

	@Transactional
	public long start(Trigger trigger, LocalDate asOf, int horizonDays, Long triggeredBy, Instant now) {
		try {
			return jdbc.sql("""
					INSERT INTO forecasting.forecast_run (status, trigger_type, as_of_date, horizon_days, started_at, triggered_by)
					VALUES ('RUNNING', :trigger, :asOf, :horizon, :now, :user)
					RETURNING id
					""")
				.param("trigger", trigger.name())
				.param("asOf", asOf)
				.param("horizon", horizonDays)
				.param("now", utc(now))
				.param("user", triggeredBy)
				.query(Long.class)
				.single();
		}
		catch (DuplicateKeyException exception) {
			throw BusinessException.conflict("FORECAST_RUN_IN_PROGRESS", "Đang có một lượt dự báo chạy, vui lòng đợi.");
		}
	}

	@Transactional
	public void fail(long runId, String message, Instant now) {
		jdbc.sql("""
				UPDATE forecasting.forecast_run SET status = 'FAILED', error_message = :message, finished_at = :now
				WHERE id = :id AND status = 'RUNNING'
				""")
			.param("id", runId)
			.param("message", truncate(message))
			.param("now", utc(now))
			.update();
	}

	/**
	 * Single-instance deployment: a RUNNING row at startup belongs to a process that died.
	 */
	@Transactional
	public int failInterrupted(Instant now) {
		return jdbc.sql("""
				UPDATE forecasting.forecast_run SET status = 'FAILED', error_message = :message, finished_at = :now
				WHERE status = 'RUNNING'
				""")
			.param("message", "Bị gián đoạn do khởi động lại hệ thống")
			.param("now", utc(now))
			.update();
	}

	@Transactional(readOnly = true)
	public Map<Long, Policy> policies() {
		return jdbc.sql("""
				SELECT product_id, service_level::float8 AS service_level, review_period_days
				FROM forecasting.replenishment_policy
				""")
			.query(Policy.class)
			.stream()
			.collect(Collectors.toMap(Policy::productId, policy -> policy));
	}

	/**
	 * Persists results and suggestions, supersedes the previous open suggestions and marks the
	 * run successful, atomically.
	 */
	@Transactional
	public void complete(long runId, int horizonDays, Outcome outcome, ReplenishmentPlanner.Result planning,
			Instant now) {
		insertResults(runId, horizonDays, outcome.forecasts().values().stream().toList());
		jdbc.sql("UPDATE forecasting.purchase_suggestion SET status = 'SUPERSEDED' WHERE status = 'OPEN'").update();
		insertSuggestions(runId, horizonDays,
				planning.plans().stream().filter(plan -> plan.plan().suggestedQuantity() > 0).toList(), now);
		upsertAbcClasses(planning.abcClasses(), now);
		jdbc.sql("""
				UPDATE forecasting.forecast_run
				SET status = 'SUCCEEDED', source = :source, model_version = :model, product_count = :count,
				    error_message = :note, finished_at = :now
				WHERE id = :id
				""")
			.param("id", runId)
			.param("source", outcome.source().name())
			.param("model", outcome.modelVersion())
			.param("count", outcome.forecasts().size())
			.param("note", outcome.fallbackReason())
			.param("now", utc(now))
			.update();
	}

	private void insertResults(long runId, int horizonDays, List<ProductForecast> forecasts) {
		SqlParameterSource[] rows = forecasts.stream()
			.map(f -> new MapSqlParameterSource().addValue("run", runId)
				.addValue("product", f.productId())
				.addValue("horizon", horizonDays)
				.addValue("quantity", scaled(f.quantity(), QUANTITY_SCALE))
				.addValue("baseline", f.baselineQuantity() == null ? null : scaled(f.baselineQuantity(), QUANTITY_SCALE))
				.addValue("std", scaled(f.dailyErrorStd(), RATE_SCALE))
				.addValue("explanation", f.explanation().isEmpty() ? null : json.writeValueAsString(f.explanation())))
			.toArray(SqlParameterSource[]::new);
		batch.batchUpdate("""
				INSERT INTO forecasting.forecast_result
				    (run_id, product_id, horizon_days, forecast_quantity, baseline_quantity, daily_error_std, explanation)
				VALUES (:run, :product, :horizon, :quantity, :baseline, :std, :explanation)
				""", rows);
	}

	private void insertSuggestions(long runId, int horizonDays, List<ProductPlan> plans, Instant now) {
		SqlParameterSource[] rows = plans.stream()
			.map(p -> new MapSqlParameterSource().addValue("run", runId)
				.addValue("product", p.productId())
				.addValue("supplier", p.supplierId())
				.addValue("abc", p.abcClass().name())
				.addValue("serviceLevel", scaled(p.serviceLevel(), RATE_SCALE))
				.addValue("dailyDemand", scaled(p.dailyDemand(), RATE_SCALE))
				.addValue("dailyStd", scaled(p.dailyErrorStd(), RATE_SCALE))
				.addValue("leadTime", scaled(p.leadTimeDays(), QUANTITY_SCALE))
				.addValue("leadTimeStd", scaled(p.leadTimeStdDays(), QUANTITY_SCALE))
				.addValue("review", p.reviewPeriodDays())
				.addValue("safetyStock", p.plan().safetyStock())
				.addValue("reorderPoint", p.plan().reorderPoint())
				.addValue("orderUpTo", p.plan().orderUpToLevel())
				.addValue("usable", p.usableOnHand())
				.addValue("atRisk", p.atRiskQuantity())
				.addValue("onOrder", p.onOrder())
				.addValue("position", p.plan().inventoryPosition())
				.addValue("cover",
						p.plan().daysOfCover() == null ? null
								: scaled(Math.min(Math.max(0.0, p.plan().daysOfCover()), 999_999.99), QUANTITY_SCALE))
				.addValue("suggested", p.plan().suggestedQuantity())
				.addValue("capped", p.plan().cappedByShelfLife())
				.addValue("forecast", scaled(p.forecastQuantity(), QUANTITY_SCALE))
				.addValue("horizon", horizonDays)
				.addValue("now", utc(now)))
			.toArray(SqlParameterSource[]::new);
		batch.batchUpdate("""
				INSERT INTO forecasting.purchase_suggestion
				    (run_id, product_id, supplier_id, status, abc_class, service_level, daily_demand, daily_error_std,
				     lead_time_days, lead_time_std_days, review_period_days, safety_stock, reorder_point,
				     order_up_to_level, usable_on_hand, at_risk_quantity, on_order, inventory_position, days_of_cover,
				     suggested_quantity, capped_by_shelf_life, forecast_quantity, horizon_days, created_at)
				VALUES (:run, :product, :supplier, 'OPEN', :abc, :serviceLevel, :dailyDemand, :dailyStd,
				        :leadTime, :leadTimeStd, :review, :safetyStock, :reorderPoint,
				        :orderUpTo, :usable, :atRisk, :onOrder, :position, :cover,
				        :suggested, :capped, :forecast, :horizon, :now)
				""", rows);
	}

	private void upsertAbcClasses(Map<Long, AbcClass> classes, Instant now) {
		SqlParameterSource[] rows = classes.entrySet()
			.stream()
			.map(entry -> new MapSqlParameterSource().addValue("product", entry.getKey())
				.addValue("abc", entry.getValue().name())
				.addValue("now", utc(now)))
			.toArray(SqlParameterSource[]::new);
		batch.batchUpdate("""
				INSERT INTO forecasting.replenishment_policy (product_id, abc_class, updated_at)
				VALUES (:product, :abc, :now)
				ON CONFLICT (product_id) DO UPDATE SET abc_class = EXCLUDED.abc_class, updated_at = EXCLUDED.updated_at
				""", rows);
	}

	private static BigDecimal scaled(double value, int scale) {
		return BigDecimal.valueOf(value).setScale(scale, RoundingMode.HALF_UP);
	}

	static OffsetDateTime utc(Instant instant) {
		return instant.atOffset(ZoneOffset.UTC);
	}

	private static String truncate(String message) {
		if (message == null) {
			return null;
		}
		return message.length() <= MAX_ERROR_LENGTH ? message : message.substring(0, MAX_ERROR_LENGTH);
	}

}
