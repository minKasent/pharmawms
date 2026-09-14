package vn.edu.hcmunre.pharmawms.inventory.internal.issuing;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

public final class IssueViews {

	private IssueViews() {
	}

	public record IssueView(long id, String code, String destination, int minRemainingShelfLifeDays, String note,
			long issuedBy, String issuedByName, OffsetDateTime issuedAt, boolean replayed, List<IssueLineView> lines) {
	}

	public record IssueLineView(long productId, String sku, String productName, String baseUnit, long quantity,
			List<AllocationView> allocations) {
	}

	public record AllocationView(long batchId, String lotNumber, LocalDate expiryDate, long locationId,
			String locationCode, long quantity) {
	}

	public record IssueSummary(long id, String code, String destination, OffsetDateTime issuedAt, long issuedBy,
			String issuedByName, int lineCount, long totalQuantity) {
	}

	/**
	 * Result of a dry run: what FEFO would pick right now, without locking or booking.
	 */
	public record IssuePreview(LocalDate minExpiryDate, boolean fullyAllocatable, List<PreviewLine> lines) {
	}

	public record PreviewLine(long productId, String sku, String productName, String baseUnit,
			long requestedQuantity, long shortage, List<AllocationView> allocations) {
	}

}
