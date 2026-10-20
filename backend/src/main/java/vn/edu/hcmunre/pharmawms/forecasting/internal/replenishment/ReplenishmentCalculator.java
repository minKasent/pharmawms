package vn.edu.hcmunre.pharmawms.forecasting.internal.replenishment;

/**
 * Periodic-review (R, s, S) replenishment with forecast and lead-time uncertainty.
 *
 * <pre>
 * protection interval  P  = L + R
 * safety stock         SS = z * sqrt(P * sigma_d^2 + d^2 * sigma_L^2)
 * reorder point        s  = d * P + SS
 * order-up-to level    S  = s + d * R
 * inventory position   IP = usable on hand + on order        (stock at risk of expiry excluded)
 * order quantity       Q  = S - IP  when IP <= s, else 0
 * </pre>
 *
 * Reviews happen every R days, so stock must cover demand for the review period plus the lead
 * time; S adds one review period of demand so an order is never trivially small. Q is then
 * rounded up to the pack size and minimum order quantity, and capped so the new batch can be
 * consumed while it still has the guaranteed shelf life on receipt.
 */
public final class ReplenishmentCalculator {

	private ReplenishmentCalculator() {
	}

	/**
	 * @param dailyDemand forecast mean demand per day (base units)
	 * @param dailyErrorStd standard deviation of the daily forecast error
	 * @param guaranteedIssuableDays days a newly received batch is guaranteed to stay issuable
	 * (minimum shelf life on receipt minus minimum remaining shelf life on issue); {@code null} =
	 * unknown / no shelf-life cap, {@code 0} = zero issuable days
	 */
	public record Input(double dailyDemand, double dailyErrorStd, double leadTimeDays, double leadTimeStdDays,
			int reviewPeriodDays, double serviceLevel, long usableOnHand, long onOrder, long packSize,
			long minOrderQuantity, Integer guaranteedIssuableDays) {

		public Input {
			if (dailyDemand < 0 || dailyErrorStd < 0 || leadTimeDays < 0 || leadTimeStdDays < 0) {
				throw new IllegalArgumentException("demand and lead time statistics must be non-negative");
			}
			if (reviewPeriodDays < 1 || packSize < 1 || minOrderQuantity < 0) {
				throw new IllegalArgumentException("review period and pack size must be positive");
			}
			if (guaranteedIssuableDays != null && guaranteedIssuableDays < 0) {
				throw new IllegalArgumentException("guaranteedIssuableDays must be non-negative");
			}
		}

	}

	public record Plan(double safetyFactor, long safetyStock, long reorderPoint, long orderUpToLevel,
			long inventoryPosition, Double daysOfCover, long suggestedQuantity, boolean cappedByShelfLife) {
	}

	public static Plan plan(Input in) {
		double z = NormalQuantile.of(in.serviceLevel());
		double protection = in.leadTimeDays() + in.reviewPeriodDays();
		double d = in.dailyDemand();
		double sigmaSquared = protection * square(in.dailyErrorStd()) + square(d) * square(in.leadTimeStdDays());
		long safetyStock = ceil(z * Math.sqrt(sigmaSquared));
		long reorderPoint = ceil(d * protection) + safetyStock;
		long orderUpTo = reorderPoint + ceil(d * in.reviewPeriodDays());
		long position = in.usableOnHand() + in.onOrder();
		Double daysOfCover = d > 0 ? in.usableOnHand() / d : null;

		if (d <= 0 || position > reorderPoint) {
			return new Plan(z, safetyStock, reorderPoint, orderUpTo, position, daysOfCover, 0, false);
		}
		long quantity = roundUp(Math.max(orderUpTo - position, in.minOrderQuantity()), in.packSize());

		boolean capped = false;
		if (in.guaranteedIssuableDays() != null) {
			// The new batch is used after what is left when it arrives; it must sell out in time.
			double stockLeftOnArrival = Math.max(0, position - d * in.leadTimeDays());
			long sellable = (long) Math.floor(d * in.guaranteedIssuableDays() - stockLeftOnArrival);
			long cap = roundDown(Math.max(sellable, 0), in.packSize());
			if (quantity > cap) {
				capped = true;
				// Ordering less than the MOQ is impossible; keep the MOQ and let the flag warn the buyer.
				quantity = Math.max(cap, roundUp(in.minOrderQuantity(), in.packSize()));
			}
		}
		return new Plan(z, safetyStock, reorderPoint, orderUpTo, position, daysOfCover, quantity, capped);
	}

	private static double square(double value) {
		return value * value;
	}

	private static long ceil(double value) {
		return (long) Math.ceil(value);
	}

	static long roundUp(long quantity, long multiple) {
		return Math.multiplyExact(Math.ceilDiv(quantity, multiple), multiple);
	}

	static long roundDown(long quantity, long multiple) {
		return Math.floorDiv(quantity, multiple) * multiple;
	}

}
