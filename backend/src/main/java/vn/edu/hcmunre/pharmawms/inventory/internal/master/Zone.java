package vn.edu.hcmunre.pharmawms.inventory.internal.master;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import vn.edu.hcmunre.pharmawms.catalog.StorageCondition;

@Entity
@Table(schema = "inventory", name = "zone")
public class Zone {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "warehouse_id", nullable = false)
	private long warehouseId;

	@Column(nullable = false)
	private String code;

	@Column(nullable = false)
	private String name;

	@Enumerated(EnumType.STRING)
	@Column(name = "storage_condition", nullable = false)
	private StorageCondition storageCondition;

	protected Zone() {
	}

	public Zone(long warehouseId, String code, String name, StorageCondition storageCondition) {
		this.warehouseId = warehouseId;
		this.code = code;
		this.name = name;
		this.storageCondition = storageCondition;
	}

	public Long getId() {
		return id;
	}

	public long getWarehouseId() {
		return warehouseId;
	}

	public String getCode() {
		return code;
	}

	public String getName() {
		return name;
	}

	public StorageCondition getStorageCondition() {
		return storageCondition;
	}

}
