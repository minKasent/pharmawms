package vn.edu.hcmunre.pharmawms.inventory;

import java.util.List;

/**
 * @param replayed {@code true} when the idempotency key was already used and the original
 * receipt is returned without booking stock again
 */
public record ReceiptResult(long receiptId, String code, boolean replayed, List<Line> lines) {

	public ReceiptResult {
		lines = List.copyOf(lines);
	}

	public record Line(long productId, long batchId, long baseQuantity) {
	}

}
