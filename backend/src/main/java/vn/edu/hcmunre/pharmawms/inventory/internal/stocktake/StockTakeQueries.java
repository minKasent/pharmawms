package vn.edu.hcmunre.pharmawms.inventory.internal.stocktake;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.edu.hcmunre.pharmawms.catalog.CatalogApi;
import vn.edu.hcmunre.pharmawms.catalog.ProductSummary;
import vn.edu.hcmunre.pharmawms.iam.UserDirectory;
import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;

@Component
@Transactional(readOnly = true)
public class StockTakeQueries {

	private static final int LIST_LIMIT = 100;

	private final JdbcClient jdbc;
	private final CatalogApi catalog;
	private final UserDirectory userDirectory;

	StockTakeQueries(JdbcClient jdbc, CatalogApi catalog, UserDirectory userDirectory) {
		this.jdbc = jdbc;
		this.catalog = catalog;
		this.userDirectory = userDirectory;
	}

	public List<StockTakeSummary> list() {
		return summaries(null);
	}

	public StockTakeView view(long id) {
		StockTakeSummary header = summaries(id).stream()
			.findFirst()
			.orElseThrow(() -> BusinessException.notFound("STOCK_TAKE_NOT_FOUND", "Không tìm thấy phiếu kiểm kê #" + id));
		List<LineRow> rows = jdbc.sql("""
				SELECT stl.id, stl.batch_id, b.lot_number, b.expiry_date, stl.location_id, l.code AS location_code,
				       stl.product_id, stl.system_quantity, stl.counted_quantity
				FROM inventory.stock_take_line stl
				JOIN inventory.batch b ON b.id = stl.batch_id
				JOIN inventory.location l ON l.id = stl.location_id
				WHERE stl.stock_take_id = :id
				ORDER BY l.code, b.expiry_date, stl.id
				""")
			.param("id", id)
			.query(LineRow.class)
			.list();
		Map<Long, ProductSummary> products = catalog
			.getProducts(rows.stream().map(LineRow::productId).collect(Collectors.toSet()));
		List<StockTakeLineView> lines = rows.stream().map(row -> {
			ProductSummary product = products.get(row.productId());
			Long difference = row.countedQuantity() == null ? null : row.countedQuantity() - row.systemQuantity();
			return new StockTakeLineView(row.id(), row.productId(), product.sku(), product.displayName(),
					product.baseUnit(), row.batchId(), row.lotNumber(), row.expiryDate(), row.locationId(),
					row.locationCode(), row.systemQuantity(), row.countedQuantity(), difference);
		}).toList();
		return new StockTakeView(header, lines);
	}

	private List<StockTakeSummary> summaries(Long id) {
		List<SummaryRow> rows = jdbc.sql("""
				SELECT st.id, st.code, st.zone_id, z.code AS zone_code, st.status, st.created_by, st.created_at,
				       st.approved_by, st.approved_at,
				       count(stl.id) AS line_count,
				       count(stl.id) FILTER (WHERE stl.counted_quantity IS NOT NULL
				                               AND stl.counted_quantity <> stl.system_quantity) AS difference_count
				FROM inventory.stock_take st
				JOIN inventory.zone z ON z.id = st.zone_id
				LEFT JOIN inventory.stock_take_line stl ON stl.stock_take_id = st.id
				WHERE (CAST(:id AS BIGINT) IS NULL OR st.id = :id)
				GROUP BY st.id, z.code
				ORDER BY st.created_at DESC
				LIMIT :limit
				""")
			.param("id", id)
			.param("limit", LIST_LIMIT)
			.query(SummaryRow.class)
			.list();
		Set<Long> userIds = new HashSet<>();
		rows.forEach(row -> {
			userIds.add(row.createdBy());
			if (row.approvedBy() != null) {
				userIds.add(row.approvedBy());
			}
		});
		Map<Long, String> names = userDirectory.fullNames(userIds);
		return rows.stream()
			.map(row -> new StockTakeSummary(row.id(), row.code(), row.zoneId(), row.zoneCode(), row.status(),
					row.createdBy(), names.getOrDefault(row.createdBy(), "#" + row.createdBy()), row.createdAt(),
					row.approvedBy() == null ? null : names.getOrDefault(row.approvedBy(), "#" + row.approvedBy()),
					row.approvedAt(), row.lineCount(), row.differenceCount()))
			.toList();
	}

	public record StockTakeSummary(long id, String code, long zoneId, String zoneCode, String status, long createdBy,
			String createdByName, OffsetDateTime createdAt, String approvedByName, OffsetDateTime approvedAt,
			long lineCount, long differenceCount) {
	}

	public record StockTakeView(StockTakeSummary header, List<StockTakeLineView> lines) {
	}

	public record StockTakeLineView(long lineId, long productId, String sku, String productName, String baseUnit,
			long batchId, String lotNumber, LocalDate expiryDate, long locationId, String locationCode,
			long systemQuantity, Long countedQuantity, Long difference) {
	}

	private record SummaryRow(long id, String code, long zoneId, String zoneCode, String status, long createdBy,
			OffsetDateTime createdAt, Long approvedBy, OffsetDateTime approvedAt, long lineCount,
			long differenceCount) {
	}

	private record LineRow(long id, long batchId, String lotNumber, LocalDate expiryDate, long locationId,
			String locationCode, long productId, long systemQuantity, Long countedQuantity) {
	}

}
