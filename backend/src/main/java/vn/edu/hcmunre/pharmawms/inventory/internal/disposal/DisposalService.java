package vn.edu.hcmunre.pharmawms.inventory.internal.disposal;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.edu.hcmunre.pharmawms.catalog.CatalogApi;
import vn.edu.hcmunre.pharmawms.catalog.ProductSummary;
import vn.edu.hcmunre.pharmawms.iam.UserDirectory;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.DocumentSequence;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.MovementType;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.StockLedger;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.StockLedger.StockChange;
import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;

/**
 * Writes off the whole remaining quantity of expired or on-hold batches and closes them.
 */
@Service
public class DisposalService {

	static final String REFERENCE_TYPE = "DISPOSAL";

	private final JdbcClient jdbc;
	private final StockLedger ledger;
	private final CatalogApi catalog;
	private final UserDirectory userDirectory;
	private final Clock clock;

	DisposalService(JdbcClient jdbc, StockLedger ledger, CatalogApi catalog, UserDirectory userDirectory,
			Clock clock) {
		this.jdbc = jdbc;
		this.ledger = ledger;
		this.catalog = catalog;
		this.userDirectory = userDirectory;
		this.clock = clock;
	}

	@Transactional
	public long dispose(List<Long> batchIds, String reason, long disposedBy) {
		Instant now = clock.instant();
		LocalDate today = LocalDate.now(clock);
		List<Long> orderedBatchIds = batchIds.stream().distinct().sorted().toList();
		List<BalanceRow> balances = jdbc.sql("""
				SELECT sb.batch_id, sb.location_id, b.product_id, sb.on_hand, b.status, b.expiry_date
				FROM inventory.stock_balance sb
				JOIN inventory.batch b ON b.id = sb.batch_id
				WHERE sb.batch_id IN (:ids) AND sb.on_hand > 0
				ORDER BY b.product_id, b.expiry_date, b.manufacture_date NULLS LAST, b.id, sb.location_id
				FOR UPDATE OF sb FOR SHARE OF b
				""")
			.param("ids", orderedBatchIds)
			.query(BalanceRow.class)
			.list();
		if (balances.isEmpty()) {
			throw BusinessException.unprocessable("NOTHING_TO_DISPOSE", "Các lô đã chọn không còn tồn kho.");
		}
		Set<Long> foundBatchIds = balances.stream().map(BalanceRow::batchId).collect(Collectors.toSet());
		for (long batchId : orderedBatchIds) {
			if (!foundBatchIds.contains(batchId)) {
				throw BusinessException.unprocessable("NOTHING_TO_DISPOSE",
						"Lô #%d không còn tồn kho để hủy.".formatted(batchId));
			}
		}
		for (BalanceRow balance : balances) {
			boolean disposable = "EXPIRED".equals(balance.status()) || "ON_HOLD".equals(balance.status())
					|| !balance.expiryDate().isAfter(today);
			if (!disposable) {
				throw BusinessException.unprocessable("BATCH_NOT_DISPOSABLE",
						"Lô #%d còn hạn và không bị khóa, không được hủy.".formatted(balance.batchId()));
			}
		}

		long disposalId = jdbc.sql("""
				INSERT INTO inventory.disposal (code, reason, disposed_by, disposed_at)
				VALUES (:code, :reason, :disposedBy, :disposedAt)
				RETURNING id
				""")
			.param("code", ledger.nextDocumentCode(DocumentSequence.DISPOSAL))
			.param("reason", reason)
			.param("disposedBy", disposedBy)
			.param("disposedAt", StockLedger.utc(now))
			.query(Long.class)
			.single();
		for (BalanceRow balance : balances) {
			jdbc.sql("""
					INSERT INTO inventory.disposal_line (disposal_id, batch_id, location_id, quantity)
					VALUES (:disposalId, :batchId, :locationId, :quantity)
					""")
				.param("disposalId", disposalId)
				.param("batchId", balance.batchId())
				.param("locationId", balance.locationId())
				.param("quantity", balance.onHand())
				.update();
			ledger.removeStock(new StockChange(balance.batchId(), balance.locationId(), balance.productId(),
					MovementType.DISPOSAL, balance.onHand(), REFERENCE_TYPE, disposalId, disposedBy, now));
		}
		jdbc.sql("UPDATE inventory.batch SET status = 'DISPOSED', version = version + 1 WHERE id IN (:ids)")
			.param("ids", balances.stream().map(BalanceRow::batchId).distinct().toList())
			.update();
		return disposalId;
	}

	@Transactional(readOnly = true)
	public List<DisposalSummary> list() {
		List<DisposalRow> rows = jdbc.sql("""
				SELECT d.id, d.code, d.reason, d.disposed_by, d.disposed_at,
				       count(dl.id) AS line_count, coalesce(sum(dl.quantity * b.unit_cost), 0) AS total_value
				FROM inventory.disposal d
				JOIN inventory.disposal_line dl ON dl.disposal_id = d.id
				JOIN inventory.batch b ON b.id = dl.batch_id
				GROUP BY d.id
				ORDER BY d.disposed_at DESC
				LIMIT 100
				""")
			.query(DisposalRow.class)
			.list();
		Map<Long, String> names = userDirectory
			.fullNames(rows.stream().map(DisposalRow::disposedBy).collect(Collectors.toSet()));
		return rows.stream()
			.map(row -> new DisposalSummary(row.id(), row.code(), row.reason(),
					names.getOrDefault(row.disposedBy(), "#" + row.disposedBy()), row.disposedAt(), row.lineCount(),
					row.totalValue()))
			.toList();
	}

	@Transactional(readOnly = true)
	public DisposalSummary get(long disposalId) {
		DisposalRow row = jdbc.sql("""
				SELECT d.id, d.code, d.reason, d.disposed_by, d.disposed_at,
				       count(dl.id) AS line_count, coalesce(sum(dl.quantity * b.unit_cost), 0) AS total_value
				FROM inventory.disposal d
				JOIN inventory.disposal_line dl ON dl.disposal_id = d.id
				JOIN inventory.batch b ON b.id = dl.batch_id
				WHERE d.id = :id
				GROUP BY d.id
				""")
			.param("id", disposalId)
			.query(DisposalRow.class)
			.optional()
			.orElseThrow(() -> notFound(disposalId));
		Map<Long, String> names = userDirectory.fullNames(Set.of(row.disposedBy()));
		return new DisposalSummary(row.id(), row.code(), row.reason(),
				names.getOrDefault(row.disposedBy(), "#" + row.disposedBy()), row.disposedAt(), row.lineCount(),
				row.totalValue());
	}

	@Transactional(readOnly = true)
	public List<DisposalLineView> lines(long disposalId) {
		boolean exists = jdbc.sql("SELECT EXISTS (SELECT 1 FROM inventory.disposal WHERE id = :id)")
			.param("id", disposalId)
			.query(Boolean.class)
			.single();
		if (!exists) {
			throw notFound(disposalId);
		}
		List<LineRow> rows = jdbc.sql("""
				SELECT b.product_id, dl.batch_id, b.lot_number, b.expiry_date, l.code AS location_code, dl.quantity,
				       dl.quantity * b.unit_cost AS value
				FROM inventory.disposal_line dl
				JOIN inventory.batch b ON b.id = dl.batch_id
				JOIN inventory.location l ON l.id = dl.location_id
				WHERE dl.disposal_id = :id
				ORDER BY dl.id
				""")
			.param("id", disposalId)
			.query(LineRow.class)
			.list();
		Map<Long, ProductSummary> products = catalog
			.getProducts(rows.stream().map(LineRow::productId).collect(Collectors.toSet()));
		return rows.stream().map(row -> {
			ProductSummary product = products.get(row.productId());
			return new DisposalLineView(row.productId(), product.sku(), product.displayName(), product.baseUnit(),
					row.batchId(), row.lotNumber(), row.expiryDate(), row.locationCode(), row.quantity(), row.value());
		}).toList();
	}

	private static BusinessException notFound(long disposalId) {
		return BusinessException.notFound("DISPOSAL_NOT_FOUND", "Không tìm thấy phiếu hủy #" + disposalId);
	}

	public record DisposalSummary(long id, String code, String reason, String disposedByName,
			OffsetDateTime disposedAt, long lineCount, BigDecimal totalValue) {
	}

	public record DisposalLineView(long productId, String sku, String productName, String baseUnit, long batchId,
			String lotNumber, LocalDate expiryDate, String locationCode, long quantity, BigDecimal value) {
	}

	private record BalanceRow(long batchId, long locationId, long productId, long onHand, String status,
			LocalDate expiryDate) {
	}

	private record DisposalRow(long id, String code, String reason, long disposedBy, OffsetDateTime disposedAt,
			long lineCount, BigDecimal totalValue) {
	}

	private record LineRow(long productId, long batchId, String lotNumber, LocalDate expiryDate, String locationCode,
			long quantity, BigDecimal value) {
	}

}
