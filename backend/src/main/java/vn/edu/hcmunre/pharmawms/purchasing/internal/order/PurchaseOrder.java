package vn.edu.hcmunre.pharmawms.purchasing.internal.order;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;

/**
 * Purchase order aggregate and its state machine:
 *
 * <pre>
 * DRAFT -> PENDING_APPROVAL -> APPROVED -> SENT -> PARTIALLY_RECEIVED -> RECEIVED
 *   ^            |  (reject)
 *   +------------+
 * DRAFT | PENDING_APPROVAL | APPROVED | SENT (nothing received) -> CANCELLED
 * PARTIALLY_RECEIVED -> RECEIVED (closed short)
 * </pre>
 *
 * The creator of an order may never approve it (segregation of duties).
 */
@Entity
@Table(schema = "purchasing", name = "purchase_order")
public class PurchaseOrder {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, unique = true, updatable = false)
	private String code;

	@Column(name = "supplier_id", nullable = false, updatable = false)
	private long supplierId;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private PurchaseOrderStatus status;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, updatable = false)
	private PurchaseOrderSource source;

	private String note;

	@Column(name = "created_by", nullable = false, updatable = false)
	private long createdBy;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "submitted_at")
	private Instant submittedAt;

	@Column(name = "approved_by")
	private Long approvedBy;

	@Column(name = "approved_at")
	private Instant approvedAt;

	@Column(name = "rejection_reason")
	private String rejectionReason;

	@Column(name = "sent_at")
	private Instant sentAt;

	@Column(name = "first_received_at")
	private Instant firstReceivedAt;

	@Column(name = "completed_at")
	private Instant completedAt;

	@Version
	private long version;

	@OneToMany(cascade = CascadeType.ALL, orphanRemoval = true)
	@JoinColumn(name = "purchase_order_id", nullable = false)
	@OrderBy("id ASC")
	private List<PurchaseOrderLine> lines = new ArrayList<>();

	protected PurchaseOrder() {
	}

	public PurchaseOrder(String code, long supplierId, PurchaseOrderSource source, String note, long createdBy,
			Instant now) {
		this.code = code;
		this.supplierId = supplierId;
		this.source = source;
		this.note = note;
		this.createdBy = createdBy;
		this.createdAt = now;
		this.status = PurchaseOrderStatus.DRAFT;
	}

	public void replaceLines(List<NewLine> newLines, String note) {
		requireStatus(PurchaseOrderStatus.DRAFT, "sửa");
		long distinctProducts = newLines.stream().map(NewLine::productId).distinct().count();
		if (distinctProducts != newLines.size()) {
			throw BusinessException.unprocessable("DUPLICATE_PRODUCT_LINE", "Mỗi thuốc chỉ được xuất hiện một lần.");
		}
		// Merge by product instead of clear-and-add: Hibernate flushes inserts before deletes,
		// which would violate the (purchase_order_id, product_id) unique constraint.
		lines.removeIf(existing -> newLines.stream().noneMatch(line -> line.productId() == existing.getProductId()));
		for (NewLine line : newLines) {
			lineFor(line.productId()).ifPresentOrElse(
					existing -> existing.redefine(line.quantity(), line.unitPrice(), line.suggestionId()),
					() -> lines.add(new PurchaseOrderLine(line.productId(), line.quantity(), line.unitPrice(),
							line.suggestionId())));
		}
		this.note = note;
	}

	public StatusChange submit(Instant now) {
		requireStatus(PurchaseOrderStatus.DRAFT, "gửi duyệt");
		if (lines.isEmpty()) {
			throw BusinessException.unprocessable("EMPTY_DOCUMENT", "Đơn mua phải có ít nhất một dòng.");
		}
		submittedAt = now;
		rejectionReason = null;
		return moveTo(PurchaseOrderStatus.PENDING_APPROVAL, null);
	}

	public StatusChange approve(long approverId, Instant now) {
		requireStatus(PurchaseOrderStatus.PENDING_APPROVAL, "duyệt");
		if (approverId == createdBy) {
			throw BusinessException.forbidden("SEGREGATION_OF_DUTIES", "Người lập đơn không được tự duyệt đơn của mình.");
		}
		approvedBy = approverId;
		approvedAt = now;
		return moveTo(PurchaseOrderStatus.APPROVED, null);
	}

	public StatusChange reject(String reason) {
		requireStatus(PurchaseOrderStatus.PENDING_APPROVAL, "từ chối");
		rejectionReason = reason;
		return moveTo(PurchaseOrderStatus.DRAFT, reason);
	}

	public StatusChange markSent(Instant now) {
		requireStatus(PurchaseOrderStatus.APPROVED, "gửi nhà cung cấp");
		sentAt = now;
		return moveTo(PurchaseOrderStatus.SENT, null);
	}

	public StatusChange cancel(String reason) {
		boolean cancellable = switch (status) {
			case DRAFT, PENDING_APPROVAL, APPROVED -> true;
			case SENT -> lines.stream().allMatch(line -> line.getReceivedQuantity() == 0);
			default -> false;
		};
		if (!cancellable) {
			throw invalidTransition("hủy");
		}
		return moveTo(PurchaseOrderStatus.CANCELLED, reason);
	}

	/**
	 * Closes a partially received order; the outstanding quantity is no longer expected.
	 */
	public StatusChange closeShort(String reason, Instant now) {
		requireStatus(PurchaseOrderStatus.PARTIALLY_RECEIVED, "đóng");
		completedAt = now;
		return moveTo(PurchaseOrderStatus.RECEIVED, reason);
	}

	/**
	 * Applies received base quantities per product. Over-receipt is rejected.
	 */
	public Optional<StatusChange> receive(Map<Long, Long> receivedByProduct, Instant now) {
		if (status != PurchaseOrderStatus.SENT && status != PurchaseOrderStatus.PARTIALLY_RECEIVED) {
			throw invalidTransition("nhận hàng cho");
		}
		receivedByProduct.forEach((productId, quantity) -> {
			PurchaseOrderLine line = lineFor(productId).orElseThrow(() -> BusinessException.unprocessable(
					"PRODUCT_NOT_IN_ORDER", "Thuốc #%d không có trong đơn %s.".formatted(productId, code)));
			if (quantity > line.remainingQuantity()) {
				throw BusinessException.unprocessable("OVER_RECEIPT",
						"Thuốc #%d: nhận %d vượt số còn lại %d của đơn.".formatted(productId, quantity,
								line.remainingQuantity()),
						Map.of("productId", productId, "remaining", line.remainingQuantity()));
			}
			line.receive(quantity);
		});
		if (firstReceivedAt == null) {
			firstReceivedAt = now;
		}
		boolean complete = lines.stream().allMatch(line -> line.remainingQuantity() == 0);
		PurchaseOrderStatus next = complete ? PurchaseOrderStatus.RECEIVED : PurchaseOrderStatus.PARTIALLY_RECEIVED;
		if (complete) {
			completedAt = now;
		}
		return next == status ? Optional.empty() : Optional.of(moveTo(next, null));
	}

	public Optional<PurchaseOrderLine> lineFor(long productId) {
		return lines.stream().filter(line -> line.getProductId() == productId).findFirst();
	}

	public BigDecimal totalAmount() {
		return lines.stream().map(PurchaseOrderLine::lineTotal).reduce(BigDecimal.ZERO, BigDecimal::add);
	}

	private StatusChange moveTo(PurchaseOrderStatus next, String note) {
		var change = new StatusChange(status, next, note);
		status = next;
		return change;
	}

	private void requireStatus(PurchaseOrderStatus expected, String action) {
		if (status != expected) {
			throw invalidTransition(action);
		}
	}

	private BusinessException invalidTransition(String action) {
		return BusinessException.unprocessable("INVALID_ORDER_TRANSITION",
				"Không thể %s đơn %s đang ở trạng thái %s.".formatted(action, code, status));
	}

	public record NewLine(long productId, long quantity, BigDecimal unitPrice, Long suggestionId) {
	}

	public record StatusChange(PurchaseOrderStatus from, PurchaseOrderStatus to, String note) {
	}

	public Long getId() {
		return id;
	}

	public String getCode() {
		return code;
	}

	public long getSupplierId() {
		return supplierId;
	}

	public PurchaseOrderStatus getStatus() {
		return status;
	}

	public PurchaseOrderSource getSource() {
		return source;
	}

	public String getNote() {
		return note;
	}

	public long getCreatedBy() {
		return createdBy;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getSubmittedAt() {
		return submittedAt;
	}

	public Long getApprovedBy() {
		return approvedBy;
	}

	public Instant getApprovedAt() {
		return approvedAt;
	}

	public String getRejectionReason() {
		return rejectionReason;
	}

	public Instant getSentAt() {
		return sentAt;
	}

	public Instant getFirstReceivedAt() {
		return firstReceivedAt;
	}

	public Instant getCompletedAt() {
		return completedAt;
	}

	public long getVersion() {
		return version;
	}

	public List<PurchaseOrderLine> getLines() {
		return Collections.unmodifiableList(lines);
	}

}
