package vn.edu.hcmunre.pharmawms.iam.internal.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import vn.edu.hcmunre.pharmawms.iam.Role;
import vn.edu.hcmunre.pharmawms.iam.internal.config.SecurityProperties;
import vn.edu.hcmunre.pharmawms.iam.internal.domain.AppUser;
import vn.edu.hcmunre.pharmawms.iam.internal.persistence.AppUserRepository;
import vn.edu.hcmunre.pharmawms.iam.internal.persistence.RefreshTokenRepository;
import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UserAdminServiceTest {

	private static final Instant NOW = Instant.parse("2026-10-19T12:00:00Z");
	private static final Clock CLOCK = Clock.fixed(NOW, ZoneOffset.UTC);

	private AppUserRepository users;
	private RefreshTokenRepository refreshTokens;
	private PasswordEncoder passwordEncoder;
	private UserAdminService userAdminService;

	@BeforeEach
	void setUp() {
		users = mock(AppUserRepository.class);
		refreshTokens = mock(RefreshTokenRepository.class);
		passwordEncoder = new BCryptPasswordEncoder(4);
		userAdminService = new UserAdminService(users, refreshTokens, passwordEncoder, CLOCK);
	}

	@Test
	void resetPasswordRevokesAllUserRefreshTokens() {
		AppUser existing = new AppUser("keeper1", passwordEncoder.encode("oldpass123"), "Thủ kho 1", Role.STOREKEEPER,
				NOW);
		when(users.findById(5L)).thenReturn(Optional.of(existing));

		userAdminService.resetPassword(5L, "newpass456");

		assertThat(passwordEncoder.matches("newpass456", existing.getPasswordHash())).isTrue();
		verify(refreshTokens).revokeAllByUserId(5L, NOW);
	}

	@Test
	void disablingUserOrChangingRoleRevokesRefreshTokens() {
		AppUser existing = new AppUser("keeper1", passwordEncoder.encode("oldpass123"), "Thủ kho 1", Role.STOREKEEPER,
				NOW);
		org.springframework.test.util.ReflectionTestUtils.setField(existing, "id", 5L);
		when(users.findById(5L)).thenReturn(Optional.of(existing));

		userAdminService.update(5L, 1L, "Thủ kho 1", Role.PURCHASER, true);

		verify(refreshTokens).revokeAllByUserId(5L, NOW);
	}

	@Test
	void cannotDemoteOrDisableSelf() {
		AppUser admin = new AppUser("admin", passwordEncoder.encode("admin12345"), "Quản trị", Role.ADMIN, NOW);
		when(users.findById(1L)).thenReturn(Optional.of(admin));

		assertThatThrownBy(() -> userAdminService.update(1L, 1L, "Quản trị", Role.STOREKEEPER, true))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo("CANNOT_DEMOTE_SELF"));

		assertThatThrownBy(() -> userAdminService.update(1L, 1L, "Quản trị", Role.ADMIN, false))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo("CANNOT_DEMOTE_SELF"));

		verify(refreshTokens, never()).revokeAllByUserId(eq(1L), any());
	}

	@Test
	void rejectsPasswordExceeding72Utf8Bytes() {
		// 25 Vietnamese multi-byte characters > 72 bytes in UTF-8 even though length() < 72
		String multiBytePassword = "ậ".repeat(25);
		assertThat(multiBytePassword.length()).isLessThan(72);

		assertThatThrownBy(() -> userAdminService.create("user1", multiBytePassword, "Người dùng", Role.STOREKEEPER))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo("PASSWORD_TOO_LONG"));

		assertThatThrownBy(() -> userAdminService.resetPassword(1L, multiBytePassword))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo("PASSWORD_TOO_LONG"));
	}

	@Test
	void authServiceTreatsOver72BytePasswordAsInvalidCredentialsInsteadOf500() {
		TokenService tokenService = mock(TokenService.class);
		LoginRateLimiter rateLimiter = mock(LoginRateLimiter.class);
		SecurityProperties props = new SecurityProperties(
				new SecurityProperties.Jwt("pharmawms", Duration.ofMinutes(15), Duration.ofDays(7),
						Duration.ofSeconds(10), null, null),
				new SecurityProperties.LoginRateLimit(5, Duration.ofMinutes(15)));
		AuthService authService = new AuthService(users, refreshTokens, passwordEncoder, tokenService, rateLimiter,
				props, CLOCK);

		AppUser existing = new AppUser("admin", passwordEncoder.encode("validPass123"), "Admin", Role.ADMIN, NOW);
		when(users.findByUsernameIgnoreCase("admin")).thenReturn(Optional.of(existing));

		String over72Bytes = "a".repeat(80);
		assertThatThrownBy(() -> authService.login("admin", over72Bytes))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo("INVALID_CREDENTIALS"));
		verify(rateLimiter).recordFailure("admin");
	}

	@Test
	@SuppressWarnings("unchecked")
	void loginRateLimiterRestoresMissingTtlOnSubsequentFailures() {
		StringRedisTemplate redis = mock(StringRedisTemplate.class);
		ValueOperations<String, String> valueOps = mock(ValueOperations.class);
		when(redis.opsForValue()).thenReturn(valueOps);
		Duration window = Duration.ofMinutes(15);
		SecurityProperties props = new SecurityProperties(
				new SecurityProperties.Jwt("pharmawms", Duration.ofMinutes(15), Duration.ofDays(7),
						Duration.ofSeconds(10), null, null),
				new SecurityProperties.LoginRateLimit(5, window));
		LoginRateLimiter limiter = new LoginRateLimiter(redis, props);

		String key = "pharmawms:login-failures:admin";
		when(valueOps.increment(key)).thenReturn(2L);
		when(redis.getExpire(key)).thenReturn(-1L);

		limiter.recordFailure("Admin");

		verify(redis).expire(key, window);
	}

}
