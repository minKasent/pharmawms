package vn.edu.hcmunre.pharmawms.catalog;

import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Map;

/**
 * Product facts other modules need. Quantities elsewhere are always expressed in {@link #baseUnit()}.
 */
public record ProductSummary(long id, String sku, String name, String activeIngredient, String strength,
		String dosageForm, String categoryName, String baseUnit, Map<String, Integer> unitFactors,
		StorageCondition storageCondition, int minShelfLifeOnReceiptDays, boolean prescriptionRequired,
		BigDecimal referenceUnitCost, boolean active) implements Serializable {

	public ProductSummary {
		unitFactors = Map.copyOf(unitFactors);
	}

	public String displayName() {
		return strength == null || strength.isBlank() ? name : name + " " + strength;
	}

}
