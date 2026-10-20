package vn.edu.hcmunre.pharmawms.forecasting.internal.replenishment;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

import vn.edu.hcmunre.pharmawms.forecasting.internal.replenishment.ExpiryAwareStock.Batch;
import vn.edu.hcmunre.pharmawms.forecasting.internal.replenishment.ExpiryAwareStock.Split;

import static org.assertj.core.api.Assertions.assertThat;

class ExpiryAwareStockTest {

	private static final LocalDate TODAY = LocalDate.of(2026, 10, 1);
	private static final int MIN_REMAINING = 30;

	@Test
	void longDatedStockIsFullyUsable() {
		Split split = ExpiryAwareStock.split(List.of(new Batch(TODAY.plusDays(400), 100)), 10, TODAY, MIN_REMAINING);

		assertThat(split).isEqualTo(new Split(100, 0));
	}

	@Test
	void stockThatCannotBeSoldBeforeItsCutoffIsAtRisk() {
		// Issuable for 40 - 30 = 10 more days (+ today) -> 11 days * 5/day = 55 of 100
		Split split = ExpiryAwareStock.split(List.of(new Batch(TODAY.plusDays(40), 100)), 5, TODAY, MIN_REMAINING);

		assertThat(split).isEqualTo(new Split(55, 45));
	}

	@Test
	void stockPastIssueCutoffIsEntirelyAtRisk() {
		Split split = ExpiryAwareStock.split(List.of(new Batch(TODAY.plusDays(20), 80)), 100, TODAY, MIN_REMAINING);

		assertThat(split).isEqualTo(new Split(0, 80));
	}

	@Test
	void earlierBatchesConsumeDemandBeforeLaterOnes() {
		// Daily demand 10. Batch A sellable for 11 days -> 110 capacity, holds 100: all usable.
		// Batch B sellable for 21 days -> 210 capacity minus 100 already consumed = 110 of 200.
		List<Batch> batches = List.of(new Batch(TODAY.plusDays(50), 200), new Batch(TODAY.plusDays(40), 100));

		Split split = ExpiryAwareStock.split(batches, 10, TODAY, MIN_REMAINING);

		assertThat(split).isEqualTo(new Split(210, 90));
	}

	@Test
	void zeroDemandMeansNothingWillSell() {
		Split split = ExpiryAwareStock.split(List.of(new Batch(TODAY.plusDays(400), 100)), 0, TODAY, MIN_REMAINING);

		assertThat(split).isEqualTo(new Split(0, 100));
	}

	@Test
	void noStock() {
		assertThat(ExpiryAwareStock.split(List.of(), 10, TODAY, MIN_REMAINING)).isEqualTo(new Split(0, 0));
	}

}
