package vn.edu.hcmunre.pharmawms.iam;

/**
 * Fine-grained authorities carried in the access token. Endpoints check permissions, not roles.
 */
public enum Permission {

	USER_MANAGE,
	CATALOG_READ,
	CATALOG_MANAGE,
	WAREHOUSE_MANAGE,
	STOCK_READ,
	STOCK_RECEIVE,
	STOCK_ISSUE,
	STOCK_COUNT,
	STOCK_ADJUST_APPROVE,
	BATCH_HOLD,
	STOCK_DISPOSE,
	FORECAST_READ,
	FORECAST_RUN,
	SUPPLIER_MANAGE,
	PURCHASE_ORDER_READ,
	PURCHASE_ORDER_MANAGE,
	PURCHASE_ORDER_APPROVE,
	DASHBOARD_READ

}
