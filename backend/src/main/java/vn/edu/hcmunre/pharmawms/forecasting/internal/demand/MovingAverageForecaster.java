package vn.edu.hcmunre.pharmawms.forecasting.internal.demand;

/**
 * Statistical fallback used when the AI service is unavailable or has no model: the daily rate
 * is the mean of the 28- and 91-day averages (the same level the AI model corrects), and the
 * error is the day-to-day standard deviation over 91 days.
 */
public final class MovingAverageForecaster {

	static final int SHORT_WINDOW_DAYS = 28;
	static final int LONG_WINDOW_DAYS = 91;

	private MovingAverageForecaster() {
	}

	public record Forecast(long productId, double quantity, double dailyErrorStd) {
	}

	public static Forecast forecast(DemandHistory history, long productId, int horizonDays) {
		double shortRate = history.total(productId, SHORT_WINDOW_DAYS) / SHORT_WINDOW_DAYS;
		double longRate = history.total(productId, LONG_WINDOW_DAYS) / LONG_WINDOW_DAYS;
		double dailyRate = (shortRate + longRate) / 2;
		return new Forecast(productId, dailyRate * horizonDays, history.dailyStd(productId, LONG_WINDOW_DAYS));
	}

}
