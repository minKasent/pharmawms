package vn.edu.hcmunre.pharmawms.inventory.internal.expiry;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.edu.hcmunre.pharmawms.catalog.CatalogApi;
import vn.edu.hcmunre.pharmawms.catalog.ProductSummary;

@Component
@Transactional(readOnly = true)
public class ExpiryRiskQueries {

	private static final int TREND_DAYS = 30;
	private static final int NEAR_EXPIRY_DAYS = 90;
	private static final int TOP_AT_RISK_LIMIT = 10;

	private final JdbcClient jdbc;
	private final CatalogApi catalog;
	private final Clock clock;
	private final ZoneId zone;

	ExpiryRiskQueries(JdbcClient jdbc, CatalogApi catalog, Clock clock,
			@Value("${pharmawms.time-zone}") String businessTimeZone) {
		this.jdbc = jdbc;
		this.catalog = catalog;
		this.clock = clock;
		this.zone = ZoneId.of(businessTimeZone);
	}

	/**
	 * Category x remaining-shelf-life matrix of stock value, plus the riskiest batches.
	 */
	public ExpiryHeatmap heatmap() {
		LocalDate today = LocalDate.now(clock);
		List<BatchValueRow> rows = stockedBatches();
		Map<Long, ProductSummary> products = catalog
			.getProducts(rows.stream().map(BatchValueRow::productId).collect(Collectors.toSet()));

		Map<String, EnumMap<ExpiryBucket, CellAccumulator>> matrix = new TreeMap<>();
		for (BatchValueRow row : rows) {
			ProductSummary product = products.get(row.productId());
			ExpiryBucket bucket = ExpiryBucket.of(ChronoUnit.DAYS.between(today, row.expiryDate()));
			matrix.computeIfAbsent(product.categoryName(), key -> new EnumMap<>(ExpiryBucket.class))
				.computeIfAbsent(bucket, key -> new CellAccumulator())
				.add(row);
		}
		List<HeatmapRow> heatmapRows = matrix.entrySet().stream().map(entry -> {
			List<HeatmapCell> cells = Arrays.stream(ExpiryBucket.values()).map(bucket -> {
				CellAccumulator cell = entry.getValue().getOrDefault(bucket, new CellAccumulator());
				return new HeatmapCell(bucket, cell.batchCount, cell.quantity, cell.value);
			}).toList();
			return new HeatmapRow(entry.getKey(), cells);
		}).toList();

		List<BucketInfo> buckets = Arrays.stream(ExpiryBucket.values())
			.map(bucket -> new BucketInfo(bucket, bucket.label()))
			.toList();
		List<AtRiskBatch> topAtRisk = rows.stream()
			.filter(row -> ChronoUnit.DAYS.between(today, row.expiryDate()) <= NEAR_EXPIRY_DAYS)
			.sorted((left, right) -> right.value().compareTo(left.value()))
			.limit(TOP_AT_RISK_LIMIT)
			.map(row -> {
				ProductSummary product = products.get(row.productId());
				return new AtRiskBatch(row.batchId(), row.productId(), product.sku(), product.displayName(),
						row.lotNumber(), row.expiryDate(), ChronoUnit.DAYS.between(today, row.expiryDate()),
						row.status(), row.onHand(), product.baseUnit(), row.value());
			})
			.toList();
		return new ExpiryHeatmap(today, buckets, heatmapRows, topAtRisk);
	}

	public InventoryKpis kpis() {
		LocalDate today = LocalDate.now(clock);
		List<BatchValueRow> rows = stockedBatches();
		BigDecimal usableValue = BigDecimal.ZERO;
		BigDecimal nearExpiryValue = BigDecimal.ZERO;
		BigDecimal expiredValue = BigDecimal.ZERO;
		BigDecimal onHoldValue = BigDecimal.ZERO;
		long nearExpiryBatches = 0;
		Set<Long> productsInStock = new HashSet<>();
		for (BatchValueRow row : rows) {
			long days = ChronoUnit.DAYS.between(today, row.expiryDate());
			if (days <= 0 || "EXPIRED".equals(row.status())) {
				expiredValue = expiredValue.add(row.value());
			}
			else if ("ON_HOLD".equals(row.status()) || "QUARANTINE".equals(row.status())) {
				onHoldValue = onHoldValue.add(row.value());
			}
			else {
				usableValue = usableValue.add(row.value());
				productsInStock.add(row.productId());
				if (days <= NEAR_EXPIRY_DAYS) {
					nearExpiryValue = nearExpiryValue.add(row.value());
					nearExpiryBatches++;
				}
			}
		}
		return new InventoryKpis(today, usableValue, productsInStock.size(), nearExpiryValue, nearExpiryBatches,
				expiredValue, onHoldValue, documentsToday("inventory.goods_receipt", "received_at", today),
				documentsToday("inventory.goods_issue", "issued_at", today), issueTrend(today));
	}

	private List<BatchValueRow> stockedBatches() {
		return jdbc.sql("""
				SELECT b.id AS batch_id, b.product_id, b.lot_number, b.expiry_date, b.status,
				       sum(sb.on_hand) AS on_hand, sum(sb.on_hand * b.unit_cost) AS value
				FROM inventory.batch b
				JOIN inventory.stock_balance sb ON sb.batch_id = b.id
				WHERE sb.on_hand > 0 AND b.status <> 'DISPOSED'
				GROUP BY b.id
				""")
			.query(BatchValueRow.class)
			.list();
	}

	private long documentsToday(String table, String timestampColumn, LocalDate today) {
		return jdbc.sql("SELECT count(*) FROM " + table + " WHERE " + timestampColumn + " >= :start AND "
				+ timestampColumn + " < :end")
			.param("start", today.atStartOfDay(zone).toOffsetDateTime())
			.param("end", today.plusDays(1).atStartOfDay(zone).toOffsetDateTime())
			.query(Long.class)
			.single();
	}

	private List<TrendPoint> issueTrend(LocalDate today) {
		LocalDate from = today.minusDays(TREND_DAYS - 1L);
		Map<LocalDate, TrendPoint> byDay = jdbc.sql("""
				SELECT (m.occurred_at AT TIME ZONE :zone)::date AS day,
				       -sum(m.quantity) AS quantity, -sum(m.quantity * b.unit_cost) AS value
				FROM inventory.stock_movement m
				JOIN inventory.batch b ON b.id = m.batch_id
				WHERE m.movement_type = 'ISSUE' AND m.occurred_at >= :start
				GROUP BY day
				""")
			.param("zone", zone.getId())
			.param("start", from.atStartOfDay(zone).toOffsetDateTime())
			.query(TrendPoint.class)
			.stream()
			.collect(Collectors.toMap(TrendPoint::day, point -> point));
		List<TrendPoint> points = new ArrayList<>();
		for (LocalDate day = from; !day.isAfter(today); day = day.plusDays(1)) {
			points.add(byDay.getOrDefault(day, new TrendPoint(day, 0, BigDecimal.ZERO)));
		}
		return points;
	}

	private static final class CellAccumulator {

		private long batchCount;
		private long quantity;
		private BigDecimal value = BigDecimal.ZERO;

		void add(BatchValueRow row) {
			batchCount++;
			quantity += row.onHand();
			value = value.add(row.value());
		}

	}

	public record ExpiryHeatmap(LocalDate asOf, List<BucketInfo> buckets, List<HeatmapRow> rows,
			List<AtRiskBatch> topAtRisk) {
	}

	public record BucketInfo(ExpiryBucket bucket, String label) {
	}

	public record HeatmapRow(String categoryName, List<HeatmapCell> cells) {
	}

	public record HeatmapCell(ExpiryBucket bucket, long batchCount, long quantity, BigDecimal value) {
	}

	public record AtRiskBatch(long batchId, long productId, String sku, String productName, String lotNumber,
			LocalDate expiryDate, long daysToExpiry, String status, long onHand, String baseUnit, BigDecimal value) {
	}

	public record InventoryKpis(LocalDate asOf, BigDecimal usableStockValue, long productsInStock,
			BigDecimal nearExpiryValue, long nearExpiryBatches, BigDecimal expiredValue, BigDecimal onHoldValue,
			long receiptsToday, long issuesToday, List<TrendPoint> issueTrend) {
	}

	public record TrendPoint(LocalDate day, long quantity, BigDecimal value) {
	}

	private record BatchValueRow(long batchId, long productId, String lotNumber, LocalDate expiryDate, String status,
			long onHand, BigDecimal value) {
	}

}
