package vn.edu.hcmunre.pharmawms.iam.internal.application;

import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import vn.edu.hcmunre.pharmawms.iam.internal.config.SecurityProperties;
import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;

/**
 * Counts failed logins per username in Redis. Fails open when Redis is unavailable: login
 * keeps working, only brute-force protection is temporarily lost.
 */
@Component
class LoginRateLimiter {

	private static final Logger log = LoggerFactory.getLogger(LoginRateLimiter.class);
	private static final String KEY_PREFIX = "pharmawms:login-failures:";

	private final StringRedisTemplate redis;
	private final SecurityProperties.LoginRateLimit limits;

	LoginRateLimiter(StringRedisTemplate redis, SecurityProperties properties) {
		this.redis = redis;
		this.limits = properties.loginRateLimit();
	}

	void ensureAllowed(String username) {
		try {
			String value = redis.opsForValue().get(key(username));
			if (value != null && Long.parseLong(value) >= limits.maxFailedAttempts()) {
				throw BusinessException.tooManyRequests("LOGIN_TEMPORARILY_LOCKED",
						"Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau %d phút."
							.formatted(limits.window().toMinutes()));
			}
		}
		catch (DataAccessException exception) {
			log.warn("Login rate limiter unavailable: {}", exception.getMessage());
		}
	}

	void recordFailure(String username) {
		try {
			String key = key(username);
			Long count = redis.opsForValue().increment(key);
			if (count != null && count == 1L) {
				redis.expire(key, limits.window());
			}
			else if (count != null && count > 1L) {
				Long ttl = redis.getExpire(key);
				if (ttl != null && ttl < 0) {
					redis.expire(key, limits.window());
				}
			}
		}
		catch (DataAccessException exception) {
			log.warn("Login rate limiter unavailable: {}", exception.getMessage());
		}
	}

	void reset(String username) {
		try {
			redis.delete(key(username));
		}
		catch (DataAccessException exception) {
			log.warn("Login rate limiter unavailable: {}", exception.getMessage());
		}
	}

	private static String key(String username) {
		return KEY_PREFIX + username.toLowerCase(Locale.ROOT);
	}

}
