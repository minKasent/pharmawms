package vn.edu.hcmunre.pharmawms.inventory.internal.stock;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.edu.hcmunre.pharmawms.catalog.StorageCondition;
import vn.edu.hcmunre.pharmawms.shared.DocumentCodes;
import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;

/**
 * The only writer of {@code stock_balance} and {@code stock_movement}. Every change to on-hand
 * is paired with a ledger row in the same transaction, so SUM(movement) == on_hand always holds.
 * Callers must run inside a transaction.
 */
@Component
public class StockLedger {

	private final JdbcClient jdbc;
	private final Clock clock;

	StockLedger(JdbcClient jdbc, Clock clock) {
		this.jdbc = jdbc;
		this.clock = clock;
	}

	public String nextDocumentCode(DocumentSequence sequence) {
		long value = jdbc.sql("SELECT nextval('" + sequence.sequenceName() + "')").query(Long.class).single();
		return DocumentCodes.format(sequence.prefix(), LocalDate.now(clock), value);
	}

	public Map<Long, LocationInfo> locations(Collection<Long> locationIds) {
		if (locationIds.isEmpty()) {
			return Map.of();
		}
		return jdbc.sql("""
				SELECT l.id, l.code, l.active, z.id AS zone_id, z.code AS zone_code, z.storage_condition
				FROM inventory.location l
				JOIN inventory.zone z ON z.id = l.zone_id
				WHERE l.id IN (:ids)
				""")
			.param("ids", locationIds)
			.query(LocationInfo.class)
			.stream()
			.collect(Collectors.toMap(LocationInfo::id, Function.identity()));
	}

	/**
	 * Returns the batch for (product, lot), creating it if absent. {@code ON CONFLICT} makes
	 * concurrent receipts of a new lot safe. The batch is locked FOR SHARE (not FOR UPDATE):
	 * issues lock balance rows before batch rows, so an exclusive batch lock here followed by a
	 * balance upsert could deadlock with a concurrent issue.
	 */
	public BatchRecord findOrCreateBatch(NewBatch batch) {
		jdbc.sql("""
				INSERT INTO inventory.batch (product_id, lot_number, manufacture_date, expiry_date, supplier_id,
				                             status, unit_cost, received_at)
				VALUES (:productId, :lotNumber, :manufactureDate, :expiryDate, :supplierId, 'AVAILABLE', :unitCost,
				        :receivedAt)
				ON CONFLICT (product_id, lot_number) DO NOTHING
				""")
			.param("productId", batch.productId())
			.param("lotNumber", batch.lotNumber())
			.param("manufactureDate", batch.manufactureDate())
			.param("expiryDate", batch.expiryDate())
			.param("supplierId", batch.supplierId())
			.param("unitCost", batch.unitCost())
			.param("receivedAt", utc(batch.receivedAt()))
			.update();
		return jdbc.sql("""
				SELECT id, product_id, lot_number, manufacture_date, expiry_date, status
				FROM inventory.batch
				WHERE product_id = :productId AND lot_number = :lotNumber
				FOR SHARE
				""")
			.param("productId", batch.productId())
			.param("lotNumber", batch.lotNumber())
			.query(BatchRecord.class)
			.single();
	}

	public void addStock(StockChange change) {
		addStock(change, null);
	}

	public void addStock(StockChange change, BigDecimal unitCost) {
		requirePositive(change.quantity());
		jdbc.sql("""
				INSERT INTO inventory.stock_balance (batch_id, location_id, on_hand)
				VALUES (:batchId, :locationId, :quantity)
				ON CONFLICT (batch_id, location_id)
				DO UPDATE SET on_hand = inventory.stock_balance.on_hand + EXCLUDED.on_hand,
				              version = inventory.stock_balance.version + 1
				""")
			.param("batchId", change.batchId())
			.param("locationId", change.locationId())
			.param("quantity", change.quantity())
			.update();
		if (unitCost != null) {
			updateBatchUnitCost(change.batchId(), change.quantity(), unitCost);
		}
		recordMovement(change, change.quantity());
	}

	private void updateBatchUnitCost(long batchId, long addedQuantity, BigDecimal newCost) {
		jdbc.sql("""
				WITH prior_stock AS (
				    SELECT coalesce(sum(on_hand), 0) - :addedQty AS on_hand
				    FROM inventory.stock_balance
				    WHERE batch_id = :batchId
				)
				UPDATE inventory.batch b
				SET unit_cost = CASE
				    WHEN ps.on_hand <= 0 THEN :newCost
				    ELSE round((ps.on_hand * b.unit_cost + :addedQty * :newCost) / (ps.on_hand + :addedQty), 4)
				END,
				version = b.version + 1
				FROM prior_stock ps
				WHERE b.id = :batchId
				  AND b.unit_cost IS DISTINCT FROM CASE
				      WHEN ps.on_hand <= 0 THEN :newCost
				      ELSE round((ps.on_hand * b.unit_cost + :addedQty * :newCost) / (ps.on_hand + :addedQty), 4)
				  END
				""")
			.param("batchId", batchId)
			.param("addedQty", addedQuantity)
			.param("newCost", newCost)
			.update();
	}

	/**
	 * Decrements a balance the caller has already locked. The guarded UPDATE is a second line of
	 * defence behind the CHECK constraint.
	 */
	public void removeStock(StockChange change) {
		requirePositive(change.quantity());
		int updated = jdbc.sql("""
				UPDATE inventory.stock_balance
				SET on_hand = on_hand - :quantity, version = version + 1
				WHERE batch_id = :batchId AND location_id = :locationId AND on_hand - reserved >= :quantity
				""")
			.param("batchId", change.batchId())
			.param("locationId", change.locationId())
			.param("quantity", change.quantity())
			.update();
		if (updated != 1) {
			throw BusinessException.conflict("STOCK_CHANGED",
					"Tồn kho vừa thay đổi bởi thao tác khác. Vui lòng thử lại.");
		}
		recordMovement(change, -change.quantity());
	}

	/**
	 * Issuable stock in FEFO order. With {@code lock}, balance rows are locked FOR UPDATE and
	 * batch rows FOR SHARE in that same deterministic order (product, expiry, manufacture date,
	 * batch, location), so concurrent issues cannot deadlock and a batch cannot be put on hold
	 * mid-issue. Rows changed by a concurrent transaction are re-checked by PostgreSQL after the
	 * lock is granted.
	 */
	public List<StockCandidate> issuableStock(Collection<Long> productIds, LocalDate minExpiryDate, boolean lock) {
		if (productIds.isEmpty()) {
			return List.of();
		}
		String sql = """
				SELECT sb.batch_id, sb.location_id, b.product_id, b.lot_number, b.expiry_date, b.manufacture_date,
				       l.code AS location_code, sb.on_hand - sb.reserved AS available
				FROM inventory.stock_balance sb
				JOIN inventory.batch b ON b.id = sb.batch_id
				JOIN inventory.location l ON l.id = sb.location_id
				WHERE b.product_id IN (:productIds)
				  AND b.status = 'AVAILABLE'
				  AND l.active = true
				  AND b.expiry_date >= :minExpiryDate
				  AND sb.on_hand - sb.reserved > 0
				ORDER BY b.product_id, b.expiry_date, b.manufacture_date NULLS LAST, b.id, sb.location_id
				""" + (lock ? "FOR UPDATE OF sb FOR SHARE OF b" : "");
		return jdbc.sql(sql)
			.param("productIds", productIds)
			.param("minExpiryDate", minExpiryDate)
			.query(StockCandidate.class)
			.list();
	}

	/**
	 * Locks one balance row; used by stock take and disposal.
	 */
	public Optional<LockedBalance> lockBalance(long batchId, long locationId) {
		return jdbc.sql("""
				SELECT sb.batch_id, sb.location_id, b.product_id, sb.on_hand, sb.reserved, b.status
				FROM inventory.stock_balance sb
				JOIN inventory.batch b ON b.id = sb.batch_id
				WHERE sb.batch_id = :batchId AND sb.location_id = :locationId
				FOR UPDATE OF sb FOR SHARE OF b
				""")
			.param("batchId", batchId)
			.param("locationId", locationId)
			.query(LockedBalance.class)
			.optional();
	}

	private void recordMovement(StockChange change, long signedQuantity) {
		jdbc.sql("""
				INSERT INTO inventory.stock_movement (batch_id, location_id, product_id, movement_type, quantity,
				                                      reference_type, reference_id, performed_by, occurred_at)
				VALUES (:batchId, :locationId, :productId, :movementType, :quantity, :referenceType, :referenceId,
				        :performedBy, :occurredAt)
				""")
			.param("batchId", change.batchId())
			.param("locationId", change.locationId())
			.param("productId", change.productId())
			.param("movementType", change.type().name())
			.param("quantity", signedQuantity)
			.param("referenceType", change.referenceType())
			.param("referenceId", change.referenceId())
			.param("performedBy", change.performedBy())
			.param("occurredAt", utc(change.occurredAt()))
			.update();
	}

	private static void requirePositive(long quantity) {
		if (quantity <= 0) {
			throw new IllegalArgumentException("Stock change quantity must be positive: " + quantity);
		}
	}

	public static OffsetDateTime utc(Instant instant) {
		return instant.atOffset(ZoneOffset.UTC);
	}

	public record LocationInfo(long id, String code, boolean active, long zoneId, String zoneCode,
			StorageCondition storageCondition) {
	}

	public record NewBatch(long productId, String lotNumber, LocalDate manufactureDate, LocalDate expiryDate,
			Long supplierId, BigDecimal unitCost, Instant receivedAt) {
	}

	public record BatchRecord(long id, long productId, String lotNumber, LocalDate manufactureDate,
			LocalDate expiryDate, BatchStatus status) {
	}

	/**
	 * @param quantity always positive; direction is given by the method called
	 */
	public record StockChange(long batchId, long locationId, long productId, MovementType type, long quantity,
			String referenceType, long referenceId, long performedBy, Instant occurredAt) {
	}

	public record LockedBalance(long batchId, long locationId, long productId, long onHand, long reserved,
			BatchStatus status) {
	}

}
