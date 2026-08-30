package vn.edu.hcmunre.pharmawms.catalog;

/**
 * Storage conditions per GSP. A product may only be put away into a zone with the same condition.
 */
public enum StorageCondition {

	NORMAL("Nhiệt độ thường (15–30°C)"),
	COOL("Mát (8–15°C)"),
	COLD("Lạnh (2–8°C)");

	private final String displayName;

	StorageCondition(String displayName) {
		this.displayName = displayName;
	}

	public String displayName() {
		return displayName;
	}

}
