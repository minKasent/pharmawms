package vn.edu.hcmunre.pharmawms.forecasting.internal.demand;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import vn.edu.hcmunre.pharmawms.forecasting.internal.demand.MovingAverageForecaster.Forecast;
import vn.edu.hcmunre.pharmawms.inventory.DemandPoint;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class MovingAverageForecasterTest {

	@Test
	void blends28DayAnd91DayMovingAveragesOverHorizon() {
		LocalDate asOf = LocalDate.of(2026, 10, 10);
		List<DemandPoint> points = new ArrayList<>();
		for (int i = 0; i < 91; i++) {
			long qty = i < 28 ? 20L : 10L;
			points.add(new DemandPoint(1L, asOf.minusDays(i), qty));
		}
		DemandHistory history = DemandHistory.of(asOf, 91, List.of(1L), points);

		Forecast forecast = MovingAverageForecaster.forecast(history, 1L, 14);

		double expectedShortRate = 20.0;
		double expectedLongRate = (28 * 20.0 + 63 * 10.0) / 91.0;
		double expectedDailyRate = (expectedShortRate + expectedLongRate) / 2.0;

		assertThat(forecast.productId()).isEqualTo(1L);
		assertThat(forecast.quantity()).isCloseTo(expectedDailyRate * 14, within(1e-6));
		assertThat(forecast.dailyErrorStd()).isGreaterThan(0);
	}

}
