package vn.edu.hcmunre.pharmawms.inventory.internal.issuing;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import vn.edu.hcmunre.pharmawms.inventory.internal.stock.StockCandidate;

/**
 * First-Expired-First-Out allocation for one product. Pure function: no I/O, no clock.
 */
public final class FefoAllocator {

	/**
	 * Earliest expiry first; ties broken by older manufacture date (unknown last), then by ids so
	 * the result is deterministic and matches the database lock order.
	 */
	public static final Comparator<StockCandidate> FEFO_ORDER = Comparator.comparing(StockCandidate::expiryDate)
		.thenComparing(StockCandidate::manufactureDate, Comparator.nullsLast(Comparator.naturalOrder()))
		.thenComparingLong(StockCandidate::batchId)
		.thenComparingLong(StockCandidate::locationId);

	private FefoAllocator() {
	}

	public static AllocationPlan allocate(long requestedQuantity, List<StockCandidate> candidates) {
		if (requestedQuantity <= 0) {
			throw new IllegalArgumentException("Requested quantity must be positive: " + requestedQuantity);
		}
		List<StockCandidate> ordered = candidates.stream()
			.filter(candidate -> candidate.available() > 0)
			.sorted(FEFO_ORDER)
			.toList();

		List<Allocation> allocations = new ArrayList<>();
		long remaining = requestedQuantity;
		for (StockCandidate candidate : ordered) {
			if (remaining == 0) {
				break;
			}
			long take = Math.min(remaining, candidate.available());
			allocations.add(new Allocation(candidate, take));
			remaining -= take;
		}
		return new AllocationPlan(requestedQuantity, List.copyOf(allocations), remaining);
	}

	public record Allocation(StockCandidate source, long quantity) {
	}

	/**
	 * @param shortage quantity that could not be allocated; zero when fully covered
	 */
	public record AllocationPlan(long requestedQuantity, List<Allocation> allocations, long shortage) {

		public boolean isFullyAllocated() {
			return shortage == 0;
		}

		public long allocatedQuantity() {
			return requestedQuantity - shortage;
		}

	}

}
