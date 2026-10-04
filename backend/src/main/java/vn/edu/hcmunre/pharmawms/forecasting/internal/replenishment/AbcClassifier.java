package vn.edu.hcmunre.pharmawms.forecasting.internal.replenishment;

import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Pareto (ABC) classification by consumption value: products making up the first 80% of value
 * are A, the next 15% B, the rest (and products without consumption) C.
 */
public final class AbcClassifier {

	static final double A_CUMULATIVE_SHARE = 0.80;
	static final double B_CUMULATIVE_SHARE = 0.95;

	private AbcClassifier() {
	}

	public record ConsumptionValue(long productId, double value) {
	}

	public static Map<Long, AbcClass> classify(List<ConsumptionValue> values) {
		double total = values.stream().mapToDouble(v -> Math.max(v.value(), 0)).sum();
		Map<Long, AbcClass> result = new HashMap<>();
		if (total <= 0) {
			values.forEach(v -> result.put(v.productId(), AbcClass.C));
			return result;
		}
		List<ConsumptionValue> ranked = values.stream()
			.sorted(Comparator.comparingDouble(ConsumptionValue::value)
				.reversed()
				.thenComparingLong(ConsumptionValue::productId))
			.toList();
		double cumulativeBefore = 0;
		for (ConsumptionValue value : ranked) {
			double share = cumulativeBefore / total;
			// A product belongs to the class in which its value starts, so the top seller is always A.
			AbcClass abc = value.value() <= 0 ? AbcClass.C
					: share < A_CUMULATIVE_SHARE ? AbcClass.A : share < B_CUMULATIVE_SHARE ? AbcClass.B : AbcClass.C;
			result.put(value.productId(), abc);
			cumulativeBefore += Math.max(value.value(), 0);
		}
		return result;
	}

}
