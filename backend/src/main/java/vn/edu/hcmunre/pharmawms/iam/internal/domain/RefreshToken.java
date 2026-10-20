package vn.edu.hcmunre.pharmawms.iam.internal.domain;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(schema = "iam", name = "refresh_token")
public class RefreshToken {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "user_id", nullable = false)
	private long userId;

	@Column(name = "token_hash", nullable = false, unique = true)
	private String tokenHash;

	@Column(name = "family_id", nullable = false)
	private UUID familyId;

	@Column(name = "expires_at", nullable = false)
	private Instant expiresAt;

	@Column(name = "revoked_at")
	private Instant revokedAt;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	protected RefreshToken() {
	}

	public RefreshToken(long userId, String tokenHash, UUID familyId, Instant createdAt, Instant expiresAt) {
		this.userId = userId;
		this.tokenHash = tokenHash;
		this.familyId = familyId;
		this.createdAt = createdAt;
		this.expiresAt = expiresAt;
	}

	public boolean isRevoked() {
		return revokedAt != null;
	}

	public boolean wasRevokedWithin(Duration window, Instant now) {
		return revokedAt != null && !revokedAt.plus(window).isBefore(now);
	}

	public boolean isExpired(Instant now) {
		return !now.isBefore(expiresAt);
	}

	public void revoke(Instant now) {
		if (revokedAt == null) {
			revokedAt = now;
		}
	}

	public long getUserId() {
		return userId;
	}

	public UUID getFamilyId() {
		return familyId;
	}

	public Instant getExpiresAt() {
		return expiresAt;
	}

}
