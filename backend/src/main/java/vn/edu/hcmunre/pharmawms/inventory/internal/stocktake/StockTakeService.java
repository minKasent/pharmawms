package vn.edu.hcmunre.pharmawms.inventory.internal.stocktake;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.edu.hcmunre.pharmawms.inventory.internal.stock.BatchStatus;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.DocumentSequence;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.MovementType;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.StockLedger;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.StockLedger.LockedBalance;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.StockLedger.StockChange;
import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;

/**
 * Cycle count of one zone: snapshot system quantities, record physical counts, then a second
 * person approves and the differences are booked as ADJUSTMENT movements. Differences are applied
 * as deltas, so stock moved while counting is not overwritten.
 */
@Service
public class StockTakeService {

	static final String REFERENCE_TYPE = "STOCK_TAKE";

	private final JdbcClient jdbc;
	private final StockLedger ledger;
	private final Clock clock;

	StockTakeService(JdbcClient jdbc, StockLedger ledger, Clock clock) {
		this.jdbc = jdbc;
		this.ledger = ledger;
		this.clock = clock;
	}

	@Transactional
	public long create(long zoneId, long createdBy) {
		boolean zoneExists = jdbc.sql("SELECT EXISTS (SELECT 1 FROM inventory.zone WHERE id = :id FOR UPDATE)")
			.param("id", zoneId)
			.query(Boolean.class)
			.single();
		if (!zoneExists) {
			throw BusinessException.notFound("ZONE_NOT_FOUND", "Không tìm thấy khu #" + zoneId);
		}
		boolean openCountExists = jdbc.sql("""
				SELECT EXISTS (SELECT 1 FROM inventory.stock_take
				               WHERE zone_id = :zoneId AND status IN ('COUNTING', 'SUBMITTED'))
				""")
			.param("zoneId", zoneId)
			.query(Boolean.class)
			.single();
		if (openCountExists) {
			throw BusinessException.conflict("STOCK_TAKE_IN_PROGRESS", "Khu này đang có phiếu kiểm kê chưa hoàn tất.");
		}
		long id = jdbc.sql("""
				INSERT INTO inventory.stock_take (code, zone_id, status, created_by, created_at)
				VALUES (:code, :zoneId, 'COUNTING', :createdBy, :createdAt)
				RETURNING id
				""")
			.param("code", ledger.nextDocumentCode(DocumentSequence.STOCK_TAKE))
			.param("zoneId", zoneId)
			.param("createdBy", createdBy)
			.param("createdAt", StockLedger.utc(clock.instant()))
			.query(Long.class)
			.single();
		jdbc.sql("""
				INSERT INTO inventory.stock_take_line (stock_take_id, batch_id, location_id, product_id, system_quantity)
				SELECT :id, sb.batch_id, sb.location_id, b.product_id, sb.on_hand
				FROM inventory.stock_balance sb
				JOIN inventory.batch b ON b.id = sb.batch_id
				JOIN inventory.location l ON l.id = sb.location_id
				WHERE l.zone_id = :zoneId AND sb.on_hand > 0 AND b.status <> 'DISPOSED'
				""")
			.param("id", id)
			.param("zoneId", zoneId)
			.update();
		return id;
	}

	@Transactional
	public void recordCounts(long stockTakeId, Map<Long, Long> countedByLineId) {
		requireStatus(stockTakeId, "COUNTING");
		countedByLineId.forEach((lineId, counted) -> {
			int updated = jdbc.sql("""
					UPDATE inventory.stock_take_line stl
					SET counted_quantity = :counted, system_quantity = sb.on_hand
					FROM inventory.stock_balance sb
					WHERE stl.id = :lineId
					  AND stl.stock_take_id = :stockTakeId
					  AND sb.batch_id = stl.batch_id
					  AND sb.location_id = stl.location_id
					""")
				.param("counted", counted)
				.param("lineId", lineId)
				.param("stockTakeId", stockTakeId)
				.update();
			if (updated != 1) {
				throw BusinessException.unprocessable("STOCK_TAKE_LINE_NOT_FOUND",
						"Dòng kiểm kê #%d không thuộc phiếu này.".formatted(lineId));
			}
		});
	}

	@Transactional
	public void submit(long stockTakeId) {
		long uncounted = jdbc.sql("""
				SELECT count(*) FROM inventory.stock_take_line
				WHERE stock_take_id = :id AND counted_quantity IS NULL
				""")
			.param("id", stockTakeId)
			.query(Long.class)
			.single();
		if (uncounted > 0) {
			throw BusinessException.unprocessable("STOCK_TAKE_INCOMPLETE",
					"Còn %d dòng chưa nhập số lượng thực tế.".formatted(uncounted));
		}
		transition(stockTakeId, "COUNTING", "SUBMITTED", "submitted_at = :now", null);
	}

	@Transactional
	public void approve(long stockTakeId, long approverId) {
		long createdBy = jdbc.sql("SELECT created_by FROM inventory.stock_take WHERE id = :id")
			.param("id", stockTakeId)
			.query(Long.class)
			.optional()
			.orElseThrow(() -> notFound(stockTakeId));
		if (createdBy == approverId) {
			throw BusinessException.forbidden("SEGREGATION_OF_DUTIES",
					"Người lập phiếu kiểm kê không được tự phê duyệt.");
		}
		Instant now = clock.instant();
		transition(stockTakeId, "SUBMITTED", "APPROVED", "approved_at = :now, approved_by = :approverId", approverId);

		List<DifferenceRow> differences = jdbc.sql("""
				SELECT stl.batch_id, stl.location_id, stl.product_id, stl.counted_quantity - stl.system_quantity AS difference
				FROM inventory.stock_take_line stl
				JOIN inventory.batch b ON b.id = stl.batch_id
				WHERE stl.stock_take_id = :id AND stl.counted_quantity <> stl.system_quantity
				ORDER BY b.product_id, b.expiry_date, b.manufacture_date NULLS LAST, b.id, stl.location_id
				""")
			.param("id", stockTakeId)
			.query(DifferenceRow.class)
			.list();
		for (DifferenceRow row : differences) {
			LockedBalance balance = ledger.lockBalance(row.batchId(), row.locationId())
				.orElseThrow(() -> new IllegalStateException("Snapshot balance vanished"));
			if (balance.status() == BatchStatus.DISPOSED) {
				throw BusinessException.conflict("BATCH_DISPOSED",
						"Lô #" + row.batchId() + " đã bị tiêu hủy, không thể điều chỉnh kiểm kê.");
			}
			var change = new StockChange(row.batchId(), row.locationId(), row.productId(), MovementType.ADJUSTMENT,
					Math.abs(row.difference()), REFERENCE_TYPE, stockTakeId, approverId, now);
			if (row.difference() > 0) {
				ledger.addStock(change);
			}
			else if (balance.onHand() - balance.reserved() < -row.difference()) {
				throw BusinessException.conflict("STOCK_TAKE_OUTDATED",
						"Tồn kho lô #%d đã thay đổi sau khi kiểm, không đủ để điều chỉnh giảm. Hãy kiểm kê lại."
							.formatted(row.batchId()));
			}
			else {
				ledger.removeStock(change);
			}
		}
	}

	@Transactional
	public void cancel(long stockTakeId) {
		int updated = jdbc.sql("""
				UPDATE inventory.stock_take SET status = 'CANCELLED', version = version + 1
				WHERE id = :id AND status IN ('COUNTING', 'SUBMITTED')
				""")
			.param("id", stockTakeId)
			.update();
		if (updated != 1) {
			throw invalidTransition(stockTakeId);
		}
	}

	private void transition(long stockTakeId, String from, String to, String extraAssignments, Long approverId) {
		int updated = jdbc.sql("UPDATE inventory.stock_take SET status = :to, version = version + 1, "
				+ extraAssignments + " WHERE id = :id AND status = :from")
			.param("to", to)
			.param("from", from)
			.param("id", stockTakeId)
			.param("now", StockLedger.utc(clock.instant()))
			.param("approverId", approverId)
			.update();
		if (updated != 1) {
			throw invalidTransition(stockTakeId);
		}
	}

	private void requireStatus(long stockTakeId, String expected) {
		String status = jdbc.sql("SELECT status FROM inventory.stock_take WHERE id = :id FOR UPDATE")
			.param("id", stockTakeId)
			.query(String.class)
			.optional()
			.orElseThrow(() -> notFound(stockTakeId));
		if (!status.equals(expected)) {
			throw BusinessException.unprocessable("INVALID_STOCK_TAKE_STATUS",
					"Phiếu kiểm kê đang ở trạng thái %s.".formatted(status));
		}
	}

	private BusinessException invalidTransition(long stockTakeId) {
		String status = jdbc.sql("SELECT status FROM inventory.stock_take WHERE id = :id")
			.param("id", stockTakeId)
			.query(String.class)
			.optional()
			.orElseThrow(() -> notFound(stockTakeId));
		return BusinessException.unprocessable("INVALID_STOCK_TAKE_STATUS",
				"Không thể thực hiện thao tác khi phiếu kiểm kê ở trạng thái %s.".formatted(status));
	}

	private static BusinessException notFound(long stockTakeId) {
		return BusinessException.notFound("STOCK_TAKE_NOT_FOUND", "Không tìm thấy phiếu kiểm kê #" + stockTakeId);
	}

	private record DifferenceRow(long batchId, long locationId, long productId, long difference) {
	}

}
