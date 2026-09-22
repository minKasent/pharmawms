package vn.edu.hcmunre.pharmawms.purchasing;

/**
 * A line of a draft purchase order created from a replenishment suggestion (base units).
 */
public record DraftOrderLine(long suggestionId, long productId, long supplierId, long quantity) {
}
