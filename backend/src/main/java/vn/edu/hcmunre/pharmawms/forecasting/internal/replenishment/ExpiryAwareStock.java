package vn.edu.hcmunre.pharmawms.forecasting.internal.replenishment;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;

/**
 * Splits on-hand stock into what can still be issued before it becomes unsellable and what is
 * at risk of expiring on the shelf, by simulating FEFO consumption at the forecast daily rate.
 *
 * <p>A batch can be issued until {@code expiry - minRemainingShelfLifeDays}. Batches are consumed
 * earliest-expiry first, so by the time a later batch is reached, the earlier ones have used up
 * part of the demand. Counting at-risk stock as available would hide an upcoming stock-out.
 */
public final class ExpiryAwareStock {

	private ExpiryAwareStock() {
	}

	public record Batch(LocalDate expiryDate, long quantity) {
	}

	public record Split(long usable, long atRisk) {
	}

	public static Split split(List<Batch> batches, double dailyDemand, LocalDate today, int minRemainingShelfLifeDays) {
		double consumed = 0;
		long usable = 0;
		long atRisk = 0;
		List<Batch> fefo = batches.stream().sorted(Comparator.comparing(Batch::expiryDate)).toList();
		for (Batch batch : fefo) {
			long sellableDays = Math.max(0,
					ChronoUnit.DAYS.between(today, batch.expiryDate().minusDays(minRemainingShelfLifeDays)) + 1);
			double demandUntilUnsellable = dailyDemand * sellableDays;
			long canUse = (long) Math.floor(Math.clamp(demandUntilUnsellable - consumed, 0, batch.quantity()));
			usable += canUse;
			atRisk += batch.quantity() - canUse;
			consumed += canUse;
		}
		return new Split(usable, atRisk);
	}

}
