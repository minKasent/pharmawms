package vn.edu.hcmunre.pharmawms.inventory;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.edu.hcmunre.pharmawms.inventory.internal.InventoryProperties;
import vn.edu.hcmunre.pharmawms.inventory.internal.receiving.GoodsReceiptService;

/**
 * What other modules may ask of inventory. Quantities are in product base units.
 */
@Service
public class InventoryApi {

	private final GoodsReceiptService receiptService;
	private final JdbcClient jdbc;
	private final InventoryProperties properties;
	private final String businessTimeZone;

	InventoryApi(GoodsReceiptService receiptService, JdbcClient jdbc, InventoryProperties properties,
			@Value("${pharmawms.time-zone}") String businessTimeZone) {
		this.receiptService = receiptService;
		this.jdbc = jdbc;
		this.properties = properties;
		this.businessTimeZone = ZoneId.of(businessTimeZone).getId();
	}

	/**
	 * A batch can only be issued while it has at least this many days left before expiry.
	 */
	public int minRemainingShelfLifeDays() {
		return properties.defaultMinRemainingShelfLifeDays();
	}

	/**
	 * Joins the caller's transaction, so a purchase order can be updated atomically with the receipt.
	 */
	public ReceiptResult receive(ReceiptCommand command) {
		return receiptService.receive(command);
	}

	/**
	 * Issuable (AVAILABLE, not expired) stock per batch for every product, earliest expiry first.
	 */
	@Transactional(readOnly = true)
	public List<BatchStock> availableBatches(LocalDate today) {
		return jdbc.sql("""
				SELECT b.product_id, b.id AS batch_id, b.expiry_date, sum(sb.on_hand - sb.reserved) AS available
				FROM inventory.batch b
				JOIN inventory.stock_balance sb ON sb.batch_id = b.id
				JOIN inventory.location l ON l.id = sb.location_id
				WHERE b.status = 'AVAILABLE' AND b.expiry_date > :today AND l.active = true
				GROUP BY b.product_id, b.id, b.expiry_date
				HAVING sum(sb.on_hand - sb.reserved) > 0
				ORDER BY b.product_id, b.expiry_date, b.id
				""")
			.param("today", today)
			.query(BatchStock.class)
			.list();
	}

	/**
	 * Daily issued quantity per product, bucketed by business-local date. Days without issues
	 * are absent; callers fill them with zero.
	 */
	@Transactional(readOnly = true)
	public List<DemandPoint> dailyDemand(LocalDate fromInclusive, LocalDate toInclusive) {
		return jdbc.sql("""
				SELECT product_id, (occurred_at AT TIME ZONE :zone)::date AS day, -sum(quantity) AS quantity
				FROM inventory.stock_movement
				WHERE movement_type = 'ISSUE'
				  AND occurred_at >= (CAST(:fromDay AS timestamp) AT TIME ZONE :zone)
				  AND occurred_at < (CAST(:toDayExclusive AS timestamp) AT TIME ZONE :zone)
				GROUP BY product_id, day
				ORDER BY product_id, day
				""")
			.param("zone", businessTimeZone)
			.param("fromDay", fromInclusive)
			.param("toDayExclusive", toInclusive.plusDays(1))
			.query(DemandPoint.class)
			.list();
	}

}
