package vn.edu.hcmunre.pharmawms.forecasting.internal.demand;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import vn.edu.hcmunre.pharmawms.inventory.DemandPoint;

/**
 * Dense daily demand per product over {@code [asOf - days + 1, asOf]}; missing days are zero.
 */
public final class DemandHistory {

	private final LocalDate asOf;
	private final int days;
	private final Map<Long, double[]> series;

	private DemandHistory(LocalDate asOf, int days, Map<Long, double[]> series) {
		this.asOf = asOf;
		this.days = days;
		this.series = series;
	}

	public static DemandHistory of(LocalDate asOf, int days, Collection<Long> productIds, List<DemandPoint> points) {
		Map<Long, double[]> series = new HashMap<>();
		productIds.forEach(id -> series.put(id, new double[days]));
		LocalDate start = asOf.minusDays(days - 1L);
		for (DemandPoint point : points) {
			double[] values = series.get(point.productId());
			long index = ChronoUnit.DAYS.between(start, point.day());
			if (values != null && index >= 0 && index < days) {
				values[(int) index] += point.quantity();
			}
		}
		return new DemandHistory(asOf, days, series);
	}

	public LocalDate asOf() {
		return asOf;
	}

	public LocalDate start() {
		return asOf.minusDays(days - 1L);
	}

	public Set<Long> productIds() {
		return series.keySet();
	}

	public double total(long productId, int lastDays) {
		double[] values = series.getOrDefault(productId, new double[0]);
		double sum = 0;
		for (int i = Math.max(0, values.length - lastDays); i < values.length; i++) {
			sum += values[i];
		}
		return sum;
	}

	/**
	 * Sample standard deviation of daily demand over the last {@code lastDays} days.
	 */
	public double dailyStd(long productId, int lastDays) {
		double[] values = series.getOrDefault(productId, new double[0]);
		int from = Math.max(0, values.length - lastDays);
		int count = values.length - from;
		if (count < 2) {
			return 0;
		}
		double mean = total(productId, lastDays) / count;
		double squares = 0;
		for (int i = from; i < values.length; i++) {
			squares += (values[i] - mean) * (values[i] - mean);
		}
		return Math.sqrt(squares / (count - 1));
	}

	public double[] daily(long productId, int lastDays) {
		double[] values = series.getOrDefault(productId, new double[0]);
		int from = Math.max(0, values.length - lastDays);
		double[] copy = new double[values.length - from];
		System.arraycopy(values, from, copy, 0, copy.length);
		return copy;
	}

	public record Observation(long productId, LocalDate day, double quantity) {
	}

	/**
	 * Non-zero days only; the AI service treats absent days as zero demand.
	 */
	public List<Observation> nonZeroObservations() {
		List<Observation> result = new ArrayList<>();
		LocalDate start = start();
		series.forEach((productId, values) -> {
			for (int i = 0; i < values.length; i++) {
				if (values[i] > 0) {
					result.add(new Observation(productId, start.plusDays(i), values[i]));
				}
			}
		});
		return result;
	}

}
