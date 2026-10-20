package vn.edu.hcmunre.pharmawms.inventory.internal.master;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(schema = "inventory", name = "location")
public class Location {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "zone_id", nullable = false)
	private long zoneId;

	@Column(nullable = false)
	private String code;

	@Column(nullable = false)
	private boolean active;

	protected Location() {
	}

	public Location(long zoneId, String code) {
		this.zoneId = zoneId;
		this.code = code;
		this.active = true;
	}

	public void setActive(boolean active) {
		this.active = active;
	}

	public Long getId() {
		return id;
	}

	public long getZoneId() {
		return zoneId;
	}

	public String getCode() {
		return code;
	}

	public boolean isActive() {
		return active;
	}

}
