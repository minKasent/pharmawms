package vn.edu.hcmunre.pharmawms.forecasting.internal.run;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.task.TaskExecutor;
import org.springframework.stereotype.Service;

import vn.edu.hcmunre.pharmawms.catalog.CatalogApi;
import vn.edu.hcmunre.pharmawms.catalog.ProductSummary;
import vn.edu.hcmunre.pharmawms.forecasting.internal.ForecastingProperties;
import vn.edu.hcmunre.pharmawms.forecasting.internal.demand.DemandHistory;
import vn.edu.hcmunre.pharmawms.forecasting.internal.run.ForecastRunStore.Trigger;
import vn.edu.hcmunre.pharmawms.forecasting.internal.run.ForecastSource.Outcome;
import vn.edu.hcmunre.pharmawms.inventory.InventoryApi;

/**
 * Runs forecasting end to end. Data gathering and AI calls happen outside any transaction; only
 * the final write is transactional, so a slow model never holds database locks.
 */
@Service
public class ForecastRunService {

	private static final Logger log = LoggerFactory.getLogger(ForecastRunService.class);
	private static final String FAILURE_MESSAGE = "Lượt dự báo thất bại, xem log hệ thống để biết chi tiết";

	private final ForecastRunStore store;
	private final ForecastSource source;
	private final ReplenishmentPlanner planner;
	private final CatalogApi catalog;
	private final InventoryApi inventory;
	private final ForecastingProperties properties;
	private final TaskExecutor executor;
	private final Clock clock;

	ForecastRunService(ForecastRunStore store, ForecastSource source, ReplenishmentPlanner planner, CatalogApi catalog,
			InventoryApi inventory, ForecastingProperties properties,
			@Qualifier("applicationTaskExecutor") TaskExecutor executor, Clock clock) {
		this.store = store;
		this.source = source;
		this.planner = planner;
		this.catalog = catalog;
		this.inventory = inventory;
		this.properties = properties;
		this.executor = executor;
		this.clock = clock;
	}

	@EventListener(ApplicationReadyEvent.class)
	void failInterruptedRuns() {
		int interrupted = store.failInterrupted(clock.instant());
		if (interrupted > 0) {
			log.warn("Marked {} interrupted forecast runs as FAILED", interrupted);
		}
	}

	/**
	 * Starts a run in the background and returns its id immediately.
	 */
	public long startManual(long userId) {
		LocalDate today = LocalDate.now(clock);
		long runId = store.start(Trigger.MANUAL, asOf(today), properties.horizonDays(), userId, clock.instant());
		try {
			executor.execute(() -> execute(runId, today));
		}
		catch (RuntimeException exception) {
			store.fail(runId, FAILURE_MESSAGE, clock.instant());
			throw exception;
		}
		return runId;
	}

	public void runScheduled() {
		LocalDate today = LocalDate.now(clock);
		long runId = store.start(Trigger.SCHEDULED, asOf(today), properties.horizonDays(), null, clock.instant());
		execute(runId, today);
	}

	/**
	 * Today's demand is still incomplete, so the model sees history up to yesterday.
	 */
	private static LocalDate asOf(LocalDate today) {
		return today.minusDays(1);
	}

	private void execute(long runId, LocalDate today) {
		try {
			List<ProductSummary> products = catalog.activeProducts();
			LocalDate asOf = asOf(today);
			DemandHistory history = DemandHistory.of(asOf, properties.historyDays(),
					products.stream().map(ProductSummary::id).toList(),
					inventory.dailyDemand(asOf.minusDays(properties.historyDays() - 1L), asOf));
			Outcome outcome = source.forecast(history, products);
			ReplenishmentPlanner.Result planning = planner.plan(today, history, products, outcome.forecasts());
			store.complete(runId, properties.horizonDays(), outcome, planning, clock.instant());
			log.info("Forecast run {} succeeded: source={}, products={}, suggestions={}", runId, outcome.source(),
					outcome.forecasts().size(),
					planning.plans().stream().filter(p -> p.plan().suggestedQuantity() > 0).count());
		}
		catch (Throwable throwable) {
			log.error("Forecast run {} failed", runId, throwable);
			store.fail(runId, FAILURE_MESSAGE, clock.instant());
			if (throwable instanceof Error error) {
				throw error;
			}
		}
	}

}
