package vn.edu.hcmunre.pharmawms.iam.internal.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;

import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Component;

import vn.edu.hcmunre.pharmawms.iam.CurrentUser;
import vn.edu.hcmunre.pharmawms.iam.Permission;
import vn.edu.hcmunre.pharmawms.iam.internal.config.SecurityProperties;
import vn.edu.hcmunre.pharmawms.iam.internal.domain.AppUser;

@Component
class TokenService {

	private static final int REFRESH_TOKEN_BYTES = 32;

	private final JwtEncoder encoder;
	private final SecurityProperties.Jwt properties;
	private final SecureRandom random = new SecureRandom();

	TokenService(JwtEncoder encoder, SecurityProperties properties) {
		this.encoder = encoder;
		this.properties = properties.jwt();
	}

	IssuedAccessToken issueAccessToken(AppUser user, Instant now) {
		Instant expiresAt = now.plus(properties.accessTokenTtl());
		List<String> permissions = user.getRole().permissions().stream().map(Permission::name).sorted().toList();
		var claims = JwtClaimsSet.builder()
			.issuer(properties.issuer())
			.subject(user.getUsername())
			.issuedAt(now)
			.expiresAt(expiresAt)
			.claim(CurrentUser.USER_ID_CLAIM, user.getId())
			.claim("name", user.getFullName())
			.claim("role", user.getRole().name())
			.claim("perms", permissions)
			.build();
		var header = JwsHeader.with(SignatureAlgorithm.RS256).build();
		String token = encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
		return new IssuedAccessToken(token, expiresAt);
	}

	String newRefreshTokenValue() {
		byte[] bytes = new byte[REFRESH_TOKEN_BYTES];
		random.nextBytes(bytes);
		return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}

	static String hash(String refreshToken) {
		try {
			byte[] digest = MessageDigest.getInstance("SHA-256").digest(refreshToken.getBytes(StandardCharsets.UTF_8));
			return HexFormat.of().formatHex(digest);
		}
		catch (NoSuchAlgorithmException exception) {
			throw new IllegalStateException("SHA-256 not available", exception);
		}
	}

	record IssuedAccessToken(String value, Instant expiresAt) {
	}

}
