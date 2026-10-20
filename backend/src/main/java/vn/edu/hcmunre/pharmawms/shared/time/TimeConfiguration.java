package vn.edu.hcmunre.pharmawms.shared.time;

import java.time.Clock;
import java.time.ZoneId;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class TimeConfiguration {

	/**
	 * Business dates (expiry, demand days) are evaluated in the warehouse's local time zone.
	 */
	@Bean
	Clock clock(@Value("${pharmawms.time-zone}") String timeZone) {
		return Clock.system(ZoneId.of(timeZone));
	}

}
