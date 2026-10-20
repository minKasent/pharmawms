package vn.edu.hcmunre.pharmawms.inventory.internal.stock;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.edu.hcmunre.pharmawms.catalog.CatalogApi;
import vn.edu.hcmunre.pharmawms.catalog.ProductSummary;
import vn.edu.hcmunre.pharmawms.iam.UserDirectory;
import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;
import vn.edu.hcmunre.pharmawms.shared.web.PageResponse;

@Component
@Transactional(readOnly = true)
public class StockQueries {

	private static final String CSV_HEADER = "Thời điểm,Loại giao dịch,Loại chứng từ,Mã tham chiếu,Mã SKU,Tên thuốc,Đơn vị cơ sở,Số lô,Hạn dùng,Vị trí,Số lượng biến động,Đơn giá gốc,Người thực hiện";

	private final JdbcClient jdbc;
	private final CatalogApi catalog;
	private final UserDirectory userDirectory;
	private final Clock clock;
	private final String businessTimeZone;

	StockQueries(JdbcClient jdbc, CatalogApi catalog, UserDirectory userDirectory, Clock clock,
			@Value("${pharmawms.time-zone}") String businessTimeZone) {
		this.jdbc = jdbc;
		this.catalog = catalog;
		this.userDirectory = userDirectory;
		this.clock = clock;
		this.businessTimeZone = ZoneId.of(businessTimeZone).getId();
	}

	/**
	 * Stock per product. The catalog is small (hundreds to a few thousand SKUs), so the product
	 * list is joined and paged in memory instead of coupling SQL across module schemas.
	 */
	public PageResponse<ProductStock> overview(String search, int page, int size) {
		LocalDate today = LocalDate.now(clock);
		Map<Long, StockRow> stock = jdbc.sql("""
				SELECT b.product_id,
				       sum(sb.on_hand) AS on_hand,
				       sum(sb.on_hand - sb.reserved) FILTER (WHERE b.status = 'AVAILABLE' AND b.expiry_date > :today AND l.active = true) AS available,
				       sum(sb.on_hand) FILTER (WHERE b.status IN ('ON_HOLD', 'QUARANTINE')) AS on_hold,
				       sum(sb.on_hand) FILTER (WHERE b.status = 'EXPIRED' OR b.expiry_date <= :today) AS expired,
				       min(b.expiry_date) FILTER (WHERE b.status = 'AVAILABLE' AND b.expiry_date > :today AND l.active = true) AS nearest_expiry,
				       count(DISTINCT b.id) AS batch_count,
				       sum(sb.on_hand * b.unit_cost) AS stock_value
				FROM inventory.stock_balance sb
				JOIN inventory.batch b ON b.id = sb.batch_id
				JOIN inventory.location l ON l.id = sb.location_id
				WHERE sb.on_hand > 0
				GROUP BY b.product_id
				""")
			.param("today", today)
			.query(StockRow.class)
			.stream()
			.collect(Collectors.toMap(StockRow::productId, Function.identity()));

		String needle = search == null ? "" : search.trim().toLowerCase(Locale.ROOT);
		List<ProductStock> all = catalog.activeProducts()
			.stream()
			.filter(product -> needle.isEmpty() || matches(product, needle))
			.map(product -> toProductStock(product, stock.get(product.id()), today))
			.sorted(Comparator.comparing(ProductStock::sku))
			.toList();
		int from = Math.min(page * size, all.size());
		int to = Math.min(from + size, all.size());
		return PageResponse.of(all.subList(from, to), page, size, all.size());
	}

	public ReconciliationReport reconcile() {
		int totalBalances = jdbc.sql("SELECT count(*) FROM inventory.stock_balance").query(Integer.class).single();
		List<DiscrepancyItem> discrepancies = jdbc.sql("""
				WITH ledger AS (
				    SELECT batch_id, location_id, sum(quantity) AS ledger_quantity
				    FROM inventory.stock_movement
				    GROUP BY batch_id, location_id
				),
				combined AS (
				    SELECT coalesce(sb.batch_id, l.batch_id) AS batch_id,
				           coalesce(sb.location_id, l.location_id) AS location_id,
				           coalesce(sb.on_hand, 0) AS balance_on_hand,
				           coalesce(l.ledger_quantity, 0) AS ledger_quantity
				    FROM inventory.stock_balance sb
				    FULL OUTER JOIN ledger l ON l.batch_id = sb.batch_id AND l.location_id = sb.location_id
				)
				SELECT c.batch_id, b.lot_number, c.location_id, loc.code AS location_code, b.product_id,
				       c.balance_on_hand, c.ledger_quantity, c.balance_on_hand - c.ledger_quantity AS difference
				FROM combined c
				JOIN inventory.batch b ON b.id = c.batch_id
				JOIN inventory.location loc ON loc.id = c.location_id
				WHERE c.balance_on_hand <> c.ledger_quantity
				ORDER BY c.batch_id, c.location_id
				""")
			.query(DiscrepancyItem.class)
			.list();
		return new ReconciliationReport(clock.instant(), totalBalances, discrepancies.size(), discrepancies.isEmpty(),
				discrepancies);
	}

	public byte[] exportStockMovementsCsv(LocalDate from, LocalDate to) {
		List<ExportMovementRow> rows = jdbc.sql("""
				SELECT m.id, m.occurred_at, m.movement_type, m.reference_type, m.reference_id, m.product_id, m.quantity,
				       b.lot_number, b.expiry_date, b.unit_cost, l.code AS location_code, m.performed_by,
				       coalesce(gr.code, gi.code, st.code, d.code, '#' || m.reference_id) AS reference_code
				FROM inventory.stock_movement m
				JOIN inventory.batch b ON b.id = m.batch_id
				JOIN inventory.location l ON l.id = m.location_id
				LEFT JOIN inventory.goods_receipt gr ON m.reference_type = 'GOODS_RECEIPT' AND gr.id = m.reference_id
				LEFT JOIN inventory.goods_issue gi ON m.reference_type = 'GOODS_ISSUE' AND gi.id = m.reference_id
				LEFT JOIN inventory.stock_take st ON m.reference_type = 'STOCK_TAKE' AND st.id = m.reference_id
				LEFT JOIN inventory.disposal d ON m.reference_type = 'DISPOSAL' AND d.id = m.reference_id
				WHERE m.occurred_at >= (CAST(:fromDay AS timestamp) AT TIME ZONE :zone)
				  AND m.occurred_at < (CAST(:toDayExclusive AS timestamp) AT TIME ZONE :zone)
				ORDER BY m.occurred_at, m.id
				LIMIT 10000
				""")
			.param("fromDay", from)
			.param("toDayExclusive", to.plusDays(1))
			.param("zone", businessTimeZone)
			.query(ExportMovementRow.class)
			.list();
		Map<Long, ProductSummary> products = catalog
			.getProducts(rows.stream().map(ExportMovementRow::productId).collect(Collectors.toSet()));
		Map<Long, String> names = userDirectory
			.fullNames(rows.stream().map(ExportMovementRow::performedBy).collect(Collectors.toSet()));

		var sb = new StringBuilder();
		sb.append('\uFEFF').append(CSV_HEADER).append("\r\n");
		for (ExportMovementRow row : rows) {
			ProductSummary product = products.get(row.productId());
			String performer = names.getOrDefault(row.performedBy(), "#" + row.performedBy());
			sb.append(csvCell(row.occurredAt().toString())).append(',')
				.append(csvCell(row.movementType().name())).append(',')
				.append(csvCell(row.referenceType())).append(',')
				.append(csvCell(row.referenceCode())).append(',')
				.append(csvCell(product != null ? product.sku() : "")).append(',')
				.append(csvCell(product != null ? product.displayName() : "")).append(',')
				.append(csvCell(product != null ? product.baseUnit() : "")).append(',')
				.append(csvCell(row.lotNumber())).append(',')
				.append(csvCell(row.expiryDate().toString())).append(',')
				.append(csvCell(row.locationCode())).append(',')
				.append(row.quantity()).append(',')
				.append(row.unitCost().toPlainString()).append(',')
				.append(csvCell(performer))
				.append("\r\n");
		}
		return sb.toString().getBytes(StandardCharsets.UTF_8);
	}

	private static String csvCell(String value) {
		if (value == null || value.isEmpty()) {
			return "";
		}
		String safe = value;
		char first = safe.charAt(0);
		if (first == '=' || first == '+' || first == '-' || first == '@' || first == '\t' || first == '\r') {
			safe = "'" + safe;
		}
		if (safe.indexOf(',') >= 0 || safe.indexOf('"') >= 0 || safe.indexOf('\n') >= 0 || safe.indexOf('\r') >= 0) {
			return "\"" + safe.replace("\"", "\"\"") + "\"";
		}
		return safe;
	}

	public List<BatchView> batches(Long productId, BatchStatus status, Integer expiringWithinDays) {
		LocalDate today = LocalDate.now(clock);
		LocalDate expiryLimit = expiringWithinDays == null ? null : today.plusDays(expiringWithinDays);
		List<BatchRow> rows = jdbc.sql("""
				SELECT b.id, b.product_id, b.lot_number, b.manufacture_date, b.expiry_date, b.status, b.hold_reason,
				       b.unit_cost, b.supplier_id, b.received_at, coalesce(sum(sb.on_hand), 0) AS on_hand
				FROM inventory.batch b
				LEFT JOIN inventory.stock_balance sb ON sb.batch_id = b.id
				WHERE (CAST(:productId AS BIGINT) IS NULL OR b.product_id = :productId)
				  AND (CAST(:status AS VARCHAR) IS NULL OR b.status = :status)
				  AND (CAST(:expiryLimit AS DATE) IS NULL OR b.expiry_date <= :expiryLimit)
				GROUP BY b.id
				HAVING coalesce(sum(sb.on_hand), 0) > 0 OR CAST(:productId AS BIGINT) IS NOT NULL
				ORDER BY b.expiry_date, b.id
				LIMIT 500
				""")
			.param("productId", productId)
			.param("status", status == null ? null : status.name())
			.param("expiryLimit", expiryLimit)
			.query(BatchRow.class)
			.list();
		Map<Long, ProductSummary> products = catalog
			.getProducts(rows.stream().map(BatchRow::productId).collect(Collectors.toSet()));
		Map<Long, List<BalanceView>> balances = balancesOf(rows.stream().map(BatchRow::id).toList());
		return rows.stream().map(row -> {
			ProductSummary product = products.get(row.productId());
			return new BatchView(row.id(), row.productId(), product.sku(), product.displayName(), product.baseUnit(),
					row.lotNumber(), row.manufactureDate(), row.expiryDate(),
					ChronoUnit.DAYS.between(today, row.expiryDate()), row.status(), row.holdReason(), row.unitCost(),
					row.supplierId(), row.receivedAt(), row.onHand(), balances.getOrDefault(row.id(), List.of()));
		}).toList();
	}

	public BatchTraceability batchTraceability(long batchId) {
		LocalDate today = LocalDate.now(clock);
		BatchRow row = jdbc.sql("""
				SELECT b.id, b.product_id, b.lot_number, b.manufacture_date, b.expiry_date, b.status, b.hold_reason,
				       b.unit_cost, b.supplier_id, b.received_at, coalesce(sum(sb.on_hand), 0) AS on_hand
				FROM inventory.batch b
				LEFT JOIN inventory.stock_balance sb ON sb.batch_id = b.id
				WHERE b.id = :batchId
				GROUP BY b.id
				""")
			.param("batchId", batchId)
			.query(BatchRow.class)
			.optional()
			.orElseThrow(() -> BusinessException.notFound("BATCH_NOT_FOUND", "Không tìm thấy lô #" + batchId));
		ProductSummary product = catalog.getProduct(row.productId());
		List<BalanceView> balances = balancesOf(List.of(batchId)).getOrDefault(batchId, List.of());
		BatchView batchView = new BatchView(row.id(), row.productId(), product.sku(), product.displayName(),
				product.baseUnit(), row.lotNumber(), row.manufactureDate(), row.expiryDate(),
				ChronoUnit.DAYS.between(today, row.expiryDate()), row.status(), row.holdReason(), row.unitCost(),
				row.supplierId(), row.receivedAt(), row.onHand(), balances);

		List<BatchMovementRow> movementRows = jdbc.sql("""
				SELECT m.id, m.occurred_at, m.movement_type, m.reference_type, m.reference_id, m.quantity,
				       l.code AS location_code, m.performed_by,
				       coalesce(gr.code, gi.code, st.code, d.code, '#' || m.reference_id) AS reference_code
				FROM inventory.stock_movement m
				JOIN inventory.location l ON l.id = m.location_id
				LEFT JOIN inventory.goods_receipt gr ON m.reference_type = 'GOODS_RECEIPT' AND gr.id = m.reference_id
				LEFT JOIN inventory.goods_issue gi ON m.reference_type = 'GOODS_ISSUE' AND gi.id = m.reference_id
				LEFT JOIN inventory.stock_take st ON m.reference_type = 'STOCK_TAKE' AND st.id = m.reference_id
				LEFT JOIN inventory.disposal d ON m.reference_type = 'DISPOSAL' AND d.id = m.reference_id
				WHERE m.batch_id = :batchId
				ORDER BY m.occurred_at, m.id
				""")
			.param("batchId", batchId)
			.query(BatchMovementRow.class)
			.list();
		Map<Long, String> names = userDirectory
			.fullNames(movementRows.stream().map(BatchMovementRow::performedBy).collect(Collectors.toSet()));
		List<BatchMovementEntry> movements = movementRows.stream()
			.map(r -> new BatchMovementEntry(r.id(), r.occurredAt(), r.movementType(), r.referenceType(),
					r.referenceId(), r.referenceCode(), r.locationCode(), r.quantity(),
					names.getOrDefault(r.performedBy(), "#" + r.performedBy())))
			.toList();

		long totalReceived = movements.stream()
			.filter(m -> m.movementType() == MovementType.RECEIPT)
			.mapToLong(BatchMovementEntry::quantity)
			.sum();
		long totalIssued = movements.stream()
			.filter(m -> m.movementType() == MovementType.ISSUE)
			.mapToLong(m -> Math.abs(m.quantity()))
			.sum();
		long totalAdjusted = movements.stream()
			.filter(m -> m.movementType() == MovementType.ADJUSTMENT)
			.mapToLong(BatchMovementEntry::quantity)
			.sum();
		long totalDisposed = movements.stream()
			.filter(m -> m.movementType() == MovementType.DISPOSAL)
			.mapToLong(m -> Math.abs(m.quantity()))
			.sum();
		int affectedIssueCount = (int) movements.stream()
			.filter(m -> m.movementType() == MovementType.ISSUE && "GOODS_ISSUE".equals(m.referenceType()))
			.map(BatchMovementEntry::referenceId)
			.distinct()
			.count();

		return new BatchTraceability(batchView, totalReceived, totalIssued, totalAdjusted, totalDisposed,
				affectedIssueCount, movements);
	}

	/**
	 * Ledger of one product with running balance. The opening balance is the sum of all movements
	 * before {@code from}, so the card reconciles with on-hand at any date.
	 */
	public StockCard stockCard(long productId, LocalDate from, LocalDate to) {
		ProductSummary product = catalog.getProduct(productId);
		long opening = jdbc.sql("""
				SELECT coalesce(sum(quantity), 0) FROM inventory.stock_movement
				WHERE product_id = :productId AND occurred_at < (CAST(:fromDay AS timestamp) AT TIME ZONE :zone)
				""")
			.param("productId", productId)
			.param("fromDay", from)
			.param("zone", businessTimeZone)
			.query(Long.class)
			.single();
		List<MovementRow> rows = jdbc.sql("""
				SELECT m.id, m.occurred_at, m.movement_type, m.reference_type, m.reference_id, m.quantity,
				       b.lot_number, b.expiry_date, l.code AS location_code, m.performed_by,
				       coalesce(gr.code, gi.code, st.code, d.code) AS reference_code,
				       :opening + sum(m.quantity) OVER (ORDER BY m.occurred_at, m.id) AS balance_after
				FROM inventory.stock_movement m
				JOIN inventory.batch b ON b.id = m.batch_id
				JOIN inventory.location l ON l.id = m.location_id
				LEFT JOIN inventory.goods_receipt gr ON m.reference_type = 'GOODS_RECEIPT' AND gr.id = m.reference_id
				LEFT JOIN inventory.goods_issue gi ON m.reference_type = 'GOODS_ISSUE' AND gi.id = m.reference_id
				LEFT JOIN inventory.stock_take st ON m.reference_type = 'STOCK_TAKE' AND st.id = m.reference_id
				LEFT JOIN inventory.disposal d ON m.reference_type = 'DISPOSAL' AND d.id = m.reference_id
				WHERE m.product_id = :productId
				  AND m.occurred_at >= (CAST(:fromDay AS timestamp) AT TIME ZONE :zone)
				  AND m.occurred_at < (CAST(:toDayExclusive AS timestamp) AT TIME ZONE :zone)
				ORDER BY m.occurred_at, m.id
				LIMIT 2000
				""")
			.param("productId", productId)
			.param("opening", opening)
			.param("fromDay", from)
			.param("toDayExclusive", to.plusDays(1))
			.param("zone", businessTimeZone)
			.query(MovementRow.class)
			.list();
		Map<Long, String> names = userDirectory
			.fullNames(rows.stream().map(MovementRow::performedBy).collect(Collectors.toSet()));
		List<StockCardEntry> entries = rows.stream()
			.map(row -> new StockCardEntry(row.id(), row.occurredAt(), row.movementType(), row.referenceType(),
					row.referenceId(), row.referenceCode(), row.lotNumber(), row.expiryDate(), row.locationCode(),
					row.quantity() > 0 ? row.quantity() : 0, row.quantity() < 0 ? -row.quantity() : 0,
					row.balanceAfter(), names.getOrDefault(row.performedBy(), "#" + row.performedBy())))
			.toList();
		long closing = entries.isEmpty() ? opening : entries.getLast().balanceAfter();
		return new StockCard(productId, product.sku(), product.displayName(), product.baseUnit(), from, to, opening,
				closing, entries);
	}

	private Map<Long, List<BalanceView>> balancesOf(List<Long> batchIds) {
		if (batchIds.isEmpty()) {
			return Map.of();
		}
		return jdbc.sql("""
				SELECT sb.batch_id, sb.location_id, l.code AS location_code, z.code AS zone_code, sb.on_hand
				FROM inventory.stock_balance sb
				JOIN inventory.location l ON l.id = sb.location_id
				JOIN inventory.zone z ON z.id = l.zone_id
				WHERE sb.batch_id IN (:ids) AND sb.on_hand > 0
				ORDER BY l.code
				""")
			.param("ids", batchIds)
			.query(BalanceRow.class)
			.stream()
			.collect(Collectors.groupingBy(BalanceRow::batchId, Collectors.mapping(
					row -> new BalanceView(row.locationId(), row.locationCode(), row.zoneCode(), row.onHand()),
					Collectors.toList())));
	}

	private static boolean matches(ProductSummary product, String needle) {
		return product.name().toLowerCase(Locale.ROOT).contains(needle)
				|| product.sku().toLowerCase(Locale.ROOT).contains(needle)
				|| product.activeIngredient().toLowerCase(Locale.ROOT).contains(needle);
	}

	private static ProductStock toProductStock(ProductSummary product, StockRow row, LocalDate today) {
		if (row == null) {
			return new ProductStock(product.id(), product.sku(), product.displayName(), product.categoryName(),
					product.baseUnit(), product.storageCondition().name(), 0, 0, 0, 0, null, null, 0, BigDecimal.ZERO);
		}
		Long daysToNearestExpiry = row.nearestExpiry() == null ? null
				: ChronoUnit.DAYS.between(today, row.nearestExpiry());
		return new ProductStock(product.id(), product.sku(), product.displayName(), product.categoryName(),
				product.baseUnit(), product.storageCondition().name(), row.onHand(), nullToZero(row.available()),
				nullToZero(row.onHold()), nullToZero(row.expired()), row.nearestExpiry(), daysToNearestExpiry,
				row.batchCount(), row.stockValue());
	}

	private static long nullToZero(Long value) {
		return value == null ? 0 : value;
	}

	public record ProductStock(long productId, String sku, String productName, String categoryName, String baseUnit,
			String storageCondition, long onHand, long available, long onHold, long expired, LocalDate nearestExpiry,
			Long daysToNearestExpiry, long batchCount, BigDecimal stockValue) {
	}

	public record BatchView(long id, long productId, String sku, String productName, String baseUnit,
			String lotNumber, LocalDate manufactureDate, LocalDate expiryDate, long daysToExpiry, BatchStatus status,
			String holdReason, BigDecimal unitCost, Long supplierId, OffsetDateTime receivedAt, long onHand,
			List<BalanceView> balances) {
	}

	public record BalanceView(long locationId, String locationCode, String zoneCode, long onHand) {
	}

	public record BatchTraceability(BatchView batch, long totalReceived, long totalIssued, long totalAdjusted,
			long totalDisposed, int affectedIssueCount, List<BatchMovementEntry> movements) {
	}

	public record BatchMovementEntry(long movementId, OffsetDateTime occurredAt, MovementType movementType,
			String referenceType, long referenceId, String referenceCode, String locationCode, long quantity,
			String performedByName) {
	}

	public record StockCard(long productId, String sku, String productName, String baseUnit, LocalDate from,
			LocalDate to, long openingBalance, long closingBalance, List<StockCardEntry> entries) {
	}

	public record StockCardEntry(long movementId, OffsetDateTime occurredAt, MovementType movementType,
			String referenceType, long referenceId, String referenceCode, String lotNumber, LocalDate expiryDate,
			String locationCode, long quantityIn, long quantityOut, long balanceAfter, String performedByName) {
	}

	public record ReconciliationReport(Instant checkedAt, int totalBalances, int discrepancyCount, boolean consistent,
			List<DiscrepancyItem> discrepancies) {
	}

	public record DiscrepancyItem(long batchId, String lotNumber, long locationId, String locationCode, long productId,
			long balanceOnHand, long ledgerQuantity, long difference) {
	}

	private record StockRow(long productId, long onHand, Long available, Long onHold, Long expired,
			LocalDate nearestExpiry, long batchCount, BigDecimal stockValue) {
	}

	private record BatchRow(long id, long productId, String lotNumber, LocalDate manufactureDate, LocalDate expiryDate,
			BatchStatus status, String holdReason, BigDecimal unitCost, Long supplierId, OffsetDateTime receivedAt,
			long onHand) {
	}

	private record BalanceRow(long batchId, long locationId, String locationCode, String zoneCode, long onHand) {
	}

	private record BatchMovementRow(long id, OffsetDateTime occurredAt, MovementType movementType,
			String referenceType, long referenceId, long quantity, String locationCode, long performedBy,
			String referenceCode) {
	}

	private record MovementRow(long id, OffsetDateTime occurredAt, MovementType movementType, String referenceType,
			long referenceId, long quantity, String lotNumber, LocalDate expiryDate, String locationCode,
			long performedBy, String referenceCode, long balanceAfter) {
	}

	private record ExportMovementRow(long id, OffsetDateTime occurredAt, MovementType movementType,
			String referenceType, long referenceId, long productId, long quantity, String lotNumber,
			LocalDate expiryDate, BigDecimal unitCost, String locationCode, long performedBy, String referenceCode) {
	}

}
