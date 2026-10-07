package vn.edu.hcmunre.pharmawms;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import vn.edu.hcmunre.pharmawms.catalog.StorageCondition;
import vn.edu.hcmunre.pharmawms.forecasting.internal.suggestion.SuggestionService;
import vn.edu.hcmunre.pharmawms.forecasting.internal.suggestion.SuggestionService.OrderItem;
import vn.edu.hcmunre.pharmawms.inventory.InventoryApi;
import vn.edu.hcmunre.pharmawms.inventory.ReceiptCommand;
import vn.edu.hcmunre.pharmawms.inventory.ReceiptResult;
import vn.edu.hcmunre.pharmawms.inventory.internal.disposal.DisposalService;
import vn.edu.hcmunre.pharmawms.inventory.internal.issuing.IssueCommand;
import vn.edu.hcmunre.pharmawms.inventory.internal.issuing.IssuingService;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.BatchService;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.StockQueries;
import vn.edu.hcmunre.pharmawms.inventory.internal.stocktake.StockTakeService;
import vn.edu.hcmunre.pharmawms.purchasing.internal.order.PurchaseOrderService;
import vn.edu.hcmunre.pharmawms.purchasing.internal.order.PurchaseOrderService.LineInput;
import vn.edu.hcmunre.pharmawms.purchasing.internal.order.PurchaseOrderService.ReceiveLineInput;
import vn.edu.hcmunre.pharmawms.purchasing.internal.order.PurchaseOrderSource;
import vn.edu.hcmunre.pharmawms.purchasing.internal.order.PurchaseOrderStatus;
import vn.edu.hcmunre.pharmawms.purchasing.internal.supplier.Supplier.SupplierDetails;
import vn.edu.hcmunre.pharmawms.purchasing.internal.supplier.SupplierService;
import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = { "pharmawms.forecasting.enabled=false", "pharmawms.demo.enabled=false" })
@Import(TestcontainersConfiguration.class)
class WarehouseLifecycleIntegrationTest {

	private static final String BASE_UNIT = "Viên";
	private static final long CREATOR_ID = 1L;
	private static final long APPROVER_ID = 2L;

	@Autowired
	private InventoryApi inventory;

	@Autowired
	private IssuingService issuing;

	@Autowired
	private BatchService batchService;

	@Autowired
	private StockTakeService stockTakeService;

	@Autowired
	private DisposalService disposalService;

	@Autowired
	private StockQueries stockQueries;

	@Autowired
	private SupplierService supplierService;

	@Autowired
	private PurchaseOrderService purchaseOrderService;

	@Autowired
	private SuggestionService suggestionService;

	@Autowired
	private JdbcClient jdbc;

	@Autowired
	private Clock clock;

	@Test
	void goodsReceiptValidatesStorageShelfLifeOnHoldWeightedAverageCostAndIdempotency() {
		LocalDate today = LocalDate.now(clock);
		long normalProduct = newProduct(StorageCondition.NORMAL, 90);
		long coldProduct = newProduct(StorageCondition.COLD, 90);
		ZoneAndLocation normalLoc = newZoneAndLocation(StorageCondition.NORMAL);

		// 1. Storage condition mismatch
		ReceiptCommand wrongStorage = new ReceiptCommand(null, null, null, null, CREATOR_ID,
				List.of(new ReceiptCommand.Line(coldProduct, "LOT-COLD-1", null, today.plusDays(180),
						normalLoc.locationId(), BASE_UNIT, 50, BigDecimal.TEN)));
		assertThatThrownBy(() -> inventory.receive(wrongStorage))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo("STORAGE_CONDITION_MISMATCH"));

		// 2. Shelf life too short (< 90 days)
		ReceiptCommand shortShelfLife = new ReceiptCommand(null, null, null, null, CREATOR_ID,
				List.of(new ReceiptCommand.Line(normalProduct, "LOT-SHORT-1", null, today.plusDays(30),
						normalLoc.locationId(), BASE_UNIT, 50, BigDecimal.TEN)));
		assertThatThrownBy(() -> inventory.receive(shortShelfLife))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo("SHELF_LIFE_TOO_SHORT"));

		// 3. First receipt of LOT-WAC-1: 100 units @ 10.0000, with idempotency key
		String key = "rcpt-" + UUID.randomUUID();
		ReceiptCommand firstReceipt = new ReceiptCommand(key, null, null, "Lần 1", CREATOR_ID,
				List.of(new ReceiptCommand.Line(normalProduct, "LOT-WAC-1", null, today.plusDays(200),
						normalLoc.locationId(), BASE_UNIT, 100, new BigDecimal("10.0000"))));
		ReceiptResult firstResult = inventory.receive(firstReceipt);
		assertThat(firstResult.replayed()).isFalse();
		long batchId = firstResult.lines().getFirst().batchId();

		// 4. Idempotent replay returns same receipt without doubling stock
		ReceiptResult replayedResult = inventory.receive(firstReceipt);
		assertThat(replayedResult.replayed()).isTrue();
		assertThat(replayedResult.receiptId()).isEqualTo(firstResult.receiptId());

		// 5. Second receipt of same lot LOT-WAC-1: 100 units @ 20.0000 with blank idempotency key -> WAC = 15.0000
		ReceiptCommand secondReceipt = new ReceiptCommand("   ", null, null, "Lần 2", CREATOR_ID,
				List.of(new ReceiptCommand.Line(normalProduct, "LOT-WAC-1", null, today.plusDays(200),
						normalLoc.locationId(), BASE_UNIT, 100, new BigDecimal("20.0000"))));
		assertThat(secondReceipt.idempotencyKey()).isNull();
		inventory.receive(secondReceipt);

		BigDecimal updatedCost = jdbc.sql("SELECT unit_cost FROM inventory.batch WHERE id = :id")
			.param("id", batchId)
			.query(BigDecimal.class)
			.single();
		assertThat(updatedCost).isEqualByComparingTo(new BigDecimal("15.0000"));

		// 6. Put batch ON_HOLD and verify receiving more into that lot is rejected with LOT_ON_HOLD
		batchService.hold(batchId, "Kiểm tra chất lượng");
		assertThatThrownBy(() -> inventory.receive(secondReceipt))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo("LOT_ON_HOLD"));
	}

	@Test
	void stockTakeCapturesSystemQuantityAtCountTimeEnforcesSodAndReconcilesLedger() {
		LocalDate today = LocalDate.now(clock);
		long product = newProduct(StorageCondition.NORMAL, 0);
		ZoneAndLocation zl = newZoneAndLocation(StorageCondition.NORMAL);

		// Initial stock: 100 units
		inventory.receive(new ReceiptCommand(null, null, null, null, CREATOR_ID,
				List.of(new ReceiptCommand.Line(product, "LOT-ST-1", null, today.plusDays(180), zl.locationId(),
						BASE_UNIT, 100, BigDecimal.TEN))));

		// Start stock-take when on_hand = 100
		long stockTakeId = stockTakeService.create(zl.zoneId(), CREATOR_ID);

		// Opening a second stock-take on the same zone while one is open is rejected
		assertThatThrownBy(() -> stockTakeService.create(zl.zoneId(), CREATOR_ID))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo("STOCK_TAKE_IN_PROGRESS"));

		long lineId = jdbc.sql("SELECT id FROM inventory.stock_take_line WHERE stock_take_id = :id")
			.param("id", stockTakeId)
			.query(Long.class)
			.single();

		// Issue 20 units WHILE stock-take is open BEFORE physical count is recorded (on_hand is now 80)
		issuing.issue(new IssueCommand("  ", "Khoa Ngoại", 1, null, CREATOR_ID,
				List.of(new IssueCommand.Line(product, BASE_UNIT, 20))));

		// Physical count finds 75 units (5 units missing compared to current on_hand of 80)
		stockTakeService.recordCounts(stockTakeId, Map.of(lineId, 75L));
		stockTakeService.submit(stockTakeId);

		// Creator cannot approve own stock-take (SoD)
		assertThatThrownBy(() -> stockTakeService.approve(stockTakeId, CREATOR_ID))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo("SEGREGATION_OF_DUTIES"));

		// Second user approves -> final on_hand must be 75 (not 55!)
		stockTakeService.approve(stockTakeId, APPROVER_ID);

		long finalOnHand = jdbc.sql("""
				SELECT sb.on_hand FROM inventory.stock_balance sb
				JOIN inventory.batch b ON b.id = sb.batch_id WHERE b.product_id = :p
				""")
			.param("p", product)
			.query(Long.class)
			.single();
		assertThat(finalOnHand).isEqualTo(75L);

		long stBatchId = jdbc.sql("SELECT id FROM inventory.batch WHERE product_id = :p")
			.param("p", product)
			.query(Long.class)
			.single();
		var stTrace = stockQueries.batchTraceability(stBatchId);
		assertThat(stTrace.batch().id()).isEqualTo(stBatchId);
		assertThat(stTrace.totalReceived()).isEqualTo(100L);
		assertThat(stTrace.totalIssued()).isEqualTo(20L);
		assertThat(stTrace.totalAdjusted()).isEqualTo(-5L);
		assertThat(stTrace.totalDisposed()).isZero();
		assertThat(stTrace.affectedIssueCount()).isEqualTo(1);
		assertThat(stTrace.movements()).hasSize(3);

		var reconciliation = stockQueries.reconcile();
		assertThat(reconciliation.consistent()).isTrue();
		assertThat(reconciliation.discrepancyCount()).isZero();
	}

	@Test
	void disposalLifecycleBatchReleaseExpiredLocationActiveFilterAndCsvExport() {
		LocalDate today = LocalDate.now(clock);
		long product = newProduct(StorageCondition.NORMAL, 0);
		ZoneAndLocation zl = newZoneAndLocation(StorageCondition.NORMAL);

		ReceiptResult receipt = inventory.receive(new ReceiptCommand(null, null, null, null, CREATOR_ID,
				List.of(new ReceiptCommand.Line(product, "LOT-DISP-1", null, today.plusDays(90), zl.locationId(),
						BASE_UNIT, 40, new BigDecimal("12.5000")))));
		long batchId = receipt.lines().getFirst().batchId();

		// Deactivating location excludes stock from availableBatches and overview.available, but keeps onHand
		jdbc.sql("UPDATE inventory.location SET active = false WHERE id = :id").param("id", zl.locationId()).update();
		assertThat(inventory.availableBatches(today)).noneMatch(b -> b.batchId() == batchId);
		var stockOverviewInactive = stockQueries.overview(null, 0, 100)
			.content()
			.stream()
			.filter(p -> p.productId() == product)
			.findFirst()
			.orElseThrow();
		assertThat(stockOverviewInactive.onHand()).isEqualTo(40L);
		assertThat(stockOverviewInactive.available()).isZero();
		jdbc.sql("UPDATE inventory.location SET active = true WHERE id = :id").param("id", zl.locationId()).update();

		// Active non-expired batch cannot be disposed until held
		assertThatThrownBy(() -> disposalService.dispose(List.of(batchId), "Hủy thử", CREATOR_ID))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo("BATCH_NOT_DISPOSABLE"));

		batchService.hold(batchId, "Vỡ bao bì");

		// Passing a mixed list of a valid batch and a non-existent/zero-stock batch is rejected with NOTHING_TO_DISPOSE
		assertThatThrownBy(() -> disposalService.dispose(List.of(batchId, 999999L), "Hủy thử", CREATOR_ID))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo("NOTHING_TO_DISPOSE"));

		// Expired held batch cannot be released -> throws BATCH_EXPIRED
		jdbc.sql("UPDATE inventory.batch SET expiry_date = :exp WHERE id = :id")
			.param("exp", today)
			.param("id", batchId)
			.update();
		assertThatThrownBy(() -> batchService.release(batchId))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo("BATCH_EXPIRED"));

		long disposalId = disposalService.dispose(List.of(batchId), "Tiêu hủy lô hỏng", CREATOR_ID);

		var summary = disposalService.get(disposalId);
		assertThat(summary.id()).isEqualTo(disposalId);
		assertThat(summary.lineCount()).isEqualTo(1);
		assertThat(summary.totalValue()).isEqualByComparingTo(new BigDecimal("500.0000"));
		assertThat(disposalService.lines(disposalId)).hasSize(1);

		var dispTrace = stockQueries.batchTraceability(batchId);
		assertThat(dispTrace.totalReceived()).isEqualTo(40L);
		assertThat(dispTrace.totalDisposed()).isEqualTo(40L);
		assertThat(dispTrace.movements()).hasSize(2);
		assertThatThrownBy(() -> stockQueries.batchTraceability(999999L))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo("BATCH_NOT_FOUND"));

		assertThatThrownBy(() -> disposalService.get(999999L))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo("DISPOSAL_NOT_FOUND"));
		assertThatThrownBy(() -> disposalService.lines(999999L))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo("DISPOSAL_NOT_FOUND"));

		// Verify CSV export contains UTF-8 BOM, headers, and movement rows
		byte[] csvBytes = stockQueries.exportStockMovementsCsv(today.minusDays(1), today);
		String csv = new String(csvBytes, StandardCharsets.UTF_8);
		assertThat(csv).startsWith("\uFEFFThời điểm,Loại giao dịch,Loại chứng từ,Mã tham chiếu,Mã SKU,Tên thuốc");
		assertThat(csv).contains("LOT-DISP-1").contains("DISPOSAL");
	}

	@Test
	void purchaseOrderFinalReceiptIdempotencyAndSuggestionFallbackSupplier() {
		ensureUsersExist();
		LocalDate today = LocalDate.now(clock);
		long product = newProduct(StorageCondition.NORMAL, 0);
		ZoneAndLocation zl = newZoneAndLocation(StorageCondition.NORMAL);

		String supCode = "SUP-" + UUID.randomUUID().toString().substring(0, 6).toUpperCase();
		var supplier = supplierService.create(supCode, new SupplierDetails("NCC Dược", null, null, null, 5));
		assertThat(supplierService.get(supplier.id()).code()).isEqualTo(supCode);

		assertThatThrownBy(() -> supplierService.deleteTerms(999999L, product))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo("SUPPLIER_NOT_FOUND"));

		// Create a suggestion originally without supplier_id, then declare preferred supplier terms and convert to PO
		long runId = jdbc.sql("""
				INSERT INTO forecasting.forecast_run (status, trigger_type, as_of_date, horizon_days, started_at, finished_at)
				VALUES ('SUCCEEDED', 'MANUAL', :today, 30, now(), now()) RETURNING id
				""")
			.param("today", today)
			.query(Long.class)
			.single();
		long suggestionId = jdbc.sql("""
				INSERT INTO forecasting.purchase_suggestion
				    (run_id, product_id, supplier_id, status, abc_class, service_level, daily_demand, daily_error_std,
				     lead_time_days, lead_time_std_days, review_period_days, safety_stock, reorder_point,
				     order_up_to_level, usable_on_hand, at_risk_quantity, on_order, inventory_position,
				     suggested_quantity, capped_by_shelf_life, forecast_quantity, horizon_days, created_at)
				VALUES (:run, :product, NULL, 'OPEN', 'A', 0.9800, 10.0000, 1.0000, 5.00, 1.00, 7, 10, 130, 200,
				        0, 0, 0, 0, 200, false, 300.00, 30, now())
				RETURNING id
				""")
			.param("run", runId)
			.param("product", product)
			.query(Long.class)
			.single();

		supplierService.upsertTerms(supplier.id(), product, 10, 50, BigDecimal.TEN, true);
		var orderResult = suggestionService.createOrders(List.of(new OrderItem(suggestionId, null)), CREATOR_ID);
		assertThat(orderResult.purchaseOrderBySuggestion()).containsKey(suggestionId);
		Long resolvedSupplierId = jdbc
			.sql("SELECT supplier_id FROM forecasting.purchase_suggestion WHERE id = :id")
			.param("id", suggestionId)
			.query(Long.class)
			.single();
		assertThat(resolvedSupplierId).isEqualTo(supplier.id());

		var order = purchaseOrderService.create(supplier.id(), PurchaseOrderSource.MANUAL, "Đơn test",
				List.of(new LineInput(product, BASE_UNIT, 50, BigDecimal.TEN, null)), CREATOR_ID);
		purchaseOrderService.submit(order.id(), CREATOR_ID);
		purchaseOrderService.approve(order.id(), APPROVER_ID);
		purchaseOrderService.markSent(order.id(), CREATOR_ID);

		String idempotencyKey = "po-rcpt-" + UUID.randomUUID();
		List<ReceiveLineInput> receiveLines = List.of(new ReceiveLineInput(product, "LOT-PO-1", null,
				today.plusDays(180), zl.locationId(), BASE_UNIT, 50, BigDecimal.TEN));

		// First delivery completes the PO -> status becomes RECEIVED
		var first = purchaseOrderService.receive(order.id(), idempotencyKey, "Nhập đủ", receiveLines, CREATOR_ID);
		assertThat(first.receipt().replayed()).isFalse();
		assertThat(first.order().status()).isEqualTo(PurchaseOrderStatus.RECEIVED);

		// Retrying with the SAME idempotencyKey on the now-RECEIVED PO returns the replay instead of 422
		var replayed = purchaseOrderService.receive(order.id(), idempotencyKey, "Nhập đủ", receiveLines, CREATOR_ID);
		assertThat(replayed.receipt().replayed()).isTrue();
		assertThat(replayed.receipt().receiptId()).isEqualTo(first.receipt().receiptId());
		assertThat(replayed.order().status()).isEqualTo(PurchaseOrderStatus.RECEIVED);

		// Calling with a blank idempotencyKey or a DIFFERENT idempotencyKey on the RECEIVED PO is rejected
		assertThatThrownBy(() -> purchaseOrderService.receive(order.id(), "   ", "Nhập thêm",
				receiveLines, CREATOR_ID))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo("INVALID_ORDER_TRANSITION"));
		assertThatThrownBy(() -> purchaseOrderService.receive(order.id(), "new-key-" + UUID.randomUUID(), "Nhập thêm",
				receiveLines, CREATOR_ID))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo("INVALID_ORDER_TRANSITION"));
	}

	private void ensureUsersExist() {
		jdbc.sql("""
				INSERT INTO iam.app_user (id, username, password_hash, full_name, role)
				VALUES (1, 'creator_test', 'hash', 'Người tạo', 'PURCHASER'),
				       (2, 'approver_test', 'hash', 'Người duyệt', 'PHARMACIST_MANAGER')
				ON CONFLICT (id) DO NOTHING
				""").update();
	}

	private long newProduct(StorageCondition condition, int minShelfLifeDays) {
		String suffix = UUID.randomUUID().toString().substring(0, 8);
		long category = jdbc.sql("INSERT INTO catalog.category (code, name) VALUES (:c, 'Test') RETURNING id")
			.param("c", "C-" + suffix)
			.query(Long.class)
			.single();
		long product = jdbc.sql("""
				INSERT INTO catalog.product (sku, name, active_ingredient, category_id, storage_condition, base_unit,
				                             min_shelf_life_on_receipt_days)
				VALUES (:sku, 'Thuốc test', 'Hoạt chất', :category, :cond, :unit, :minDays)
				RETURNING id
				""")
			.param("sku", "SKU-" + suffix)
			.param("category", category)
			.param("cond", condition.name())
			.param("unit", BASE_UNIT)
			.param("minDays", minShelfLifeDays)
			.query(Long.class)
			.single();
		jdbc.sql("INSERT INTO catalog.product_unit (product_id, unit_name, factor_to_base) VALUES (:p, :u, 1)")
			.param("p", product)
			.param("u", BASE_UNIT)
			.update();
		return product;
	}

	private ZoneAndLocation newZoneAndLocation(StorageCondition condition) {
		String suffix = UUID.randomUUID().toString().substring(0, 8);
		long warehouse = jdbc.sql("INSERT INTO inventory.warehouse (code, name) VALUES (:c, 'Kho test') RETURNING id")
			.param("c", "W-" + suffix)
			.query(Long.class)
			.single();
		long zone = jdbc.sql("""
				INSERT INTO inventory.zone (warehouse_id, code, name, storage_condition)
				VALUES (:w, 'Z1', 'Khu test', :cond) RETURNING id
				""")
			.param("w", warehouse)
			.param("cond", condition.name())
			.query(Long.class)
			.single();
		long location = jdbc.sql("INSERT INTO inventory.location (zone_id, code) VALUES (:z, 'A-01') RETURNING id")
			.param("z", zone)
			.query(Long.class)
			.single();
		return new ZoneAndLocation(zone, location);
	}

	private record ZoneAndLocation(long zoneId, long locationId) {
	}

}
