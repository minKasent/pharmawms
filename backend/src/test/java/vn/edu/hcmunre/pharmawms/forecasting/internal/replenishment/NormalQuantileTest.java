package vn.edu.hcmunre.pharmawms.forecasting.internal.replenishment;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.within;

class NormalQuantileTest {

	@ParameterizedTest
	@CsvSource({ "0.5, 0", "0.90, 1.281552", "0.95, 1.644854", "0.98, 2.053749", "0.99, 2.326348",
			"0.01, -2.326348", "0.001, -3.090232" })
	void matchesStandardNormalTable(double probability, double expected) {
		assertThat(NormalQuantile.of(probability)).isCloseTo(expected, within(1e-5));
	}

	@ParameterizedTest
	@ValueSource(doubles = { 0, 1, -0.1, 1.5, Double.NaN })
	void rejectsProbabilitiesOutsideOpenUnitInterval(double probability) {
		assertThatIllegalArgumentException().isThrownBy(() -> NormalQuantile.of(probability));
	}

}
