package vn.edu.hcmunre.pharmawms.iam.internal.application;

import java.time.Instant;

public record AuthTokens(String accessToken, Instant accessTokenExpiresAt, String refreshToken,
		Instant refreshTokenExpiresAt, UserView user) {
}
