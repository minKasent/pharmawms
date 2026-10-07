package vn.edu.hcmunre.pharmawms.forecasting.internal.replenishment;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import vn.edu.hcmunre.pharmawms.forecasting.internal.replenishment.AbcClassifier.ConsumptionValue;

import static org.assertj.core.api.Assertions.assertThat;

class AbcClassifierTest {

	@Test
	void classifiesByCumulativeShareOfValue() {
		Map<Long, AbcClass> classes = AbcClassifier.classify(List.of(new ConsumptionValue(1, 700),
				new ConsumptionValue(2, 150), new ConsumptionValue(3, 100), new ConsumptionValue(4, 40),
				new ConsumptionValue(5, 10)));

		// cumulative before: 0% A, 70% A, 85% B, 95% C, 99% C
		assertThat(classes).containsExactlyInAnyOrderEntriesOf(
				Map.of(1L, AbcClass.A, 2L, AbcClass.A, 3L, AbcClass.B, 4L, AbcClass.C, 5L, AbcClass.C));
	}

	@Test
	void dominantProductIsAlwaysA() {
		Map<Long, AbcClass> classes = AbcClassifier.classify(
				List.of(new ConsumptionValue(1, 990), new ConsumptionValue(2, 10)));

		assertThat(classes.get(1L)).isEqualTo(AbcClass.A);
		assertThat(classes.get(2L)).isEqualTo(AbcClass.C);
	}

	@Test
	void productsWithoutConsumptionAreC() {
		Map<Long, AbcClass> classes = AbcClassifier.classify(
				List.of(new ConsumptionValue(1, 0), new ConsumptionValue(2, 0)));

		assertThat(classes.values()).containsOnly(AbcClass.C);
	}

}
