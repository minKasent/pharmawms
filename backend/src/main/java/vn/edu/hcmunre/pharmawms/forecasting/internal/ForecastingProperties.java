package vn.edu.hcmunre.pharmawms.forecasting.internal;

import java.time.Duration;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * @param historyDays demand history sent to the model; features need at least one year plus the horizon
 * @param retrainAfter the model is retrained when older than this
 * @param defaultLeadTimeDays used for products without any supplier terms
 */
@Validated
@ConfigurationProperties("pharmawms.forecasting")
public record ForecastingProperties(boolean enabled, @NotBlank String cron, @Min(1) @Max(MAX_HORIZON_DAYS) int horizonDays,
		@Min(1) @Max(MAX_REVIEW_PERIOD_DAYS) int reviewPeriodDays, @Min(MIN_HISTORY_DAYS) @Max(MAX_HISTORY_DAYS) int historyDays,
		@NotNull Duration retrainAfter, @NotNull Duration trainingTimeout,
		@Min(1) @Max(MAX_LEAD_TIME_DAYS) int defaultLeadTimeDays, @Valid @NotNull ServiceLevels serviceLevels) {

	public static final int MAX_HORIZON_DAYS = 91;
	public static final int MAX_REVIEW_PERIOD_DAYS = 90;
	public static final int MAX_LEAD_TIME_DAYS = 365;
	public static final int MIN_HISTORY_DAYS = 120;
	public static final int MAX_HISTORY_DAYS = 1500;

	/**
	 * Target cycle service level (probability of no stock-out per replenishment cycle) by ABC class.
	 */
	public record ServiceLevels(@DecimalMin("0.5") @DecimalMax("0.999") double a,
			@DecimalMin("0.5") @DecimalMax("0.999") double b, @DecimalMin("0.5") @DecimalMax("0.999") double c) {
	}

}
