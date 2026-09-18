package vn.edu.hcmunre.pharmawms.inventory;

import java.time.LocalDate;

/**
 * Quantity issued for one product on one local business day, in base units.
 */
public record DemandPoint(long productId, LocalDate day, long quantity) {
}
