package vn.edu.hcmunre.pharmawms.forecasting.internal.run;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import vn.edu.hcmunre.pharmawms.catalog.ProductSummary;
import vn.edu.hcmunre.pharmawms.forecasting.internal.ForecastingProperties;
import vn.edu.hcmunre.pharmawms.forecasting.internal.demand.DemandHistory;
import vn.edu.hcmunre.pharmawms.forecasting.internal.replenishment.AbcClass;
import vn.edu.hcmunre.pharmawms.forecasting.internal.replenishment.AbcClassifier;
import vn.edu.hcmunre.pharmawms.forecasting.internal.replenishment.AbcClassifier.ConsumptionValue;
import vn.edu.hcmunre.pharmawms.forecasting.internal.replenishment.ExpiryAwareStock;
import vn.edu.hcmunre.pharmawms.forecasting.internal.replenishment.ReplenishmentCalculator;
import vn.edu.hcmunre.pharmawms.forecasting.internal.replenishment.ReplenishmentCalculator.Plan;
import vn.edu.hcmunre.pharmawms.forecasting.internal.run.ForecastRunStore.Policy;
import vn.edu.hcmunre.pharmawms.forecasting.internal.run.ForecastSource.ProductForecast;
import vn.edu.hcmunre.pharmawms.inventory.BatchStock;
import vn.edu.hcmunre.pharmawms.inventory.InventoryApi;
import vn.edu.hcmunre.pharmawms.purchasing.PurchasingApi;
import vn.edu.hcmunre.pharmawms.purchasing.SupplyTerms;

/**
 * Gathers stock, open orders and supply terms, then applies the replenishment policy per product.
 */
@Component
class ReplenishmentPlanner {

	static final int ABC_WINDOW_DAYS = 90;
	private static final long DEFAULT_PACK_SIZE = 1;
	private static final double ASSUMED_LEAD_TIME_CV = 0.25;

	private final InventoryApi inventory;
	private final PurchasingApi purchasing;
	private final ForecastRunStore store;
	private final ForecastingProperties properties;

	ReplenishmentPlanner(InventoryApi inventory, PurchasingApi purchasing, ForecastRunStore store,
			ForecastingProperties properties) {
		this.inventory = inventory;
		this.purchasing = purchasing;
		this.store = store;
		this.properties = properties;
	}

	record ProductPlan(long productId, Long supplierId, AbcClass abcClass, double serviceLevel, double dailyDemand,
			double dailyErrorStd, double leadTimeDays, double leadTimeStdDays, int reviewPeriodDays,
			long usableOnHand, long atRiskQuantity, long onOrder, double forecastQuantity, Plan plan) {
	}

	record Result(Map<Long, AbcClass> abcClasses, List<ProductPlan> plans) {
	}

	Result plan(LocalDate today, DemandHistory history, List<ProductSummary> products,
			Map<Long, ProductForecast> forecasts) {
		Map<Long, AbcClass> abc = AbcClassifier.classify(products.stream()
			.map(p -> new ConsumptionValue(p.id(), history.total(p.id(), ABC_WINDOW_DAYS) * unitCost(p)))
			.toList());
		Map<Long, List<ExpiryAwareStock.Batch>> batches = inventory.availableBatches(today)
			.stream()
			.collect(Collectors.groupingBy(BatchStock::productId,
					Collectors.mapping(b -> new ExpiryAwareStock.Batch(b.expiryDate(), b.available()), Collectors.toList())));
		Map<Long, Long> onOrder = purchasing.onOrderByProduct();
		Map<Long, SupplyTerms> terms = purchasing.supplyTerms();
		Map<Long, Policy> policies = store.policies();
		int minRemainingShelfLife = inventory.minRemainingShelfLifeDays();

		List<ProductPlan> plans = new ArrayList<>();
		for (ProductSummary product : products) {
			ProductForecast forecast = forecasts.get(product.id());
			if (forecast == null) {
				continue;
			}
			AbcClass abcClass = abc.getOrDefault(product.id(), AbcClass.C);
			Policy policy = policies.get(product.id());
			double serviceLevel = policy != null && policy.serviceLevel() != null ? policy.serviceLevel()
					: defaultServiceLevel(abcClass);
			int reviewPeriod = policy != null && policy.reviewPeriodDays() != null ? policy.reviewPeriodDays()
					: properties.reviewPeriodDays();
			double dailyDemand = forecast.quantity() / properties.horizonDays();
			ExpiryAwareStock.Split stock = ExpiryAwareStock.split(batches.getOrDefault(product.id(), List.of()),
					dailyDemand, today, minRemainingShelfLife);
			SupplyTerms supply = terms.get(product.id());
			double leadTime = supply != null ? supply.leadTimeMeanDays() : properties.defaultLeadTimeDays();
			double leadTimeStd = supply != null ? supply.leadTimeStdDays()
					: properties.defaultLeadTimeDays() * ASSUMED_LEAD_TIME_CV;
			long pending = onOrder.getOrDefault(product.id(), 0L);

			Integer guaranteedIssuableDays = product.minShelfLifeOnReceiptDays() > 0
					? Math.max(0, product.minShelfLifeOnReceiptDays() - minRemainingShelfLife)
					: null;
			Plan plan = ReplenishmentCalculator.plan(new ReplenishmentCalculator.Input(dailyDemand,
					forecast.dailyErrorStd(), leadTime, leadTimeStd, reviewPeriod, serviceLevel, stock.usable(), pending,
					supply != null ? supply.packSize() : DEFAULT_PACK_SIZE, supply != null ? supply.minOrderQuantity() : 0,
					guaranteedIssuableDays));
			plans.add(new ProductPlan(product.id(), supply != null ? supply.supplierId() : null, abcClass, serviceLevel,
					dailyDemand, forecast.dailyErrorStd(), leadTime, leadTimeStd, reviewPeriod, stock.usable(),
					stock.atRisk(), pending, forecast.quantity(), plan));
		}
		return new Result(abc, plans);
	}

	private double defaultServiceLevel(AbcClass abcClass) {
		return switch (abcClass) {
			case A -> properties.serviceLevels().a();
			case B -> properties.serviceLevels().b();
			case C -> properties.serviceLevels().c();
		};
	}

	private static double unitCost(ProductSummary product) {
		BigDecimal cost = product.referenceUnitCost();
		return cost == null ? 0 : cost.doubleValue();
	}

}
