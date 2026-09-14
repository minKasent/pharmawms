package vn.edu.hcmunre.pharmawms.inventory.internal.issuing;

import java.util.List;

/**
 * @param minRemainingShelfLifeDays batches expiring sooner than this are never picked
 */
public record IssueCommand(String idempotencyKey, String destination, int minRemainingShelfLifeDays, String note,
		long issuedBy, List<Line> lines) {

	public IssueCommand {
		idempotencyKey = (idempotencyKey == null || idempotencyKey.isBlank()) ? null : idempotencyKey.trim();
		lines = List.copyOf(lines);
	}

	public record Line(long productId, String unitName, long quantity) {
	}

}
