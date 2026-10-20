package vn.edu.hcmunre.pharmawms.inventory.internal.expiry;

/**
 * Remaining shelf life bands used by the risk heatmap.
 */
public enum ExpiryBucket {

	EXPIRED("Đã hết hạn", Integer.MIN_VALUE, 0),
	DAYS_1_30("≤ 30 ngày", 1, 30),
	DAYS_31_90("31–90 ngày", 31, 90),
	DAYS_91_180("91–180 ngày", 91, 180),
	OVER_180("> 180 ngày", 181, Integer.MAX_VALUE);

	private final String label;
	private final int minDays;
	private final int maxDays;

	ExpiryBucket(String label, int minDays, int maxDays) {
		this.label = label;
		this.minDays = minDays;
		this.maxDays = maxDays;
	}

	public static ExpiryBucket of(long daysToExpiry) {
		for (ExpiryBucket bucket : values()) {
			if (daysToExpiry >= bucket.minDays && daysToExpiry <= bucket.maxDays) {
				return bucket;
			}
		}
		throw new IllegalStateException("No bucket for " + daysToExpiry);
	}

	public String label() {
		return label;
	}

}
