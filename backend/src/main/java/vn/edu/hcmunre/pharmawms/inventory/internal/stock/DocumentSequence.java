package vn.edu.hcmunre.pharmawms.inventory.internal.stock;

public enum DocumentSequence {

	GOODS_RECEIPT("PN", "inventory.goods_receipt_code_seq"),
	GOODS_ISSUE("PX", "inventory.goods_issue_code_seq"),
	STOCK_TAKE("KK", "inventory.stock_take_code_seq"),
	DISPOSAL("HUY", "inventory.disposal_code_seq");

	private final String prefix;
	private final String sequenceName;

	DocumentSequence(String prefix, String sequenceName) {
		this.prefix = prefix;
		this.sequenceName = sequenceName;
	}

	public String prefix() {
		return prefix;
	}

	String sequenceName() {
		return sequenceName;
	}

}
