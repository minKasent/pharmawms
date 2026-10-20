package vn.edu.hcmunre.pharmawms.purchasing.internal.order;

import java.math.BigDecimal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Quantities are in the product's base unit; unit price is per base unit.
 */
@Entity
@Table(schema = "purchasing", name = "purchase_order_line")
public class PurchaseOrderLine {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "product_id", nullable = false)
	private long productId;

	@Column(nullable = false)
	private long quantity;

	@Column(name = "received_quantity", nullable = false)
	private long receivedQuantity;

	@Column(name = "unit_price", nullable = false)
	private BigDecimal unitPrice;

	@Column(name = "suggestion_id")
	private Long suggestionId;

	protected PurchaseOrderLine() {
	}

	PurchaseOrderLine(long productId, long quantity, BigDecimal unitPrice, Long suggestionId) {
		if (quantity <= 0) {
			throw new IllegalArgumentException("Quantity must be positive");
		}
		this.productId = productId;
		this.quantity = quantity;
		this.unitPrice = unitPrice;
		this.suggestionId = suggestionId;
	}

	/**
	 * Edits keep the link to the originating suggestion unless a new one is given, so a planner
	 * adjusting quantities does not orphan the suggestion that the draft fulfils.
	 */
	void redefine(long quantity, BigDecimal unitPrice, Long suggestionId) {
		if (quantity <= 0) {
			throw new IllegalArgumentException("Quantity must be positive");
		}
		this.quantity = quantity;
		this.unitPrice = unitPrice;
		if (suggestionId != null) {
			this.suggestionId = suggestionId;
		}
	}

	void receive(long receivedNow) {
		this.receivedQuantity += receivedNow;
	}

	public long remainingQuantity() {
		return Math.max(0, quantity - receivedQuantity);
	}

	public BigDecimal lineTotal() {
		return unitPrice.multiply(BigDecimal.valueOf(quantity));
	}

	public Long getId() {
		return id;
	}

	public long getProductId() {
		return productId;
	}

	public long getQuantity() {
		return quantity;
	}

	public long getReceivedQuantity() {
		return receivedQuantity;
	}

	public BigDecimal getUnitPrice() {
		return unitPrice;
	}

	public Long getSuggestionId() {
		return suggestionId;
	}

}
