package vn.edu.hcmunre.pharmawms.iam.internal.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;

class RefreshTokenTest {

	private static final Instant ISSUED_AT = Instant.parse("2026-01-01T00:00:00Z");
	private static final Duration TTL = Duration.ofDays(7);
	private static final Duration GRACE = Duration.ofSeconds(10);

	private final RefreshToken token = new RefreshToken(1, "hash", UUID.randomUUID(), ISSUED_AT, ISSUED_AT.plus(TTL));

	@Test
	void activeTokenIsNotInGraceWindow() {
		assertThat(token.isRevoked()).isFalse();
		assertThat(token.wasRevokedWithin(GRACE, ISSUED_AT)).isFalse();
	}

	@Test
	void presentingRightAfterRotationIsAConcurrentRefresh() {
		Instant rotatedAt = ISSUED_AT.plusSeconds(60);
		token.revoke(rotatedAt);

		assertThat(token.wasRevokedWithin(GRACE, rotatedAt.plus(GRACE))).isTrue();
	}

	@Test
	void presentingAfterGraceWindowIsReuse() {
		Instant rotatedAt = ISSUED_AT.plusSeconds(60);
		token.revoke(rotatedAt);

		assertThat(token.wasRevokedWithin(GRACE, rotatedAt.plus(GRACE).plusMillis(1))).isFalse();
		assertThat(token.isRevoked()).isTrue();
	}

	@Test
	void secondRevocationKeepsOriginalTimestamp() {
		Instant rotatedAt = ISSUED_AT.plusSeconds(60);
		token.revoke(rotatedAt);
		token.revoke(rotatedAt.plus(Duration.ofHours(1)));

		assertThat(token.wasRevokedWithin(GRACE, rotatedAt.plusSeconds(1))).isTrue();
	}

}
