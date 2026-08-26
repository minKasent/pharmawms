package vn.edu.hcmunre.pharmawms.iam.internal.application;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.edu.hcmunre.pharmawms.iam.internal.config.SecurityProperties;
import vn.edu.hcmunre.pharmawms.iam.internal.domain.AppUser;
import vn.edu.hcmunre.pharmawms.iam.internal.domain.RefreshToken;
import vn.edu.hcmunre.pharmawms.iam.internal.persistence.AppUserRepository;
import vn.edu.hcmunre.pharmawms.iam.internal.persistence.RefreshTokenRepository;
import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;

@Service
public class AuthService {

	private static final Logger log = LoggerFactory.getLogger(AuthService.class);
	private static final int MAX_BCRYPT_PASSWORD_BYTES = 72;

	private final AppUserRepository users;
	private final RefreshTokenRepository refreshTokens;
	private final PasswordEncoder passwordEncoder;
	private final TokenService tokenService;
	private final LoginRateLimiter rateLimiter;
	private final SecurityProperties.Jwt jwtProperties;
	private final Clock clock;
	private final String dummyPasswordHash;

	AuthService(AppUserRepository users, RefreshTokenRepository refreshTokens, PasswordEncoder passwordEncoder,
			TokenService tokenService, LoginRateLimiter rateLimiter, SecurityProperties securityProperties,
			Clock clock) {
		this.users = users;
		this.refreshTokens = refreshTokens;
		this.passwordEncoder = passwordEncoder;
		this.tokenService = tokenService;
		this.rateLimiter = rateLimiter;
		this.jwtProperties = securityProperties.jwt();
		this.clock = clock;
		this.dummyPasswordHash = passwordEncoder.encode(UUID.randomUUID().toString());
	}

	@Transactional
	public AuthTokens login(String username, String password) {
		rateLimiter.ensureAllowed(username);
		var user = users.findByUsernameIgnoreCase(username).orElse(null);
		// Always run the hash check so response time does not reveal whether the username exists.
		String hash = user != null ? user.getPasswordHash() : dummyPasswordHash;
		boolean tooLong = password.getBytes(StandardCharsets.UTF_8).length > MAX_BCRYPT_PASSWORD_BYTES;
		boolean passwordMatches = passwordEncoder.matches(tooLong ? "" : password, hash) && !tooLong;
		if (user == null || !passwordMatches || !user.isEnabled()) {
			rateLimiter.recordFailure(username);
			throw BusinessException.unauthorized("INVALID_CREDENTIALS", "Tên đăng nhập hoặc mật khẩu không đúng.");
		}
		rateLimiter.reset(username);
		return issueTokens(user, UUID.randomUUID(), clock.instant());
	}

	/**
	 * Rotates the refresh token. Presenting an already-rotated token means it was stolen or
	 * replayed, so the whole token family is revoked and the user must log in again.
	 */
	@Transactional(noRollbackFor = BusinessException.class)
	public AuthTokens refresh(String refreshTokenValue) {
		Instant now = clock.instant();
		var stored = refreshTokens.findByTokenHash(TokenService.hash(refreshTokenValue))
			.orElseThrow(AuthService::invalidRefreshToken);
		if (stored.wasRevokedWithin(jwtProperties.refreshReuseGrace(), now)) {
			log.info("Concurrent refresh with a just-rotated token for user {}", stored.getUserId());
			throw invalidRefreshToken();
		}
		if (stored.isRevoked()) {
			int revoked = refreshTokens.revokeFamily(stored.getFamilyId(), now);
			log.warn("Refresh token reuse detected for user {} (family {}, {} tokens revoked)", stored.getUserId(),
					stored.getFamilyId(), revoked);
			throw invalidRefreshToken();
		}
		if (stored.isExpired(now)) {
			throw invalidRefreshToken();
		}
		var user = users.findById(stored.getUserId())
			.filter(AppUser::isEnabled)
			.orElseThrow(AuthService::invalidRefreshToken);
		stored.revoke(now);
		return issueTokens(user, stored.getFamilyId(), now);
	}

	@Transactional
	public void logout(String refreshTokenValue) {
		refreshTokens.findByTokenHash(TokenService.hash(refreshTokenValue))
			.ifPresent(token -> refreshTokens.revokeFamily(token.getFamilyId(), clock.instant()));
	}

	private AuthTokens issueTokens(AppUser user, UUID familyId, Instant now) {
		var accessToken = tokenService.issueAccessToken(user, now);
		String refreshValue = tokenService.newRefreshTokenValue();
		Instant refreshExpiresAt = now.plus(jwtProperties.refreshTokenTtl());
		refreshTokens.save(new RefreshToken(user.getId(), TokenService.hash(refreshValue), familyId, now,
				refreshExpiresAt));
		return new AuthTokens(accessToken.value(), accessToken.expiresAt(), refreshValue, refreshExpiresAt,
				UserView.from(user));
	}

	private static BusinessException invalidRefreshToken() {
		return BusinessException.unauthorized("INVALID_REFRESH_TOKEN", "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
	}

}
