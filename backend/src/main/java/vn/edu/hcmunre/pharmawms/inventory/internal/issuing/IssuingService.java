package vn.edu.hcmunre.pharmawms.inventory.internal.issuing;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.edu.hcmunre.pharmawms.catalog.CatalogApi;
import vn.edu.hcmunre.pharmawms.catalog.ProductSummary;
import vn.edu.hcmunre.pharmawms.inventory.internal.issuing.FefoAllocator.Allocation;
import vn.edu.hcmunre.pharmawms.inventory.internal.issuing.FefoAllocator.AllocationPlan;
import vn.edu.hcmunre.pharmawms.inventory.internal.issuing.IssueViews.AllocationView;
import vn.edu.hcmunre.pharmawms.inventory.internal.issuing.IssueViews.IssuePreview;
import vn.edu.hcmunre.pharmawms.inventory.internal.issuing.IssueViews.IssueView;
import vn.edu.hcmunre.pharmawms.inventory.internal.issuing.IssueViews.PreviewLine;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.DocumentSequence;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.MovementType;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.StockCandidate;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.StockLedger;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.StockLedger.StockChange;
import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;

@Service
public class IssuingService {

	static final String REFERENCE_TYPE = "GOODS_ISSUE";

	private final JdbcClient jdbc;
	private final StockLedger ledger;
	private final CatalogApi catalog;
	private final IssueQueries queries;
	private final Clock clock;

	IssuingService(JdbcClient jdbc, StockLedger ledger, CatalogApi catalog, IssueQueries queries, Clock clock) {
		this.jdbc = jdbc;
		this.ledger = ledger;
		this.catalog = catalog;
		this.queries = queries;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public IssuePreview preview(IssueCommand command) {
		List<ResolvedLine> lines = resolve(command);
		LocalDate minExpiry = minExpiryDate(command.minRemainingShelfLifeDays());
		Map<Long, AllocationPlan> plans = plan(lines, ledger.issuableStock(productIds(lines), minExpiry, false));
		List<PreviewLine> previewLines = lines.stream().map(line -> {
			AllocationPlan plan = plans.get(line.product().id());
			return new PreviewLine(line.product().id(), line.product().sku(), line.product().displayName(),
					line.product().baseUnit(), line.baseQuantity(), plan.shortage(), toViews(plan.allocations()));
		}).toList();
		boolean fullyAllocatable = plans.values().stream().allMatch(AllocationPlan::isFullyAllocated);
		return new IssuePreview(minExpiry, fullyAllocatable, previewLines);
	}

	/**
	 * Books a goods issue atomically: either every line is fully allocated by FEFO and stock is
	 * decremented, or nothing changes. Replaying the same idempotency key returns the original issue.
	 */
	@Transactional
	public IssueView issue(IssueCommand command) {
		if (command.idempotencyKey() != null && !command.idempotencyKey().isBlank()) {
			Optional<Long> existing = queries.findByIdempotencyKey(command.idempotencyKey());
			if (existing.isPresent()) {
				return queries.view(existing.get(), true);
			}
		}
		List<ResolvedLine> lines = resolve(command);
		Instant now = clock.instant();
		LocalDate minExpiry = minExpiryDate(command.minRemainingShelfLifeDays());

		Optional<Long> issueId = insertHeader(command, now);
		if (issueId.isEmpty()) {
			return queries.findByIdempotencyKey(command.idempotencyKey())
				.map(existing -> queries.view(existing, true))
				.orElseThrow(() -> new IllegalStateException("Idempotent issue disappeared"));
		}

		Map<Long, AllocationPlan> plans = plan(lines, ledger.issuableStock(productIds(lines), minExpiry, true));
		rejectShortages(lines, plans, minExpiry);

		for (ResolvedLine line : lines) {
			long lineId = insertLine(issueId.get(), line);
			for (Allocation allocation : plans.get(line.product().id()).allocations()) {
				insertAllocation(lineId, allocation);
				ledger.removeStock(new StockChange(allocation.source().batchId(), allocation.source().locationId(),
						line.product().id(), MovementType.ISSUE, allocation.quantity(), REFERENCE_TYPE, issueId.get(),
						command.issuedBy(), now));
			}
		}
		return queries.view(issueId.get(), false);
	}

	private List<ResolvedLine> resolve(IssueCommand command) {
		if (command.lines().isEmpty()) {
			throw BusinessException.unprocessable("EMPTY_DOCUMENT", "Phiếu xuất phải có ít nhất một dòng.");
		}
		var seen = new HashSet<Long>();
		for (IssueCommand.Line line : command.lines()) {
			if (!seen.add(line.productId())) {
				throw BusinessException.unprocessable("DUPLICATE_PRODUCT_LINE",
						"Mỗi thuốc chỉ được xuất trên một dòng (thuốc #%d bị lặp).".formatted(line.productId()));
			}
		}
		Map<Long, ProductSummary> products = catalog.getProducts(seen);
		return command.lines().stream().map(line -> {
			ProductSummary product = products.get(line.productId());
			if (product == null || !product.active()) {
				throw BusinessException.unprocessable("PRODUCT_NOT_ISSUABLE",
						"Thuốc #%d không tồn tại hoặc đã ngừng kinh doanh.".formatted(line.productId()));
			}
			return new ResolvedLine(product, catalog.toBaseUnits(product, line.unitName(), line.quantity()));
		}).toList();
	}

	private static Map<Long, AllocationPlan> plan(List<ResolvedLine> lines, List<StockCandidate> candidates) {
		Map<Long, List<StockCandidate>> byProduct = candidates.stream()
			.collect(Collectors.groupingBy(StockCandidate::productId));
		Map<Long, AllocationPlan> plans = new LinkedHashMap<>();
		for (ResolvedLine line : lines) {
			long productId = line.product().id();
			plans.put(productId, FefoAllocator.allocate(line.baseQuantity(), byProduct.getOrDefault(productId, List.of())));
		}
		return plans;
	}

	private static void rejectShortages(List<ResolvedLine> lines, Map<Long, AllocationPlan> plans, LocalDate minExpiry) {
		List<Map<String, Object>> shortages = new ArrayList<>();
		for (ResolvedLine line : lines) {
			AllocationPlan plan = plans.get(line.product().id());
			if (!plan.isFullyAllocated()) {
				shortages.add(Map.of("productId", line.product().id(), "sku", line.product().sku(), "requested",
						plan.requestedQuantity(), "available", plan.allocatedQuantity(), "unit",
						line.product().baseUnit()));
			}
		}
		if (!shortages.isEmpty()) {
			throw BusinessException.unprocessable("INSUFFICIENT_STOCK",
					"Không đủ tồn kho hợp lệ (hạn dùng từ %s trở đi) để xuất.".formatted(minExpiry),
					Map.of("shortages", shortages));
		}
	}

	private Optional<Long> insertHeader(IssueCommand command, Instant now) {
		String code = ledger.nextDocumentCode(DocumentSequence.GOODS_ISSUE);
		return jdbc.sql("""
				INSERT INTO inventory.goods_issue (code, destination, min_remaining_shelf_life_days, idempotency_key,
				                                   note, issued_by, issued_at)
				VALUES (:code, :destination, :minDays, :idempotencyKey, :note, :issuedBy, :issuedAt)
				ON CONFLICT (idempotency_key) DO NOTHING
				RETURNING id
				""")
			.param("code", code)
			.param("destination", command.destination())
			.param("minDays", command.minRemainingShelfLifeDays())
			.param("idempotencyKey", command.idempotencyKey())
			.param("note", command.note())
			.param("issuedBy", command.issuedBy())
			.param("issuedAt", StockLedger.utc(now))
			.query(Long.class)
			.optional();
	}

	private long insertLine(long issueId, ResolvedLine line) {
		return jdbc.sql("""
				INSERT INTO inventory.goods_issue_line (issue_id, product_id, quantity)
				VALUES (:issueId, :productId, :quantity)
				RETURNING id
				""")
			.param("issueId", issueId)
			.param("productId", line.product().id())
			.param("quantity", line.baseQuantity())
			.query(Long.class)
			.single();
	}

	private void insertAllocation(long lineId, Allocation allocation) {
		jdbc.sql("""
				INSERT INTO inventory.issue_allocation (issue_line_id, batch_id, location_id, quantity)
				VALUES (:lineId, :batchId, :locationId, :quantity)
				""")
			.param("lineId", lineId)
			.param("batchId", allocation.source().batchId())
			.param("locationId", allocation.source().locationId())
			.param("quantity", allocation.quantity())
			.update();
	}

	private LocalDate minExpiryDate(int minRemainingShelfLifeDays) {
		return LocalDate.now(clock).plusDays(minRemainingShelfLifeDays);
	}

	private static List<Long> productIds(List<ResolvedLine> lines) {
		return lines.stream().map(line -> line.product().id()).sorted().toList();
	}

	private static List<AllocationView> toViews(List<Allocation> allocations) {
		return allocations.stream()
			.map(allocation -> new AllocationView(allocation.source().batchId(), allocation.source().lotNumber(),
					allocation.source().expiryDate(), allocation.source().locationId(),
					allocation.source().locationCode(), allocation.quantity()))
			.toList();
	}

	private record ResolvedLine(ProductSummary product, long baseQuantity) {
	}

}
