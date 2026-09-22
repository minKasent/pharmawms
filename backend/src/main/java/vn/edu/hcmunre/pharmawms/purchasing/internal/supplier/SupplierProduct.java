package vn.edu.hcmunre.pharmawms.purchasing.internal.supplier;

import java.math.BigDecimal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Commercial terms for buying one product from one supplier, in the product's base unit.
 */
@Entity
@Table(schema = "purchasing", name = "supplier_product")
public class SupplierProduct {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "supplier_id", nullable = false, updatable = false)
	private long supplierId;

	@Column(name = "product_id", nullable = false, updatable = false)
	private long productId;

	@Column(name = "pack_size", nullable = false)
	private long packSize;

	@Column(name = "min_order_quantity", nullable = false)
	private long minOrderQuantity;

	@Column(name = "unit_price", nullable = false)
	private BigDecimal unitPrice;

	@Column(nullable = false)
	private boolean preferred;

	protected SupplierProduct() {
	}

	public SupplierProduct(long supplierId, long productId) {
		this.supplierId = supplierId;
		this.productId = productId;
	}

	public void updateTerms(long packSize, long minOrderQuantity, BigDecimal unitPrice, boolean preferred) {
		this.packSize = packSize;
		this.minOrderQuantity = minOrderQuantity;
		this.unitPrice = unitPrice;
		this.preferred = preferred;
	}

	public Long getId() {
		return id;
	}

	public long getSupplierId() {
		return supplierId;
	}

	public long getProductId() {
		return productId;
	}

	public long getPackSize() {
		return packSize;
	}

	public long getMinOrderQuantity() {
		return minOrderQuantity;
	}

	public BigDecimal getUnitPrice() {
		return unitPrice;
	}

	public boolean isPreferred() {
		return preferred;
	}

}
