package vn.edu.hcmunre.pharmawms.catalog.internal.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import vn.edu.hcmunre.pharmawms.catalog.StorageCondition;

@Entity
@Table(schema = "catalog", name = "product")
public class Product {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, unique = true, updatable = false)
	private String sku;

	@Column(nullable = false)
	private String name;

	@Column(name = "active_ingredient", nullable = false)
	private String activeIngredient;

	private String strength;

	@Column(name = "dosage_form")
	private String dosageForm;

	@Column(name = "registration_number")
	private String registrationNumber;

	private String manufacturer;

	@Column(name = "atc_code")
	private String atcCode;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "category_id")
	private Category category;

	@Enumerated(EnumType.STRING)
	@Column(name = "storage_condition", nullable = false)
	private StorageCondition storageCondition;

	@Column(name = "prescription_required", nullable = false)
	private boolean prescriptionRequired;

	@Column(name = "base_unit", nullable = false, updatable = false)
	private String baseUnit;

	@Column(name = "min_shelf_life_on_receipt_days", nullable = false)
	private int minShelfLifeOnReceiptDays;

	@Column(name = "reference_unit_cost", nullable = false)
	private BigDecimal referenceUnitCost;

	@Column(nullable = false)
	private boolean active;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	@Version
	private long version;

	@OneToMany(cascade = CascadeType.ALL, orphanRemoval = true)
	@JoinColumn(name = "product_id", nullable = false)
	@OrderBy("factorToBase ASC")
	private List<ProductUnit> units = new ArrayList<>();

	protected Product() {
	}

	public Product(String sku, ProductDetails details, Category category, Instant now) {
		this.sku = sku;
		this.baseUnit = details.baseUnit();
		this.active = true;
		this.createdAt = now;
		apply(details, category, now);
	}

	public void update(ProductDetails details, Category category, Instant now) {
		apply(details, category, now);
	}

	public void setActive(boolean active, Instant now) {
		this.active = active;
		this.updatedAt = now;
	}

	/**
	 * Merges the packaging hierarchy by unit name. Units are updated in place rather than
	 * deleted and re-inserted because Hibernate flushes inserts before deletes, which would
	 * violate the (product_id, unit_name) unique constraint. The base unit (factor 1) is always kept.
	 */
	public void replaceUnits(List<UnitDefinition> packagings) {
		String baseUnitGtin = packagings.stream()
			.filter(unit -> unit.unitName().equals(baseUnit))
			.map(UnitDefinition::gtin)
			.filter(java.util.Objects::nonNull)
			.findFirst()
			.orElse(null);
		Map<String, UnitDefinition> desired = new LinkedHashMap<>();
		desired.put(baseUnit, new UnitDefinition(baseUnit, 1, baseUnitGtin));
		packagings.stream()
			.filter(unit -> !unit.unitName().equals(baseUnit))
			.forEach(unit -> desired.putIfAbsent(unit.unitName(), unit));

		units.removeIf(unit -> !desired.containsKey(unit.getUnitName()));
		desired.values().forEach(definition -> units.stream()
			.filter(unit -> unit.getUnitName().equals(definition.unitName()))
			.findFirst()
			.ifPresentOrElse(unit -> unit.redefine(definition.factorToBase(), definition.gtin()),
					() -> units.add(new ProductUnit(definition.unitName(), definition.factorToBase(),
							definition.gtin()))));
	}

	public record UnitDefinition(String unitName, int factorToBase, String gtin) {
	}

	private void apply(ProductDetails details, Category category, Instant now) {
		this.name = details.name();
		this.activeIngredient = details.activeIngredient();
		this.strength = details.strength();
		this.dosageForm = details.dosageForm();
		this.registrationNumber = details.registrationNumber();
		this.manufacturer = details.manufacturer();
		this.atcCode = details.atcCode();
		this.category = category;
		this.storageCondition = details.storageCondition();
		this.prescriptionRequired = details.prescriptionRequired();
		this.minShelfLifeOnReceiptDays = details.minShelfLifeOnReceiptDays();
		this.referenceUnitCost = details.referenceUnitCost();
		this.updatedAt = now;
	}

	public Long getId() {
		return id;
	}

	public String getSku() {
		return sku;
	}

	public String getName() {
		return name;
	}

	public String getActiveIngredient() {
		return activeIngredient;
	}

	public String getStrength() {
		return strength;
	}

	public String getDosageForm() {
		return dosageForm;
	}

	public String getRegistrationNumber() {
		return registrationNumber;
	}

	public String getManufacturer() {
		return manufacturer;
	}

	public String getAtcCode() {
		return atcCode;
	}

	public Category getCategory() {
		return category;
	}

	public StorageCondition getStorageCondition() {
		return storageCondition;
	}

	public boolean isPrescriptionRequired() {
		return prescriptionRequired;
	}

	public String getBaseUnit() {
		return baseUnit;
	}

	public int getMinShelfLifeOnReceiptDays() {
		return minShelfLifeOnReceiptDays;
	}

	public BigDecimal getReferenceUnitCost() {
		return referenceUnitCost;
	}

	public boolean isActive() {
		return active;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}

	public long getVersion() {
		return version;
	}

	public List<ProductUnit> getUnits() {
		return Collections.unmodifiableList(units);
	}

}
