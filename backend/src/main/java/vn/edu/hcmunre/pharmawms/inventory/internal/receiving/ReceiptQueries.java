package vn.edu.hcmunre.pharmawms.inventory.internal.receiving;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

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
public class ReceiptQueries {

	private final JdbcClient jdbc;
	private final CatalogApi catalog;
	private final UserDirectory userDirectory;

	ReceiptQueries(JdbcClient jdbc, CatalogApi catalog, UserDirectory userDirectory) {
		this.jdbc = jdbc;
		this.catalog = catalog;
		this.userDirectory = userDirectory;
	}

	public PageResponse<ReceiptSummary> list(Long purchaseOrderId, int page, int size) {
		long total = jdbc.sql("""
				SELECT count(*) FROM inventory.goods_receipt
				WHERE (CAST(:poId AS BIGINT) IS NULL OR purchase_order_id = :poId)
				""")
			.param("poId", purchaseOrderId)
			.query(Long.class)
			.single();
		List<SummaryRow> rows = jdbc.sql("""
				SELECT gr.id, gr.code, gr.supplier_id, gr.purchase_order_id, gr.received_at, gr.received_by,
				       count(grl.id) AS line_count, coalesce(sum(grl.quantity * grl.unit_cost), 0) AS total_value
				FROM inventory.goods_receipt gr
				LEFT JOIN inventory.goods_receipt_line grl ON grl.receipt_id = gr.id
				WHERE (CAST(:poId AS BIGINT) IS NULL OR gr.purchase_order_id = :poId)
				GROUP BY gr.id
				ORDER BY gr.received_at DESC, gr.id DESC
				LIMIT :limit OFFSET :offset
				""")
			.param("poId", purchaseOrderId)
			.param("limit", size)
			.param("offset", (long) page * size)
			.query(SummaryRow.class)
			.list();
		Map<Long, String> names = userDirectory
			.fullNames(rows.stream().map(SummaryRow::receivedBy).collect(Collectors.toSet()));
		List<ReceiptSummary> content = rows.stream()
			.map(row -> new ReceiptSummary(row.id(), row.code(), row.supplierId(), row.purchaseOrderId(),
					row.receivedAt(), names.getOrDefault(row.receivedBy(), "#" + row.receivedBy()), row.lineCount(),
					row.totalValue()))
			.toList();
		return PageResponse.of(content, page, size, total);
	}

	public ReceiptView view(long receiptId) {
		HeaderRow header = jdbc.sql("""
				SELECT id, code, supplier_id, purchase_order_id, note, received_by, received_at
				FROM inventory.goods_receipt WHERE id = :id
				""")
			.param("id", receiptId)
			.query(HeaderRow.class)
			.optional()
			.orElseThrow(() -> BusinessException.notFound("GOODS_RECEIPT_NOT_FOUND",
					"Không tìm thấy phiếu nhập #" + receiptId));
		List<LineRow> rows = jdbc.sql("""
				SELECT grl.product_id, grl.batch_id, b.lot_number, b.manufacture_date, b.expiry_date,
				       grl.location_id, l.code AS location_code, grl.quantity, grl.unit_cost
				FROM inventory.goods_receipt_line grl
				JOIN inventory.batch b ON b.id = grl.batch_id
				JOIN inventory.location l ON l.id = grl.location_id
				WHERE grl.receipt_id = :id
				ORDER BY grl.id
				""")
			.param("id", receiptId)
			.query(LineRow.class)
			.list();
		Map<Long, ProductSummary> products = catalog
			.getProducts(rows.stream().map(LineRow::productId).collect(Collectors.toSet()));
		List<ReceiptLineView> lines = rows.stream().map(row -> {
			ProductSummary product = products.get(row.productId());
			return new ReceiptLineView(row.productId(), product.sku(), product.displayName(), product.baseUnit(),
					row.batchId(), row.lotNumber(), row.manufactureDate(), row.expiryDate(), row.locationId(),
					row.locationCode(), row.quantity(), row.unitCost());
		}).toList();
		return new ReceiptView(header.id(), header.code(), header.supplierId(), header.purchaseOrderId(),
				header.note(), userDirectory.fullName(header.receivedBy()), header.receivedAt(), lines);
	}

	public record ReceiptSummary(long id, String code, Long supplierId, Long purchaseOrderId,
			OffsetDateTime receivedAt, String receivedByName, int lineCount, BigDecimal totalValue) {
	}

	public record ReceiptView(long id, String code, Long supplierId, Long purchaseOrderId, String note,
			String receivedByName, OffsetDateTime receivedAt, List<ReceiptLineView> lines) {
	}

	public record ReceiptLineView(long productId, String sku, String productName, String baseUnit, long batchId,
			String lotNumber, LocalDate manufactureDate, LocalDate expiryDate, long locationId, String locationCode,
			long quantity, BigDecimal unitCost) {
	}

	private record SummaryRow(long id, String code, Long supplierId, Long purchaseOrderId, OffsetDateTime receivedAt,
			long receivedBy, int lineCount, BigDecimal totalValue) {
	}

	private record HeaderRow(long id, String code, Long supplierId, Long purchaseOrderId, String note,
			long receivedBy, OffsetDateTime receivedAt) {
	}

	private record LineRow(long productId, long batchId, String lotNumber, LocalDate manufactureDate,
			LocalDate expiryDate, long locationId, String locationCode, long quantity, BigDecimal unitCost) {
	}

}
