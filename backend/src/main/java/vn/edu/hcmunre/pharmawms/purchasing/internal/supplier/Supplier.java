package vn.edu.hcmunre.pharmawms.purchasing.internal.supplier;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(schema = "purchasing", name = "supplier")
public class Supplier {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, unique = true, updatable = false)
	private String code;

	@Column(nullable = false)
	private String name;

	private String phone;

	private String email;

	private String address;

	@Column(name = "default_lead_time_days", nullable = false)
	private int defaultLeadTimeDays;

	@Column(nullable = false)
	private boolean active;

	protected Supplier() {
	}

	public Supplier(String code, SupplierDetails details) {
		this.code = code;
		this.active = true;
		update(details);
	}

	public void update(SupplierDetails details) {
		this.name = details.name();
		this.phone = details.phone();
		this.email = details.email();
		this.address = details.address();
		this.defaultLeadTimeDays = details.defaultLeadTimeDays();
	}

	public void setActive(boolean active) {
		this.active = active;
	}

	public Long getId() {
		return id;
	}

	public String getCode() {
		return code;
	}

	public String getName() {
		return name;
	}

	public String getPhone() {
		return phone;
	}

	public String getEmail() {
		return email;
	}

	public String getAddress() {
		return address;
	}

	public int getDefaultLeadTimeDays() {
		return defaultLeadTimeDays;
	}

	public boolean isActive() {
		return active;
	}

	public record SupplierDetails(String name, String phone, String email, String address, int defaultLeadTimeDays) {
	}

}
