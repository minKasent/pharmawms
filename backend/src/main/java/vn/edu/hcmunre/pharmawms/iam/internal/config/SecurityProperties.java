package vn.edu.hcmunre.pharmawms.iam.internal.config;

import java.time.Duration;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("pharmawms.security")
public record SecurityProperties(@Valid @NotNull Jwt jwt, @Valid @NotNull LoginRateLimit loginRateLimit) {

	/**
	 * PEM keys are optional only for local development; without them an ephemeral key pair is
	 * generated, which invalidates all tokens on restart.
	 * <p>
	 * {@code refreshReuseGrace}: a rotated refresh token presented again within this window is
	 * treated as a concurrent refresh by the same client (parallel requests racing on token
	 * expiry), not as theft, so the token family is not revoked.
	 */
	public record Jwt(@NotBlank String issuer, @NotNull Duration accessTokenTtl, @NotNull Duration refreshTokenTtl,
			@NotNull Duration refreshReuseGrace, String privateKeyPem, String publicKeyPem) {

		public boolean hasConfiguredKeys() {
			return privateKeyPem != null && !privateKeyPem.isBlank() && publicKeyPem != null && !publicKeyPem.isBlank();
		}

	}

	public record LoginRateLimit(@Min(1) int maxFailedAttempts, @NotNull Duration window) {
	}

}
