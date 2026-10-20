package vn.edu.hcmunre.pharmawms.purchasing.internal.order;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public final class PurchaseOrderViews {

	private PurchaseOrderViews() {
	}

	public record PurchaseOrderView(long id, String code, long supplierId, String supplierName,
			PurchaseOrderStatus status, PurchaseOrderSource source, String note, long createdBy, String createdByName,
			Instant createdAt, Instant submittedAt, String approvedByName, Instant approvedAt, String rejectionReason,
			Instant sentAt, Instant firstReceivedAt, Instant completedAt, long version, BigDecimal totalAmount,
			List<LineView> lines, List<EventView> events) {
	}

	public record LineView(long productId, String sku, String productName, String baseUnit, long quantity,
			long receivedQuantity, long remainingQuantity, BigDecimal unitPrice, BigDecimal lineTotal,
			Long suggestionId) {
	}

	public record EventView(PurchaseOrderStatus fromStatus, PurchaseOrderStatus toStatus, String performedByName,
			Instant occurredAt, String note) {
	}

	public record PurchaseOrderSummary(long id, String code, long supplierId, String supplierName,
			PurchaseOrderStatus status, PurchaseOrderSource source, Instant createdAt, String createdByName,
			int lineCount, BigDecimal totalAmount) {
	}

}
