package vn.edu.hcmunre.pharmawms.inventory.internal.stock;

import java.time.LocalDate;

/**
 * One (batch, location) balance that can be issued from.
 */
public record StockCandidate(long batchId, long locationId, long productId, String lotNumber, LocalDate expiryDate,
		LocalDate manufactureDate, String locationCode, long available) {
}
