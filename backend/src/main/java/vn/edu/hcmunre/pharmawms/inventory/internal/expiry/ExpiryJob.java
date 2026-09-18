package vn.edu.hcmunre.pharmawms.inventory.internal.expiry;

import java.time.Clock;
import java.time.LocalDate;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Marks batches whose expiry date has been reached as EXPIRED. Issuing never relies on this job
 * (it filters by expiry date itself); the status exists for reporting and disposal. The update
 * is idempotent, so running it on several instances or twice a day is harmless.
 */
@Component
class ExpiryJob {

	private static final Logger log = LoggerFactory.getLogger(ExpiryJob.class);

	private final JdbcClient jdbc;
	private final Clock clock;

	ExpiryJob(JdbcClient jdbc, Clock clock) {
		this.jdbc = jdbc;
		this.clock = clock;
	}

	@EventListener(ApplicationReadyEvent.class)
	@Transactional
	public void onStartup() {
		markExpiredBatches();
	}

	@Scheduled(cron = "${pharmawms.inventory.expiry-job-cron}", zone = "${pharmawms.time-zone}")
	@Transactional
	public void markExpiredBatches() {
		int expired = jdbc.sql("""
				UPDATE inventory.batch SET status = 'EXPIRED', version = version + 1
				WHERE status IN ('AVAILABLE', 'ON_HOLD', 'QUARANTINE') AND expiry_date <= :today
				""")
			.param("today", LocalDate.now(clock))
			.update();
		if (expired > 0) {
			log.info("Marked {} batches as EXPIRED", expired);
		}
	}

}
