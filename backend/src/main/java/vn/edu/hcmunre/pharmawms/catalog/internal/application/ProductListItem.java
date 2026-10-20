package vn.edu.hcmunre.pharmawms.catalog.internal.application;

import vn.edu.hcmunre.pharmawms.catalog.StorageCondition;

public record ProductListItem(long id, String sku, String name, String activeIngredient, String strength,
		String dosageForm, long categoryId, String categoryName, StorageCondition storageCondition, String baseUnit,
		boolean prescriptionRequired, boolean active) {
}
