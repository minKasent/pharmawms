package vn.edu.hcmunre.pharmawms.inventory.internal.issuing;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.edu.hcmunre.pharmawms.catalog.CatalogApi;
import vn.edu.hcmunre.pharmawms.catalog.ProductSummary;
import vn.edu.hcmunre.pharmawms.iam.UserDirectory;
import vn.edu.hcmunre.pharmawms.inventory.internal.issuing.IssueViews.AllocationView;
import vn.edu.hcmunre.pharmawms.inventory.internal.issuing.IssueViews.IssueLineView;
import vn.edu.hcmunre.pharmawms.inventory.internal.issuing.IssueViews.IssueSummary;
import vn.edu.hcmunre.pharmawms.inventory.internal.issuing.IssueViews.IssueView;
import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;
import vn.edu.hcmunre.pharmawms.shared.web.PageResponse;

@Component
@Transactional(readOnly = true)
public class IssueQueries {

	private final JdbcClient jdbc;
	private final CatalogApi catalog;
	private final UserDirectory userDirectory;

	IssueQueries(JdbcClient jdbc, CatalogApi catalog, UserDirectory userDirectory) {
		this.jdbc = jdbc;
		this.catalog = catalog;
		this.userDirectory = userDirectory;
	}

	Optional<Long> findByIdempotencyKey(String idempotencyKey) {
		return jdbc.sql("SELECT id FROM inventory.goods_issue WHERE idempotency_key = :key")
			.param("key", idempotencyKey)
			.query(Long.class)
			.optional();
	}

	public PageResponse<IssueSummary> list(int page, int size) {
		long total = jdbc.sql("SELECT count(*) FROM inventory.goods_issue").query(Long.class).single();
		List<SummaryRow> rows = jdbc.sql("""
				SELECT gi.id, gi.code, gi.destination, gi.issued_at, gi.issued_by,
				       count(gil.id) AS line_count, coalesce(sum(gil.quantity), 0) AS total_quantity
				FROM inventory.goods_issue gi
				LEFT JOIN inventory.goods_issue_line gil ON gil.issue_id = gi.id
				GROUP BY gi.id
				ORDER BY gi.issued_at DESC, gi.id DESC
				LIMIT :limit OFFSET :offset
				""")
			.param("limit", size)
			.param("offset", (long) page * size)
			.query(SummaryRow.class)
			.list();
		Map<Long, String> names = userDirectory.fullNames(rows.stream().map(SummaryRow::issuedBy).collect(Collectors.toSet()));
		List<IssueSummary> content = rows.stream()
			.map(row -> new IssueSummary(row.id(), row.code(), row.destination(), row.issuedAt(), row.issuedBy(),
					names.getOrDefault(row.issuedBy(), "#" + row.issuedBy()), row.lineCount(), row.totalQuantity()))
			.toList();
		return PageResponse.of(content, page, size, total);
	}

	public IssueView view(long issueId, boolean replayed) {
		HeaderRow header = jdbc.sql("""
				SELECT id, code, destination, min_remaining_shelf_life_days, note, issued_by, issued_at
				FROM inventory.goods_issue WHERE id = :id
				""")
			.param("id", issueId)
			.query(HeaderRow.class)
			.optional()
			.orElseThrow(() -> BusinessException.notFound("GOODS_ISSUE_NOT_FOUND", "Không tìm thấy phiếu xuất #" + issueId));

		List<LineRow> rows = jdbc.sql("""
				SELECT gil.id AS line_id, gil.product_id, gil.quantity AS line_quantity,
				       ia.batch_id, b.lot_number, b.expiry_date, ia.location_id, l.code AS location_code,
				       ia.quantity AS allocated_quantity
				FROM inventory.goods_issue_line gil
				JOIN inventory.issue_allocation ia ON ia.issue_line_id = gil.id
				JOIN inventory.batch b ON b.id = ia.batch_id
				JOIN inventory.location l ON l.id = ia.location_id
				WHERE gil.issue_id = :id
				ORDER BY gil.id, b.expiry_date, ia.id
				""")
			.param("id", issueId)
			.query(LineRow.class)
			.list();

		Set<Long> productIds = rows.stream().map(LineRow::productId).collect(Collectors.toSet());
		Map<Long, ProductSummary> products = catalog.getProducts(productIds);
		Map<Long, List<LineRow>> byLine = rows.stream()
			.collect(Collectors.groupingBy(LineRow::lineId, LinkedHashMap::new, Collectors.toList()));
		List<IssueLineView> lines = byLine.values().stream().map(lineRows -> {
			LineRow first = lineRows.getFirst();
			ProductSummary product = products.get(first.productId());
			List<AllocationView> allocations = lineRows.stream()
				.map(row -> new AllocationView(row.batchId(), row.lotNumber(), row.expiryDate(), row.locationId(),
						row.locationCode(), row.allocatedQuantity()))
				.toList();
			return new IssueLineView(first.productId(), product.sku(), product.displayName(), product.baseUnit(),
					first.lineQuantity(), allocations);
		}).toList();

		return new IssueView(header.id(), header.code(), header.destination(), header.minRemainingShelfLifeDays(),
				header.note(), header.issuedBy(), userDirectory.fullName(header.issuedBy()), header.issuedAt(), replayed,
				lines);
	}

	private record SummaryRow(long id, String code, String destination, OffsetDateTime issuedAt, long issuedBy,
			int lineCount, long totalQuantity) {
	}

	private record HeaderRow(long id, String code, String destination, int minRemainingShelfLifeDays, String note,
			long issuedBy, OffsetDateTime issuedAt) {
	}

	private record LineRow(long lineId, long productId, long lineQuantity, long batchId, String lotNumber,
			LocalDate expiryDate, long locationId, String locationCode, long allocatedQuantity) {
	}

}
