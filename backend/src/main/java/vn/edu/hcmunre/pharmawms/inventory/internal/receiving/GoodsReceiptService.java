package vn.edu.hcmunre.pharmawms.inventory.internal.receiving;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.edu.hcmunre.pharmawms.catalog.CatalogApi;
import vn.edu.hcmunre.pharmawms.catalog.ProductSummary;
import vn.edu.hcmunre.pharmawms.inventory.ReceiptCommand;
import vn.edu.hcmunre.pharmawms.inventory.ReceiptResult;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.BatchStatus;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.DocumentSequence;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.MovementType;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.StockLedger;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.StockLedger.BatchRecord;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.StockLedger.LocationInfo;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.StockLedger.NewBatch;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.StockLedger.StockChange;
import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;

@Service
public class GoodsReceiptService {

	static final String REFERENCE_TYPE = "GOODS_RECEIPT";

	private final JdbcClient jdbc;
	private final StockLedger ledger;
	private final CatalogApi catalog;
	private final Clock clock;

	GoodsReceiptService(JdbcClient jdbc, StockLedger ledger, CatalogApi catalog, Clock clock) {
		this.jdbc = jdbc;
		this.ledger = ledger;
		this.catalog = catalog;
		this.clock = clock;
	}

	/**
	 * Books a goods receipt: validates GSP rules per line (storage condition, minimum remaining
	 * shelf life, lot consistency), creates or reuses batches and increases stock. All or nothing.
	 */
	@Transactional
	public ReceiptResult receive(ReceiptCommand command) {
		if (command.lines().isEmpty()) {
			throw BusinessException.unprocessable("EMPTY_DOCUMENT", "Phiếu nhập phải có ít nhất một dòng.");
		}
		if (command.idempotencyKey() != null && !command.idempotencyKey().isBlank()) {
			Optional<ReceiptResult> existing = findReplay(command.idempotencyKey(), command.purchaseOrderId());
			if (existing.isPresent()) {
				return existing.get();
			}
		}
		Instant now = clock.instant();
		LocalDate today = LocalDate.now(clock);
		List<ValidatedLine> lines = validate(command, today);

		Optional<Long> receiptId = insertHeader(command, now);
		if (receiptId.isEmpty()) {
			return findReplay(command.idempotencyKey(), command.purchaseOrderId())
				.orElseThrow(() -> new IllegalStateException("Idempotent receipt disappeared"));
		}

		List<ReceiptResult.Line> results = new ArrayList<>();
		for (ValidatedLine line : lines) {
			BatchRecord batch = ledger.findOrCreateBatch(new NewBatch(line.product().id(), line.lotNumber(),
					line.source().manufactureDate(), line.source().expiryDate(), command.supplierId(),
					line.source().unitCostPerBaseUnit(), now));
			ensureSameLot(batch, line);
			insertLine(receiptId.get(), line, batch.id());
			ledger.addStock(new StockChange(batch.id(), line.location().id(), line.product().id(), MovementType.RECEIPT,
					line.baseQuantity(), REFERENCE_TYPE, receiptId.get(), command.receivedBy(), now),
					line.source().unitCostPerBaseUnit());
			results.add(new ReceiptResult.Line(line.product().id(), batch.id(), line.baseQuantity()));
		}
		String code = jdbc.sql("SELECT code FROM inventory.goods_receipt WHERE id = :id")
			.param("id", receiptId.get())
			.query(String.class)
			.single();
		return new ReceiptResult(receiptId.get(), code, false, results);
	}

	private List<ValidatedLine> validate(ReceiptCommand command, LocalDate today) {
		Map<Long, ProductSummary> products = catalog.getProducts(
				command.lines().stream().map(ReceiptCommand.Line::productId).collect(Collectors.toSet()));
		Map<Long, LocationInfo> locations = ledger.locations(
				command.lines().stream().map(ReceiptCommand.Line::locationId).collect(Collectors.toSet()));

		List<ValidatedLine> validated = new ArrayList<>();
		for (int index = 0; index < command.lines().size(); index++) {
			validated.add(validateLine(index + 1, command.lines().get(index), products, locations, today));
		}
		// Same order as FEFO issue locks (product, expiry) to keep lock acquisition consistent.
		validated.sort(Comparator.comparingLong((ValidatedLine line) -> line.product().id())
			.thenComparing(line -> line.source().expiryDate())
			.thenComparing(line -> line.source().manufactureDate(), Comparator.nullsLast(Comparator.naturalOrder()))
			.thenComparing(ValidatedLine::lotNumber)
			.thenComparingLong(line -> line.location().id()));
		return validated;
	}

	private ValidatedLine validateLine(int lineNumber, ReceiptCommand.Line line, Map<Long, ProductSummary> products,
			Map<Long, LocationInfo> locations, LocalDate today) {
		ProductSummary product = products.get(line.productId());
		if (product == null || !product.active()) {
			throw lineError(lineNumber, "PRODUCT_NOT_RECEIVABLE", "thuốc #%d không tồn tại hoặc đã ngừng kinh doanh"
				.formatted(line.productId()));
		}
		LocationInfo location = locations.get(line.locationId());
		if (location == null || !location.active()) {
			throw lineError(lineNumber, "LOCATION_NOT_AVAILABLE", "vị trí #%d không tồn tại hoặc đã ngừng sử dụng"
				.formatted(line.locationId()));
		}
		if (location.storageCondition() != product.storageCondition()) {
			throw lineError(lineNumber, "STORAGE_CONDITION_MISMATCH",
					"%s yêu cầu bảo quản '%s' nhưng vị trí %s thuộc khu '%s'".formatted(product.sku(),
							product.storageCondition().displayName(), location.code(),
							location.storageCondition().displayName()));
		}
		if (!line.expiryDate().isAfter(today)) {
			throw lineError(lineNumber, "BATCH_EXPIRED", "lô %s đã hết hạn".formatted(line.lotNumber()));
		}
		long remainingDays = ChronoUnit.DAYS.between(today, line.expiryDate());
		if (remainingDays < product.minShelfLifeOnReceiptDays()) {
			throw lineError(lineNumber, "SHELF_LIFE_TOO_SHORT",
					"lô %s chỉ còn %d ngày hạn dùng, tối thiểu %d ngày khi nhập".formatted(line.lotNumber(),
							remainingDays, product.minShelfLifeOnReceiptDays()));
		}
		if (line.manufactureDate() != null
				&& (line.manufactureDate().isAfter(today) || !line.manufactureDate().isBefore(line.expiryDate()))) {
			throw lineError(lineNumber, "INVALID_MANUFACTURE_DATE", "ngày sản xuất không hợp lệ");
		}
		if (line.unitCostPerBaseUnit().signum() < 0) {
			throw lineError(lineNumber, "INVALID_UNIT_COST", "đơn giá không được âm");
		}
		long baseQuantity = catalog.toBaseUnits(product, line.unitName(), line.quantity());
		String lotNumber = line.lotNumber().trim().toUpperCase(Locale.ROOT);
		return new ValidatedLine(lineNumber, line, product, location, lotNumber, baseQuantity);
	}

	private static void ensureSameLot(BatchRecord existing, ValidatedLine line) {
		boolean sameExpiry = existing.expiryDate().equals(line.source().expiryDate());
		boolean sameManufactureDate = existing.manufactureDate() == null || line.source().manufactureDate() == null
				|| existing.manufactureDate().equals(line.source().manufactureDate());
		if (!sameExpiry || !sameManufactureDate) {
			throw lineError(line.lineNumber(), "LOT_DATA_MISMATCH",
					"lô %s đã tồn tại với hạn dùng %s, khác với dữ liệu nhập".formatted(existing.lotNumber(),
							existing.expiryDate()));
		}
		if (existing.status() == BatchStatus.ON_HOLD) {
			throw BusinessException.unprocessable("LOT_ON_HOLD",
					"Lô " + existing.lotNumber() + " đang bị tạm giữ, không thể nhập thêm.");
		}
		if (existing.status() == BatchStatus.EXPIRED || existing.status() == BatchStatus.DISPOSED) {
			throw lineError(line.lineNumber(), "BATCH_CLOSED",
					"lô %s đang ở trạng thái %s, không thể nhập thêm".formatted(existing.lotNumber(), existing.status()));
		}
	}

	private Optional<Long> insertHeader(ReceiptCommand command, Instant now) {
		String code = ledger.nextDocumentCode(DocumentSequence.GOODS_RECEIPT);
		return jdbc.sql("""
				INSERT INTO inventory.goods_receipt (code, supplier_id, purchase_order_id, idempotency_key, note,
				                                     received_by, received_at)
				VALUES (:code, :supplierId, :purchaseOrderId, :idempotencyKey, :note, :receivedBy, :receivedAt)
				ON CONFLICT (idempotency_key) DO NOTHING
				RETURNING id
				""")
			.param("code", code)
			.param("supplierId", command.supplierId())
			.param("purchaseOrderId", command.purchaseOrderId())
			.param("idempotencyKey", command.idempotencyKey())
			.param("note", command.note())
			.param("receivedBy", command.receivedBy())
			.param("receivedAt", StockLedger.utc(now))
			.query(Long.class)
			.optional();
	}

	private void insertLine(long receiptId, ValidatedLine line, long batchId) {
		jdbc.sql("""
				INSERT INTO inventory.goods_receipt_line (receipt_id, product_id, batch_id, location_id, quantity,
				                                          unit_cost)
				VALUES (:receiptId, :productId, :batchId, :locationId, :quantity, :unitCost)
				""")
			.param("receiptId", receiptId)
			.param("productId", line.product().id())
			.param("batchId", batchId)
			.param("locationId", line.location().id())
			.param("quantity", line.baseQuantity())
			.param("unitCost", line.source().unitCostPerBaseUnit())
			.update();
	}

	private Optional<ReceiptResult> findReplay(String idempotencyKey, Long expectedPurchaseOrderId) {
		return jdbc.sql("SELECT id, code, purchase_order_id FROM inventory.goods_receipt WHERE idempotency_key = :key")
			.param("key", idempotencyKey)
			.query(ReplayHeader.class)
			.optional()
			.map(header -> {
				if (!Objects.equals(header.purchaseOrderId(), expectedPurchaseOrderId)) {
					throw BusinessException.conflict("IDEMPOTENCY_KEY_REUSED",
							"Idempotency-Key đã được sử dụng cho chứng từ khác.");
				}
				List<ReceiptResult.Line> lines = jdbc.sql("""
						SELECT product_id, batch_id, quantity AS base_quantity
						FROM inventory.goods_receipt_line WHERE receipt_id = :id ORDER BY id
						""")
					.param("id", header.id())
					.query(ReceiptResult.Line.class)
					.list();
				return new ReceiptResult(header.id(), header.code(), true, lines);
			});
	}

	private static BusinessException lineError(int lineNumber, String code, String reason) {
		return BusinessException.unprocessable(code, "Dòng %d: %s.".formatted(lineNumber, reason),
				Map.of("line", lineNumber));
	}

	private record ReplayHeader(long id, String code, Long purchaseOrderId) {
	}

	private record ValidatedLine(int lineNumber, ReceiptCommand.Line source, ProductSummary product,
			LocationInfo location, String lotNumber, long baseQuantity) {
	}

}
