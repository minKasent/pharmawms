package vn.edu.hcmunre.pharmawms.forecasting.internal.ai;

import java.net.URI;
import java.time.Duration;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("pharmawms.ai")
public record AiServiceProperties(@NotNull URI baseUrl, @NotBlank @Size(min = MIN_API_KEY_LENGTH) String apiKey,
		@NotNull Duration connectTimeout, @NotNull Duration readTimeout) {

	static final int MIN_API_KEY_LENGTH = 8;

	@Override
	public String toString() {
		return "AiServiceProperties[baseUrl=%s, connectTimeout=%s, readTimeout=%s]".formatted(baseUrl, connectTimeout,
				readTimeout);
	}

}
