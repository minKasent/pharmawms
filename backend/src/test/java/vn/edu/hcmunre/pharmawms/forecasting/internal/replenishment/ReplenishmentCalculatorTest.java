package vn.edu.hcmunre.pharmawms.forecasting.internal.replenishment;

import org.junit.jupiter.api.Test;

import vn.edu.hcmunre.pharmawms.forecasting.internal.replenishment.ReplenishmentCalculator.Input;
import vn.edu.hcmunre.pharmawms.forecasting.internal.replenishment.ReplenishmentCalculator.Plan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.within;

class ReplenishmentCalculatorTest {

	private static final double SERVICE_95 = 0.95;
	private static final Integer NO_SHELF_LIFE_LIMIT = null;

	private static Input input(double dailyDemand, double dailyStd, double leadTime, double leadTimeStd,
			long usable, long onOrder, long pack, long moq, Integer issuableDays) {
		return new Input(dailyDemand, dailyStd, leadTime, leadTimeStd, 7, SERVICE_95, usable, onOrder, pack, moq,
				issuableDays);
	}

	@Test
	void safetyStockCombinesDemandAndLeadTimeUncertainty() {
		// P = 7 + 7 = 14; sigma = sqrt(14 * 5^2 + 20^2 * 2^2) = sqrt(350 + 1600) = 44.16; z(0.95) = 1.6449
		Plan plan = ReplenishmentCalculator.plan(input(20, 5, 7, 2, 0, 0, 1, 0, NO_SHELF_LIFE_LIMIT));

		assertThat(plan.safetyFactor()).isCloseTo(1.6449, within(1e-4));
		assertThat(plan.safetyStock()).isCloseTo((long) Math.ceil(1.6448536 * Math.sqrt(1950)), within(0L));
		assertThat(plan.reorderPoint()).isEqualTo(20 * 14 + plan.safetyStock());
		assertThat(plan.orderUpToLevel()).isEqualTo(plan.reorderPoint() + 20 * 7);
	}

	@Test
	void ordersUpToSWhenPositionIsAtOrBelowReorderPoint() {
		Plan plan = ReplenishmentCalculator.plan(input(10, 0, 7, 0, 50, 30, 1, 0, NO_SHELF_LIFE_LIMIT));

		// s = 10 * 14 = 140, S = 140 + 70 = 210, IP = 80 -> Q = 130
		assertThat(plan.inventoryPosition()).isEqualTo(80);
		assertThat(plan.suggestedQuantity()).isEqualTo(130);
		assertThat(plan.daysOfCover()).isEqualTo(5.0);
	}

	@Test
	void noOrderWhenPositionIsAboveReorderPoint() {
		Plan plan = ReplenishmentCalculator.plan(input(10, 0, 7, 0, 100, 41, 1, 0, NO_SHELF_LIFE_LIMIT));

		assertThat(plan.suggestedQuantity()).isZero();
	}

	@Test
	void onOrderQuantityPreventsDoubleOrdering() {
		Plan withoutPending = ReplenishmentCalculator.plan(input(10, 0, 7, 0, 0, 0, 1, 0, NO_SHELF_LIFE_LIMIT));
		Plan withPending = ReplenishmentCalculator.plan(input(10, 0, 7, 0, 0, withoutPending.suggestedQuantity(), 1, 0,
				NO_SHELF_LIFE_LIMIT));

		assertThat(withPending.suggestedQuantity()).isZero();
	}

	@Test
	void roundsUpToPackSize() {
		Plan plan = ReplenishmentCalculator.plan(input(10, 0, 7, 0, 0, 0, 100, 0, NO_SHELF_LIFE_LIMIT));

		// S - IP = 210 -> 300 boxes of 100
		assertThat(plan.suggestedQuantity()).isEqualTo(300);
	}

	@Test
	void respectsMinimumOrderQuantity() {
		Plan plan = ReplenishmentCalculator.plan(input(1, 0, 7, 0, 0, 0, 10, 500, NO_SHELF_LIFE_LIMIT));

		assertThat(plan.suggestedQuantity()).isEqualTo(500);
	}

	@Test
	void capsQuantityThatCouldNotBeSoldWithinGuaranteedShelfLife() {
		// Slow mover: 2/day, S - IP = 42 -> 50 in packs of 10, but only 2 * 20 = 40 sells in time.
		Plan plan = ReplenishmentCalculator.plan(input(2, 0, 7, 0, 0, 0, 10, 0, 20));

		assertThat(plan.cappedByShelfLife()).isTrue();
		assertThat(plan.suggestedQuantity()).isEqualTo(40);
	}

	@Test
	void zeroGuaranteedIssuableDaysCapsAtZeroOrMoq() {
		Plan withoutMoq = ReplenishmentCalculator.plan(input(10, 0, 7, 0, 0, 0, 10, 0, 0));
		assertThat(withoutMoq.cappedByShelfLife()).isTrue();
		assertThat(withoutMoq.suggestedQuantity()).isZero();

		Plan withMoq = ReplenishmentCalculator.plan(input(10, 0, 7, 0, 0, 0, 10, 50, 0));
		assertThat(withMoq.cappedByShelfLife()).isTrue();
		assertThat(withMoq.suggestedQuantity()).isEqualTo(50);
	}

	@Test
	void shelfLifeCapKeepsMinimumOrderAndFlagsIt() {
		Plan plan = ReplenishmentCalculator.plan(input(1, 0, 7, 0, 0, 0, 10, 200, 30));

		assertThat(plan.suggestedQuantity()).isEqualTo(200);
		assertThat(plan.cappedByShelfLife()).isTrue();
	}

	@Test
	void shelfLifeCapIsNotAppliedWhenNotBinding() {
		Plan plan = ReplenishmentCalculator.plan(input(10, 0, 7, 0, 0, 0, 1, 0, 365));

		assertThat(plan.cappedByShelfLife()).isFalse();
		assertThat(plan.suggestedQuantity()).isEqualTo(210);
	}

	@Test
	void zeroDemandNeverOrders() {
		Plan plan = ReplenishmentCalculator.plan(input(0, 0, 7, 2, 0, 0, 1, 50, NO_SHELF_LIFE_LIMIT));

		assertThat(plan.suggestedQuantity()).isZero();
		assertThat(plan.daysOfCover()).isNull();
	}

	@Test
	void higherServiceLevelNeedsMoreSafetyStock() {
		Input base = input(20, 5, 7, 2, 0, 0, 1, 0, NO_SHELF_LIFE_LIMIT);
		Plan b = ReplenishmentCalculator.plan(base);
		Plan a = ReplenishmentCalculator.plan(new Input(20, 5, 7, 2, 7, 0.98, 0, 0, 1, 0, NO_SHELF_LIFE_LIMIT));

		assertThat(a.safetyStock()).isGreaterThan(b.safetyStock());
	}

	@Test
	void rejectsInvalidInput() {
		assertThatIllegalArgumentException().isThrownBy(() -> input(-1, 0, 7, 0, 0, 0, 1, 0, null));
		assertThatIllegalArgumentException().isThrownBy(() -> input(1, 0, 7, 0, 0, 0, 0, 0, null));
		assertThatIllegalArgumentException().isThrownBy(() -> input(1, 0, 7, 0, 0, 0, 1, 0, -1));
	}

	@Test
	void roundUpThrowsArithmeticExceptionOnOverflow() {
		org.assertj.core.api.Assertions.assertThatExceptionOfType(ArithmeticException.class)
			.isThrownBy(() -> ReplenishmentCalculator.roundUp(Long.MAX_VALUE - 5, 100));
	}

}
