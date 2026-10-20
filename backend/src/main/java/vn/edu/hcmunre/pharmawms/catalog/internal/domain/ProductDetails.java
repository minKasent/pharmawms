package vn.edu.hcmunre.pharmawms.catalog.internal.domain;

import java.math.BigDecimal;

import vn.edu.hcmunre.pharmawms.catalog.StorageCondition;

public record ProductDetails(String name, String activeIngredient, String strength, String dosageForm,
		String registrationNumber, String manufacturer, String atcCode, StorageCondition storageCondition,
		boolean prescriptionRequired, String baseUnit, int minShelfLifeOnReceiptDays, BigDecimal referenceUnitCost) {
}
