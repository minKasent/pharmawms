package vn.edu.hcmunre.pharmawms.purchasing;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.edu.hcmunre.pharmawms.purchasing.internal.order.PurchaseOrderService;
import vn.edu.hcmunre.pharmawms.purchasing.internal.order.PurchaseOrderService.LineInput;
import vn.edu.hcmunre.pharmawms.purchasing.internal.order.PurchaseOrderSource;
import vn.edu.hcmunre.pharmawms.purchasing.internal.order.PurchaseOrderViews.PurchaseOrderView;

/**
 * What other modules (forecasting) may ask of purchasing. Quantities are in base units.
 */
@Service
public class PurchasingApi {

	static final int MIN_LEAD_TIME_SAMPLES = 3;
	static final double ASSUMED_LEAD_TIME_CV = 0.25;

	private final JdbcClient jdbc;
	private final PurchaseOrderService orderService;

	PurchasingApi(JdbcClient jdbc, PurchaseOrderService orderService) {
		this.jdbc = jdbc;
		this.orderService = orderService;
	}

	/**
	 * Remaining (not yet received) quantity on open orders, including drafts.
	 */
	@Transactional(readOnly = true)
	public Map<Long, Long> onOrderByProduct() {
		return jdbc.sql("""
				SELECT pol.product_id, sum(greatest(pol.quantity - pol.received_quantity, 0)) AS quantity
				FROM purchasing.purchase_order_line pol
				JOIN purchasing.purchase_order po ON po.id = pol.purchase_order_id
				WHERE po.status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'PARTIALLY_RECEIVED')
				GROUP BY pol.product_id
				""")
			.query((rs, rowNum) -> Map.entry(rs.getLong("product_id"), rs.getLong("quantity")))
			.list()
			.stream()
			.collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
	}

	/**
	 * Preferred supplier per product (falling back to the cheapest active one) with lead time
	 * statistics measured from sent-to-first-receipt durations.
	 */
	@Transactional(readOnly = true)
	public Map<Long, SupplyTerms> supplyTerms() {
		Map<Long, LeadTime> leadTimes = jdbc.sql("""
				SELECT supplier_id, count(*) AS samples,
				       avg(extract(epoch FROM first_received_at - sent_at) / 86400.0)::float8 AS mean_days,
				       coalesce(stddev_samp(extract(epoch FROM first_received_at - sent_at) / 86400.0), 0)::float8 AS std_days
				FROM purchasing.purchase_order
				WHERE sent_at IS NOT NULL AND first_received_at IS NOT NULL AND first_received_at > sent_at
				GROUP BY supplier_id
				""")
			.query(LeadTime.class)
			.stream()
			.collect(Collectors.toMap(LeadTime::supplierId, Function.identity()));

		List<TermsRow> rows = jdbc.sql("""
				SELECT sp.product_id, sp.supplier_id, s.name AS supplier_name, sp.pack_size, sp.min_order_quantity,
				       sp.unit_price, sp.preferred, s.default_lead_time_days
				FROM purchasing.supplier_product sp
				JOIN purchasing.supplier s ON s.id = sp.supplier_id
				WHERE s.active
				""")
			.query(TermsRow.class)
			.list();

		Comparator<TermsRow> best = Comparator.comparing(TermsRow::preferred)
			.reversed()
			.thenComparing(TermsRow::unitPrice)
			.thenComparingLong(TermsRow::supplierId);
		Map<Long, SupplyTerms> result = new HashMap<>();
		rows.stream()
			.collect(Collectors.groupingBy(TermsRow::productId))
			.forEach((productId, candidates) -> {
				TermsRow chosen = candidates.stream().sorted(best).findFirst().orElseThrow();
				result.put(productId, toTerms(chosen, leadTimes.get(chosen.supplierId())));
			});
		return result;
	}

	@Transactional(readOnly = true)
	public Map<Long, String> supplierNames(Collection<Long> supplierIds) {
		if (supplierIds.isEmpty()) {
			return Map.of();
		}
		return jdbc.sql("SELECT id, name FROM purchasing.supplier WHERE id IN (:ids)")
			.param("ids", supplierIds)
			.query((rs, rowNum) -> Map.entry(rs.getLong("id"), rs.getString("name")))
			.list()
			.stream()
			.collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
	}

	/**
	 * Creates one DRAFT order per supplier. Returns suggestion id -> purchase order id.
	 */
	@Transactional
	public Map<Long, Long> createDraftOrders(List<DraftOrderLine> lines, long createdBy) {
		Map<Long, Long> orderBySuggestion = new LinkedHashMap<>();
		lines.stream()
			.collect(Collectors.groupingBy(DraftOrderLine::supplierId, LinkedHashMap::new, Collectors.toList()))
			.forEach((supplierId, supplierLines) -> {
				List<LineInput> inputs = supplierLines.stream()
					.map(line -> new LineInput(line.productId(), null, line.quantity(), null, line.suggestionId()))
					.toList();
				PurchaseOrderView order = orderService.create(supplierId, PurchaseOrderSource.SUGGESTION,
						"Tạo từ gợi ý nhập hàng AI", inputs, createdBy);
				supplierLines.forEach(line -> orderBySuggestion.put(line.suggestionId(), order.id()));
			});
		return orderBySuggestion;
	}

	private static SupplyTerms toTerms(TermsRow row, LeadTime leadTime) {
		boolean measured = leadTime != null && leadTime.samples() >= MIN_LEAD_TIME_SAMPLES;
		double mean = measured ? leadTime.meanDays() : row.defaultLeadTimeDays();
		double std = measured ? leadTime.stdDays() : row.defaultLeadTimeDays() * ASSUMED_LEAD_TIME_CV;
		return new SupplyTerms(row.productId(), row.supplierId(), row.supplierName(), row.packSize(),
				row.minOrderQuantity(), row.unitPrice(), mean, std, measured ? (int) leadTime.samples() : 0);
	}

	private record LeadTime(long supplierId, long samples, double meanDays, double stdDays) {
	}

	private record TermsRow(long productId, long supplierId, String supplierName, long packSize,
			long minOrderQuantity, BigDecimal unitPrice, boolean preferred, int defaultLeadTimeDays) {
	}

}
