package vn.edu.hcmunre.pharmawms.purchasing;

import java.math.BigDecimal;

/**
 * How a product is bought: from which supplier, in which multiples, and how long it takes.
 * Lead time statistics come from received orders; with too few samples the supplier's declared
 * lead time is used with an assumed coefficient of variation.
 *
 * @param packSize order quantities are rounded up to a multiple of this (base units)
 * @param leadTimeSampleSize number of received orders behind the statistics (0 = assumed)
 */
public record SupplyTerms(long productId, long supplierId, String supplierName, long packSize, long minOrderQuantity,
		BigDecimal unitPrice, double leadTimeMeanDays, double leadTimeStdDays, int leadTimeSampleSize) {
}
