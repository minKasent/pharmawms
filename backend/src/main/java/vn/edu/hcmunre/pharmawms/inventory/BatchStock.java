package vn.edu.hcmunre.pharmawms.inventory;

import java.time.LocalDate;

/**
 * Issuable quantity of one batch (summed over locations), in base units.
 */
public record BatchStock(long productId, long batchId, LocalDate expiryDate, long available) {
}
