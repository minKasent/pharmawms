package vn.edu.hcmunre.pharmawms.forecasting.internal.run;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;

@Component
@ConditionalOnBooleanProperty("pharmawms.forecasting.enabled")
class ForecastRunJob {

	private static final Logger log = LoggerFactory.getLogger(ForecastRunJob.class);

	private final ForecastRunService runs;

	ForecastRunJob(ForecastRunService runs) {
		this.runs = runs;
	}

	@Scheduled(cron = "${pharmawms.forecasting.cron}", zone = "${pharmawms.time-zone}")
	void nightly() {
		try {
			runs.runScheduled();
		}
		catch (BusinessException exception) {
			log.info("Skipping scheduled forecast: {}", exception.getMessage());
		}
	}

}
