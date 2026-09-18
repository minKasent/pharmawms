package vn.edu.hcmunre.pharmawms.inventory;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * A goods receipt. Quantities are in {@code unitName} and converted to base units on receipt.
 */
public record ReceiptCommand(String idempotencyKey, Long supplierId, Long purchaseOrderId, String note,
		long receivedBy, List<Line> lines) {

	public ReceiptCommand {
		idempotencyKey = (idempotencyKey == null || idempotencyKey.isBlank()) ? null : idempotencyKey.trim();
		lines = List.copyOf(lines);
	}

	public record Line(long productId, String lotNumber, LocalDate manufactureDate, LocalDate expiryDate,
			long locationId, String unitName, long quantity, BigDecimal unitCostPerBaseUnit) {
	}

}
