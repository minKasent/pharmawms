package vn.edu.hcmunre.pharmawms.purchasing.internal.order;

public enum PurchaseOrderStatus {

	DRAFT,
	PENDING_APPROVAL,
	APPROVED,
	SENT,
	PARTIALLY_RECEIVED,
	RECEIVED,
	CANCELLED;

	public boolean isTerminal() {
		return this == RECEIVED || this == CANCELLED;
	}

}
