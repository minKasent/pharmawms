package vn.edu.hcmunre.pharmawms.purchasing.internal.order;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Append-only audit trail of order status changes.
 */
@Entity
@Table(schema = "purchasing", name = "purchase_order_event")
public class PurchaseOrderEvent {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "purchase_order_id", nullable = false, updatable = false)
	private long purchaseOrderId;

	@Enumerated(EnumType.STRING)
	@Column(name = "from_status", updatable = false)
	private PurchaseOrderStatus fromStatus;

	@Enumerated(EnumType.STRING)
	@Column(name = "to_status", nullable = false, updatable = false)
	private PurchaseOrderStatus toStatus;

	@Column(name = "performed_by", nullable = false, updatable = false)
	private long performedBy;

	@Column(name = "occurred_at", nullable = false, updatable = false)
	private Instant occurredAt;

	@Column(updatable = false)
	private String note;

	protected PurchaseOrderEvent() {
	}

	public PurchaseOrderEvent(long purchaseOrderId, PurchaseOrderStatus fromStatus, PurchaseOrderStatus toStatus,
			long performedBy, Instant occurredAt, String note) {
		this.purchaseOrderId = purchaseOrderId;
		this.fromStatus = fromStatus;
		this.toStatus = toStatus;
		this.performedBy = performedBy;
		this.occurredAt = occurredAt;
		this.note = note;
	}

	public PurchaseOrderStatus getFromStatus() {
		return fromStatus;
	}

	public PurchaseOrderStatus getToStatus() {
		return toStatus;
	}

	public long getPerformedBy() {
		return performedBy;
	}

	public Instant getOccurredAt() {
		return occurredAt;
	}

	public String getNote() {
		return note;
	}

}
