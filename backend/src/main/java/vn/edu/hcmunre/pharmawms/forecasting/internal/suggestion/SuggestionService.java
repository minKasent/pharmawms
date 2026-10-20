package vn.edu.hcmunre.pharmawms.forecasting.internal.suggestion;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.edu.hcmunre.pharmawms.catalog.CatalogApi;
import vn.edu.hcmunre.pharmawms.catalog.ProductSummary;
import vn.edu.hcmunre.pharmawms.purchasing.DraftOrderLine;
import vn.edu.hcmunre.pharmawms.purchasing.PurchasingApi;
import vn.edu.hcmunre.pharmawms.purchasing.SupplyTerms;
import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;
import vn.edu.hcmunre.pharmawms.shared.web.PageResponse;

@Service
public class SuggestionService {

	private static final String COLUMNS = """
			id, run_id, product_id, supplier_id, status, abc_class, service_level, daily_demand, daily_error_std,
			lead_time_days, lead_time_std_days, review_period_days, safety_stock, reorder_point, order_up_to_level,
			usable_on_hand, at_risk_quantity, on_order, inventory_position, days_of_cover, suggested_quantity,
			capped_by_shelf_life, forecast_quantity, horizon_days, purchase_order_id
			""";

	private final JdbcClient jdbc;
	private final CatalogApi catalog;
	private final PurchasingApi purchasing;

	SuggestionService(JdbcClient jdbc, CatalogApi catalog, PurchasingApi purchasing) {
		this.jdbc = jdbc;
		this.catalog = catalog;
		this.purchasing = purchasing;
	}

	public enum Status {

		OPEN, ORDERED, DISMISSED, SUPERSEDED

	}

	record Row(long id, long runId, long productId, Long supplierId, Status status, String abcClass,
			BigDecimal serviceLevel, BigDecimal dailyDemand, BigDecimal dailyErrorStd, BigDecimal leadTimeDays,
			BigDecimal leadTimeStdDays, int reviewPeriodDays, long safetyStock, long reorderPoint, long orderUpToLevel,
			long usableOnHand, long atRiskQuantity, long onOrder, long inventoryPosition, BigDecimal daysOfCover,
			long suggestedQuantity, boolean cappedByShelfLife, BigDecimal forecastQuantity, Integer horizonDays,
			Long purchaseOrderId) {
	}

	public record SuggestionView(long id, long runId, long productId, String sku, String productName, String baseUnit,
			Long supplierId, String supplierName, Status status, String abcClass, BigDecimal serviceLevel,
			BigDecimal forecastQuantity, Integer horizonDays, BigDecimal dailyDemand, BigDecimal dailyErrorStd,
			BigDecimal leadTimeDays, BigDecimal leadTimeStdDays, int reviewPeriodDays, long safetyStock,
			long reorderPoint, long orderUpToLevel, long usableOnHand, long atRiskQuantity, long onOrder,
			long inventoryPosition, BigDecimal daysOfCover, long suggestedQuantity, boolean cappedByShelfLife,
			Long purchaseOrderId) {
	}

	/**
	 * @param quantity base units; {@code null} keeps the suggested quantity
	 */
	public record OrderItem(long suggestionId, Long quantity) {
	}

	public record OrderResult(Map<Long, Long> purchaseOrderBySuggestion) {
	}

	/**
	 * Most urgent first: A items before B and C, then the fewest days of cover.
	 */
	@Transactional(readOnly = true)
	public PageResponse<SuggestionView> search(Status status, int page, int size) {
		long total = jdbc.sql("SELECT count(*) FROM forecasting.purchase_suggestion WHERE status = :status")
			.param("status", status.name())
			.query(Long.class)
			.single();
		List<Row> rows = jdbc.sql("SELECT " + COLUMNS + """
				FROM forecasting.purchase_suggestion
				WHERE status = :status
				ORDER BY abc_class, days_of_cover NULLS FIRST, id
				LIMIT :limit OFFSET :offset
				""")
			.param("status", status.name())
			.param("limit", size)
			.param("offset", (long) page * size)
			.query(Row.class)
			.list();
		return PageResponse.of(toViews(rows), page, size, total);
	}

	/**
	 * Turns open suggestions into DRAFT purchase orders (one per supplier) in one transaction, so a
	 * suggestion can never be ordered twice.
	 */
	@Transactional
	public OrderResult createOrders(List<OrderItem> items, long userId) {
		Map<Long, OrderItem> byId = items.stream()
			.collect(Collectors.toMap(OrderItem::suggestionId, Function.identity(), (first, duplicate) -> {
				throw BusinessException.unprocessable("DUPLICATE_SUGGESTION", "Một gợi ý xuất hiện nhiều lần.");
			}));
		Map<Long, Row> rows = lockOpen(byId.keySet());
		Map<Long, SupplyTerms> supplyTerms = purchasing.supplyTerms();
		List<DraftOrderLine> lines = new ArrayList<>();
		for (OrderItem item : items) {
			Row row = rows.get(item.suggestionId());
			SupplyTerms terms = supplyTerms.get(row.productId());
			Long supplierId = row.supplierId() != null ? row.supplierId() : (terms != null ? terms.supplierId() : null);
			if (supplierId == null) {
				throw BusinessException.unprocessable("SUGGESTION_WITHOUT_SUPPLIER",
						"Gợi ý #%d chưa có nhà cung cấp; hãy khai báo nhà cung cấp cho thuốc trước."
							.formatted(row.id()));
			}
			long quantity;
			if (item.quantity() != null) {
				if (item.quantity() <= 0) {
					throw BusinessException.unprocessable("INVALID_QUANTITY", "Số lượng đặt hàng phải lớn hơn 0.");
				}
				long minQty = terms != null ? Math.max(item.quantity(), terms.minOrderQuantity()) : item.quantity();
				long packSize = terms != null && terms.packSize() > 1 ? terms.packSize() : 1L;
				try {
					quantity = Math.multiplyExact(Math.ceilDiv(minQty, packSize), packSize);
				}
				catch (ArithmeticException exception) {
					throw BusinessException.unprocessable("QUANTITY_TOO_LARGE", "Số lượng đặt hàng quá lớn.");
				}
			}
			else {
				quantity = row.suggestedQuantity();
			}
			lines.add(new DraftOrderLine(row.id(), row.productId(), supplierId, quantity));
		}
		Map<Long, Long> orders = purchasing.createDraftOrders(lines, userId);
		for (DraftOrderLine line : lines) {
			Long orderId = orders.get(line.suggestionId());
			if (orderId != null) {
				jdbc.sql("""
						UPDATE forecasting.purchase_suggestion
						SET status = 'ORDERED', supplier_id = coalesce(supplier_id, :supplier), purchase_order_id = :order
						WHERE id = :id
						""")
					.param("id", line.suggestionId())
					.param("supplier", line.supplierId())
					.param("order", orderId)
					.update();
			}
		}
		return new OrderResult(orders);
	}

	@Transactional
	public void dismiss(long suggestionId) {
		lockOpen(Set.of(suggestionId));
		jdbc.sql("UPDATE forecasting.purchase_suggestion SET status = 'DISMISSED' WHERE id = :id")
			.param("id", suggestionId)
			.update();
	}

	private Map<Long, Row> lockOpen(Collection<Long> ids) {
		Map<Long, Row> rows = jdbc.sql("SELECT " + COLUMNS + """
				FROM forecasting.purchase_suggestion WHERE id IN (:ids) ORDER BY id FOR UPDATE
				""")
			.param("ids", ids)
			.query(Row.class)
			.stream()
			.collect(Collectors.toMap(Row::id, Function.identity()));
		Set<Long> missing = new HashSet<>(ids);
		missing.removeAll(rows.keySet());
		if (!missing.isEmpty()) {
			throw BusinessException.notFound("SUGGESTION_NOT_FOUND", "Không tìm thấy gợi ý " + missing);
		}
		List<Long> closed = rows.values().stream().filter(r -> r.status() != Status.OPEN).map(Row::id).sorted().toList();
		if (!closed.isEmpty()) {
			throw BusinessException.conflict("SUGGESTION_NOT_OPEN",
					"Gợi ý %s đã được xử lý hoặc đã bị thay thế bởi lượt dự báo mới.".formatted(closed),
					Map.of("suggestionIds", closed));
		}
		return rows;
	}

	private List<SuggestionView> toViews(List<Row> rows) {
		Map<Long, ProductSummary> products = catalog.getProducts(rows.stream().map(Row::productId).distinct().toList());
		Map<Long, String> suppliers = purchasing.supplierNames(
				rows.stream().map(Row::supplierId).filter(Objects::nonNull).distinct().toList());
		return rows.stream().map(row -> {
			ProductSummary product = products.get(row.productId());
			return new SuggestionView(row.id(), row.runId(), row.productId(), product == null ? null : product.sku(),
					product == null ? null : product.displayName(), product == null ? null : product.baseUnit(),
					row.supplierId(), row.supplierId() == null ? null : suppliers.get(row.supplierId()), row.status(),
					row.abcClass(), row.serviceLevel(), row.forecastQuantity(), row.horizonDays(), row.dailyDemand(),
					row.dailyErrorStd(), row.leadTimeDays(), row.leadTimeStdDays(), row.reviewPeriodDays(),
					row.safetyStock(), row.reorderPoint(), row.orderUpToLevel(), row.usableOnHand(),
					row.atRiskQuantity(), row.onOrder(), row.inventoryPosition(), row.daysOfCover(),
					row.suggestedQuantity(), row.cappedByShelfLife(), row.purchaseOrderId());
		}).toList();
	}

}
