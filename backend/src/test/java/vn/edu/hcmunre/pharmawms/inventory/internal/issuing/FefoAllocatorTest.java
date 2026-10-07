package vn.edu.hcmunre.pharmawms.inventory.internal.issuing;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

import vn.edu.hcmunre.pharmawms.inventory.internal.issuing.FefoAllocator.Allocation;
import vn.edu.hcmunre.pharmawms.inventory.internal.issuing.FefoAllocator.AllocationPlan;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.StockCandidate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class FefoAllocatorTest {

	private static final long PRODUCT = 1;
	private static final LocalDate JAN = LocalDate.of(2027, 1, 31);
	private static final LocalDate MAR = LocalDate.of(2027, 3, 31);
	private static final LocalDate JUN = LocalDate.of(2027, 6, 30);

	private static StockCandidate stock(long batchId, long locationId, LocalDate expiry, LocalDate manufactured,
			long available) {
		return new StockCandidate(batchId, locationId, PRODUCT, "LOT-" + batchId, expiry, manufactured,
				"LOC-" + locationId, available);
	}

	private static StockCandidate stock(long batchId, LocalDate expiry, long available) {
		return stock(batchId, 1, expiry, null, available);
	}

	private static List<Long> batchOrder(AllocationPlan plan) {
		return plan.allocations().stream().map(a -> a.source().batchId()).toList();
	}

	@Test
	void takesEarliestExpiryFirstRegardlessOfInputOrder() {
		AllocationPlan plan = FefoAllocator.allocate(10, List.of(stock(3, JUN, 50), stock(1, JAN, 50), stock(2, MAR, 50)));

		assertThat(batchOrder(plan)).containsExactly(1L);
		assertThat(plan.allocations().getFirst().quantity()).isEqualTo(10);
	}

	@Test
	void spillsOverToNextExpiryWhenFirstBatchIsNotEnough() {
		AllocationPlan plan = FefoAllocator.allocate(70, List.of(stock(2, MAR, 50), stock(1, JAN, 30)));

		assertThat(plan.allocations()).extracting(Allocation::quantity).containsExactly(30L, 40L);
		assertThat(batchOrder(plan)).containsExactly(1L, 2L);
		assertThat(plan.isFullyAllocated()).isTrue();
	}

	@Test
	void exactQuantityConsumesBatchCompletelyAndStops() {
		AllocationPlan plan = FefoAllocator.allocate(30, List.of(stock(1, JAN, 30), stock(2, MAR, 50)));

		assertThat(batchOrder(plan)).containsExactly(1L);
		assertThat(plan.shortage()).isZero();
	}

	@Test
	void reportsShortageWhenStockIsInsufficient() {
		AllocationPlan plan = FefoAllocator.allocate(100, List.of(stock(1, JAN, 30), stock(2, MAR, 20)));

		assertThat(plan.isFullyAllocated()).isFalse();
		assertThat(plan.shortage()).isEqualTo(50);
		assertThat(plan.allocatedQuantity()).isEqualTo(50);
	}

	@Test
	void noCandidatesMeansFullShortage() {
		AllocationPlan plan = FefoAllocator.allocate(5, List.of());

		assertThat(plan.allocations()).isEmpty();
		assertThat(plan.shortage()).isEqualTo(5);
	}

	@Test
	void ignoresEmptyBalances() {
		AllocationPlan plan = FefoAllocator.allocate(5, List.of(stock(1, JAN, 0), stock(2, MAR, 10)));

		assertThat(batchOrder(plan)).containsExactly(2L);
	}

	@Test
	void sameExpiryPrefersOlderManufactureDate() {
		StockCandidate newer = stock(1, 1, MAR, LocalDate.of(2025, 6, 1), 10);
		StockCandidate older = stock(2, 1, MAR, LocalDate.of(2025, 1, 1), 10);

		assertThat(batchOrder(FefoAllocator.allocate(5, List.of(newer, older)))).containsExactly(2L);
	}

	@Test
	void unknownManufactureDateGoesLastAmongSameExpiry() {
		StockCandidate unknown = stock(1, 1, MAR, null, 10);
		StockCandidate known = stock(2, 1, MAR, LocalDate.of(2025, 1, 1), 10);

		assertThat(batchOrder(FefoAllocator.allocate(15, List.of(unknown, known)))).containsExactly(2L, 1L);
	}

	@Test
	void fullTieIsBrokenByBatchThenLocationForDeterministicLocking() {
		StockCandidate batch2Loc1 = stock(2, 1, MAR, null, 5);
		StockCandidate batch1Loc9 = stock(1, 9, MAR, null, 5);
		StockCandidate batch1Loc3 = stock(1, 3, MAR, null, 5);

		AllocationPlan plan = FefoAllocator.allocate(15, List.of(batch2Loc1, batch1Loc9, batch1Loc3));

		assertThat(plan.allocations()).extracting(a -> a.source().batchId() + "@" + a.source().locationId())
			.containsExactly("1@3", "1@9", "2@1");
	}

	@Test
	void sameBatchInSeveralLocationsIsDrainedBeforeLaterExpiry() {
		AllocationPlan plan = FefoAllocator.allocate(12,
				List.of(stock(2, 1, JUN, null, 100), stock(1, 1, JAN, null, 5), stock(1, 2, JAN, null, 5)));

		assertThat(plan.allocations()).extracting(Allocation::quantity).containsExactly(5L, 5L, 2L);
		assertThat(batchOrder(plan)).containsExactly(1L, 1L, 2L);
	}

	@Test
	void rejectsNonPositiveQuantity() {
		assertThatIllegalArgumentException().isThrownBy(() -> FefoAllocator.allocate(0, List.of(stock(1, JAN, 5))));
		assertThatIllegalArgumentException().isThrownBy(() -> FefoAllocator.allocate(-1, List.of(stock(1, JAN, 5))));
	}

	@Test
	void allocationNeverExceedsAvailableOrRequested() {
		List<StockCandidate> candidates = List.of(stock(1, JAN, 7), stock(2, MAR, 11), stock(3, JUN, 13));
		for (long requested = 1; requested <= 40; requested++) {
			AllocationPlan plan = FefoAllocator.allocate(requested, candidates);

			assertThat(plan.allocations()).allSatisfy(a -> assertThat(a.quantity()).isBetween(1L, a.source().available()));
			assertThat(plan.allocatedQuantity()).isEqualTo(Math.min(requested, 31));
			assertThat(plan.allocations().stream().mapToLong(Allocation::quantity).sum()).isEqualTo(plan.allocatedQuantity());
		}
	}

	@Test
	void returnedPlanIsImmutable() {
		AllocationPlan plan = FefoAllocator.allocate(5, List.of(stock(1, JAN, 10)));

		assertThat(plan.allocations()).isUnmodifiable();
	}

}
