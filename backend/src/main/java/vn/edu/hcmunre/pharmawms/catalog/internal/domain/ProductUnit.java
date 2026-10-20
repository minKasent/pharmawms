package vn.edu.hcmunre.pharmawms.catalog.internal.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(schema = "catalog", name = "product_unit")
public class ProductUnit {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "unit_name", nullable = false)
	private String unitName;

	@Column(name = "factor_to_base", nullable = false)
	private int factorToBase;

	private String gtin;

	protected ProductUnit() {
	}

	public ProductUnit(String unitName, int factorToBase, String gtin) {
		this.unitName = unitName;
		this.factorToBase = factorToBase;
		this.gtin = gtin;
	}

	void redefine(int factorToBase, String gtin) {
		this.factorToBase = factorToBase;
		this.gtin = gtin;
	}

	public String getUnitName() {
		return unitName;
	}

	public int getFactorToBase() {
		return factorToBase;
	}

	public String getGtin() {
		return gtin;
	}

}
