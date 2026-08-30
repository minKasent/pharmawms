package vn.edu.hcmunre.pharmawms.catalog.internal.application;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import vn.edu.hcmunre.pharmawms.catalog.StorageCondition;

public record ProductDetailView(long id, String sku, String name, String activeIngredient, String strength,
		String dosageForm, String registrationNumber, String manufacturer, String atcCode, long categoryId,
		String categoryName, StorageCondition storageCondition, boolean prescriptionRequired, String baseUnit,
		int minShelfLifeOnReceiptDays, BigDecimal referenceUnitCost, boolean active, List<Unit> units,
		Instant createdAt, Instant updatedAt, long version) {

	public record Unit(String unitName, int factorToBase, String gtin) {
	}

}
