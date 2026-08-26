package vn.edu.hcmunre.pharmawms.iam;

import static vn.edu.hcmunre.pharmawms.iam.Permission.*;

import java.util.EnumSet;
import java.util.Set;

public enum Role {

	ADMIN("Quản trị hệ thống", EnumSet.of(USER_MANAGE, CATALOG_READ, CATALOG_MANAGE, WAREHOUSE_MANAGE, STOCK_READ,
			FORECAST_READ, PURCHASE_ORDER_READ, SUPPLIER_MANAGE, DASHBOARD_READ)),

	PHARMACIST_MANAGER("Dược sĩ phụ trách", EnumSet.of(CATALOG_READ, CATALOG_MANAGE, WAREHOUSE_MANAGE, STOCK_READ,
			STOCK_RECEIVE, STOCK_ISSUE, STOCK_COUNT, STOCK_ADJUST_APPROVE, BATCH_HOLD, STOCK_DISPOSE, FORECAST_READ,
			FORECAST_RUN, PURCHASE_ORDER_READ, PURCHASE_ORDER_APPROVE, DASHBOARD_READ)),

	STOREKEEPER("Thủ kho", EnumSet.of(CATALOG_READ, STOCK_READ, STOCK_RECEIVE, STOCK_ISSUE, STOCK_COUNT,
			PURCHASE_ORDER_READ, DASHBOARD_READ)),

	PURCHASER("Nhân viên mua hàng", EnumSet.of(CATALOG_READ, STOCK_READ, FORECAST_READ, FORECAST_RUN, SUPPLIER_MANAGE,
			PURCHASE_ORDER_READ, PURCHASE_ORDER_MANAGE, DASHBOARD_READ));

	private final String displayName;
	private final Set<Permission> permissions;

	Role(String displayName, Set<Permission> permissions) {
		this.displayName = displayName;
		this.permissions = Set.copyOf(permissions);
	}

	public String displayName() {
		return displayName;
	}

	public Set<Permission> permissions() {
		return permissions;
	}

}
