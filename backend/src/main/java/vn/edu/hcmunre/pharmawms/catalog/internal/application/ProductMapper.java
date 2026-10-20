package vn.edu.hcmunre.pharmawms.catalog.internal.application;

import java.util.LinkedHashMap;
import java.util.Map;

import vn.edu.hcmunre.pharmawms.catalog.ProductSummary;
import vn.edu.hcmunre.pharmawms.catalog.internal.domain.Product;
import vn.edu.hcmunre.pharmawms.catalog.internal.domain.ProductUnit;

public final class ProductMapper {

	private ProductMapper() {
	}

	public static ProductSummary toSummary(Product product) {
		Map<String, Integer> factors = new LinkedHashMap<>();
		product.getUnits().forEach(unit -> factors.put(unit.getUnitName(), unit.getFactorToBase()));
		factors.putIfAbsent(product.getBaseUnit(), 1);
		return new ProductSummary(product.getId(), product.getSku(), product.getName(), product.getActiveIngredient(),
				product.getStrength(), product.getDosageForm(), product.getCategory().getName(), product.getBaseUnit(),
				factors, product.getStorageCondition(), product.getMinShelfLifeOnReceiptDays(),
				product.isPrescriptionRequired(), product.getReferenceUnitCost(), product.isActive());
	}

	public static ProductListItem toListItem(Product product) {
		return new ProductListItem(product.getId(), product.getSku(), product.getName(), product.getActiveIngredient(),
				product.getStrength(), product.getDosageForm(), product.getCategory().getId(),
				product.getCategory().getName(), product.getStorageCondition(), product.getBaseUnit(),
				product.isPrescriptionRequired(), product.isActive());
	}

	public static ProductDetailView toDetail(Product product) {
		var units = product.getUnits()
			.stream()
			.map(ProductMapper::toUnitView)
			.toList();
		return new ProductDetailView(product.getId(), product.getSku(), product.getName(),
				product.getActiveIngredient(), product.getStrength(), product.getDosageForm(),
				product.getRegistrationNumber(), product.getManufacturer(), product.getAtcCode(),
				product.getCategory().getId(), product.getCategory().getName(), product.getStorageCondition(),
				product.isPrescriptionRequired(), product.getBaseUnit(), product.getMinShelfLifeOnReceiptDays(),
				product.getReferenceUnitCost(), product.isActive(), units, product.getCreatedAt(),
				product.getUpdatedAt(), product.getVersion());
	}

	private static ProductDetailView.Unit toUnitView(ProductUnit unit) {
		return new ProductDetailView.Unit(unit.getUnitName(), unit.getFactorToBase(), unit.getGtin());
	}

}
