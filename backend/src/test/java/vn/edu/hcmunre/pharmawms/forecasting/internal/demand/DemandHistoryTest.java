package vn.edu.hcmunre.pharmawms.forecasting.internal.demand;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

import vn.edu.hcmunre.pharmawms.inventory.DemandPoint;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class DemandHistoryTest {

	private static final LocalDate AS_OF = LocalDate.of(2026, 10, 10);

	@Test
	void buildsDenseDailySeriesAndIgnoresOutOfWindowPoints() {
		DemandHistory history = DemandHistory.of(AS_OF, 5, List.of(1L, 2L), List.of(
				new DemandPoint(1L, AS_OF.minusDays(5), 999),
				new DemandPoint(1L, AS_OF.minusDays(4), 10),
				new DemandPoint(1L, AS_OF, 20),
				new DemandPoint(1L, AS_OF.plusDays(1), 888),
				new DemandPoint(99L, AS_OF, 50)));

		assertThat(history.asOf()).isEqualTo(AS_OF);
		assertThat(history.start()).isEqualTo(AS_OF.minusDays(4));
		assertThat(history.productIds()).containsExactlyInAnyOrder(1L, 2L);
		assertThat(history.daily(1L, 5)).containsExactly(10.0, 0.0, 0.0, 0.0, 20.0);
		assertThat(history.total(1L, 5)).isEqualTo(30.0);
		assertThat(history.total(1L, 2)).isEqualTo(20.0);
		assertThat(history.total(2L, 5)).isZero();
	}

	@Test
	void computesSampleStandardDeviationAndNonZeroObservations() {
		DemandHistory history = DemandHistory.of(AS_OF, 4, List.of(1L), List.of(
				new DemandPoint(1L, AS_OF.minusDays(3), 10),
				new DemandPoint(1L, AS_OF.minusDays(1), 20),
				new DemandPoint(1L, AS_OF, 30)));

		// values = [10, 0, 20, 30], mean = 15, variance = ((25 + 225 + 25 + 225) / 3) = 500/3
		assertThat(history.dailyStd(1L, 4)).isCloseTo(Math.sqrt(500.0 / 3.0), within(1e-6));
		assertThat(history.dailyStd(1L, 1)).isZero();
		assertThat(history.nonZeroObservations()).hasSize(3);
	}

}
