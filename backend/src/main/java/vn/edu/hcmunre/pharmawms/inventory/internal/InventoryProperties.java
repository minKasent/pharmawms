package vn.edu.hcmunre.pharmawms.inventory.internal;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("pharmawms.inventory")
public record InventoryProperties(@NotBlank String expiryJobCron,
		@Min(1) @Max(MAX_SHELF_LIFE_DAYS) int defaultMinRemainingShelfLifeDays) {

	public static final int MAX_SHELF_LIFE_DAYS = 3650;

}
